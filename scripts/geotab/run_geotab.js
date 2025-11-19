import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import { sheetInserter } from "../../util/sheet_inserter.js";
import { sheetExtractor } from "../../util/sheet_extractor.js";

dayjs.extend(utc);

// Has a bunch of sample calls from testing GEOTAB API,
// Tanner might use this once in awhile to check driver status
export const run = async (req, res) => {
	try {
		await runGeotab();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function runGeotab() {
	const newGeotabConnector = geotabConnector();
	await newGeotabConnector.authenticate();
	const devices = await newGeotabConnector.getDevices();
	const deviceMap = new Map();
	for (const device of devices) {
		deviceMap.set(device.id, device.vehicleIdentificationNumber);
	}

	const masterVehicleList = await fetchDataFromMasterVehicleList();
	const mvlMap = new Map();
	for (const vehicle of masterVehicleList) {
		if (`${vehicle.at(-1)}`.length !== 17) {
			continue;
		}
		mvlMap.set(vehicle.at(-1), {
			rep: vehicle.at(0),
			region: `${vehicle.at(3)}`.toUpperCase(),
		});
	}

	let formattedData = [];

	const deviceStatuses = await newGeotabConnector.getDeviceStatus();
	for (const status of deviceStatuses) {
		const id = status.device.id;
		if (!id) {
			continue;
		}
		const vin = deviceMap.get(id);
		if (!vin) {
			continue;
		}
		const mvlData = mvlMap.get(vin);
		if (!mvlData) {
			continue;
		}

		let isInactive = false;
		const currentDateTime = dayjs().utc();
		if (currentDateTime.diff(dayjs(status.dateTime).utc(), "minute") > 30) {
			isInactive = true;
		}

		const formattedDate = dayjs(status.dateTime)
			.utc()
			.local()
			.format("YYYY-MM-DD hh:mm a");

		formattedData.push([
			id,
			vin,
			mvlData.rep ?? "Not Assigned",
			mvlData.region,
			formattedDate,
			isInactive,
		]);
	}
	// await newGeotabConnector.getStatusData(); // Useless
	// await newGeotabConnector.getRule(); // Useless
	// await newGeotabConnector.getUser();
	// await newGeotabConnector.getTrip();
	// await newGeotabConnector.getZone(); // Empty
	// await newGeotabConnector.getGroup();
	// await newGeotabConnector.getLogRecord();
	await sendDeviceStatusToSheet(formattedData);
}

function geotabConnector() {
	let sessionToken;
	const authenticateHost = "my.geotab.com";
	const database = "whisha";
	const userName = process.env.GEOTAB_USERNAME;
	const password = process.env.GEOTAB_PASSWORD;
	async function authenticate() {
		let loginResult = await call(authenticateHost, "Authenticate", {
			userName: userName,
			password: password,
			database: database,
		});
		sessionToken = loginResult.credentials.sessionId;
	}

	async function getDevices() {
		let result = await call(authenticateHost, "Get", {
			typeName: "Device",
			propertySelector: {
				fields: [
					"isActiveTrackingEnabled",
					"activeFrom",
					"activeTo",
					"fuelTankCapacity",
					"licensePlate",
					"vehicleIdentificationNumber",
					"timeZoneId",
					"id",
					"name",
					"serialNumber",
				],
				isIncluded: true,
			},
			credentials: {
				database: database,
				sessionId: sessionToken,
				userName: userName,
			},
		});
		return result;
	}

	async function getDeviceStatus() {
		let result = await call(authenticateHost, "Get", {
			typeName: "DeviceStatusInfo",
			propertySelector: {
				fields: [
					"bearing",
					"currentStateDuration",
					"isDeviceCommunicating",
					"isDriving",
					"latitude",
					"longitude",
					"speed",
					"dateTime",
					"device",
					"driver",
				],
				isIncluded: true,
			},
			credentials: {
				database: database,
				sessionId: sessionToken,
				userName: userName,
			},
		});
		return result;
	}

	async function getStatusData() {
		const now = dayjs().utc();
		const oneWeekAgo = now.subtract(7, "day");
		let result = await call(authenticateHost, "Get", {
			typeName: "StatusData",
			search: {
				// deviceSearch: {
				// 	id: "{{deviceId}}",
				// },
				// diagnosticSearch: {
				// 	id: "{{diagnosticId}}",
				// },
				fromDate: oneWeekAgo.toISOString(),
				toDate: now.toISOString(),
			},
			credentials: {
				database: database,
				sessionId: sessionToken,
				userName: userName,
			},
		});
	}

	async function getRule() {
		let result = await call(authenticateHost, "Get", {
			typeName: "Rule",
			propertySelector: {
				fields: ["id", "name"],
				isIncluded: true,
			},
			credentials: {
				database: database,
				sessionId: sessionToken,
				userName: userName,
			},
		});
	}

	async function getUser() {
		let result = await call(authenticateHost, "Get", {
			typeName: "User",
			propertySelector: {
				fields: [
					"phoneNumber",
					"displayCurrency",
					"countryCode",
					"designation",
					"employeeNo",
					"firstName",
					"id",
					"language",
					"lastName",
					"name",
					"securityGroups",
					"timeZoneId",
					"lastAccessDate",
					"isDriver",
				],
				isIncluded: "True",
			},
			credentials: {
				database: database,
				sessionId: sessionToken,
				userName: userName,
			},
		});
	}

	async function getTrip() {
		const now = dayjs().utc();
		const oneWeekAgo = now.subtract(7, "day");
		let result = await call(authenticateHost, "Get", {
			typeName: "Trip",
			search: {
				// deviceSearch: {
				// 	id: "{{deviceId}}",
				// },
				fromDate: oneWeekAgo.toISOString(),
				toDate: now.toISOString(),
			},
			propertySelector: {
				fields: [
					"averageSpeed",
					"distance",
					"drivingDuration",
					"idlingDuration",
					"maximumSpeed",
					"nextTripStart",
					"start",
					"stop",
					"stopDuration",
					"stopPoint",
					"device",
					"driver",
				],
				isIncluded: true,
			},
			credentials: {
				database: database,
				sessionId: sessionToken,
				userName: userName,
			},
		});
	}

	async function getZone() {
		let result = await call(authenticateHost, "Get", {
			typeName: "Zone",
			credentials: {
				database: database,
				sessionId: sessionToken,
				userName: userName,
			},
		});
	}

	async function getGroup() {
		let result = await call(authenticateHost, "Get", {
			typeName: "Group",
			propertySelector: {
				fields: ["id", "name"],
				isIncluded: true,
			},
			credentials: {
				database: database,
				sessionId: sessionToken,
				userName: userName,
			},
		});
	}

	async function getLogRecord() {
		const now = dayjs().utc();
		const oneWeekAgo = now.subtract(7, "day");
		let result = await call(authenticateHost, "Get", {
			typeName: "LogRecord",
			search: {
				// deviceSearch: {
				// 	id: "{{deviceId}}",
				// },
				fromDate: oneWeekAgo.toISOString(),
				toDate: now.toISOString(),
			},
			propertySelector: {
				fields: ["device", "latitude", "longitude", "speed", "dateTime"],
				isIncluded: true,
			},
			credentials: {
				database: database,
				sessionId: sessionToken,
				userName: userName,
			},
		});
	}

	return Object.freeze({
		authenticate: authenticate,
		getDevices: getDevices,
		getDeviceStatus: getDeviceStatus,
		getStatusData: getStatusData,
		getRule: getRule,
		getUser: getUser,
		getTrip: getTrip,
		getZone: getZone,
		getGroup: getGroup,
		getLogRecord: getLogRecord,
		run: run,
	});
}

async function call(host, method, data) {
	const url = `https://${host}/apiv1`;

	const rpcData = JSON.stringify({
		method: method,
		params: data,
	});

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "no-cache",
			},
			body: rpcData,
		});

		if (!response.ok) {
			throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
		}

		const jsonRpcResponse = await response.json();

		if (jsonRpcResponse.error) {
			throw new Error(
				`${jsonRpcResponse.error.data?.type || "RPC Error"}: ${jsonRpcResponse.error.message}`,
			);
		}

		return jsonRpcResponse.result;
	} catch (error) {
		console.error("RPC Call Failed:", error);
		throw error;
	}
}

async function fetchDataFromMasterVehicleList() {
	const masterVehicleListExtractor = sheetExtractor({
		inSheetID: "1EGI_EeKPH6Yq6jaaWdvLhfCM1x18yDnRBylKVVzrj4A",
		inSheetName: "Master Vehicle List",
		inSheetRange: "B4:R",
		silent: true,
	});

	const masterVehicleList = await masterVehicleListExtractor.run();
	return masterVehicleList;
}

async function sendDeviceStatusToSheet(fetchedStatuses) {
	const deviceStatusSheetInserter = sheetInserter({
		outSheetID: "1sb4JzHRAvdXkRhPZeGuZ00731du6K4O4Vdxf86WJZKg",
		outSheetName: "ActiveLog",
		outSheetRange: "A2:F",
		wipePreviousData: true,
		silent: true,
	});

	await deviceStatusSheetInserter.run(fetchedStatuses);
}
