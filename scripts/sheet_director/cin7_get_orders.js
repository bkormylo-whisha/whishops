import { SHEET_SCHEMAS } from "../../util/sheet_schemas.js";
import { sheetExtractor } from "../../util/sheet_extractor.js";
import { sheetInserter } from "../../util/sheet_inserter.js";
import { BigQuery } from "@google-cloud/bigquery";
import delay from "../../util/delay.js";
import dayjs from "dayjs";
import excelDateToTimestamp from "../../util/excel_date_to_timestamp.js";

export const run = async (req, res) => {
	try {
		await cin7GetOrders();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function cin7GetOrders() {
	console.log("Running Script: Cin7 Get Printed Orders");
	const ordersJson = await getOrdersCin7();
	console.log(`Got ${ordersJson.length} printed orders from Cin7`);

	const formattedData = await formatPrintedOrderJson(ordersJson);

	console.log(formattedData.slice(0, 4));
	console.log(
		formattedData.slice(formattedData.lengh - 4, formattedData.length),
	);

	// sendPrintedOrdersToDispatchLog(formattedData);

	// const regionalData = await dividePrintedOrdersByRegion(formattedData);
	// for (const key in regionalData) {
	// 	console.log(`${key}: ${regionalData[key].length}`);
	// 	const regionalSheetInserter = sheetInserter({
	// 		outSheetID: SHEET_SCHEMAS.PRINT_LOG_STAGING.prod_id,
	// 		outSheetName: key,
	// 		outSheetRange: "A2:AD",
	// 		wipePreviousData: true,
	// 	});
	// 	regionalSheetInserter.run(regionalData[key]);
	// }
}

async function getOrdersCin7() {
	const url = "https://api.cin7.com/api/";
	const username = process.env.CIN7_USERNAME;
	const password = process.env.CIN7_PASSWORD;

	let options = {};
	options.headers = {
		Authorization: "Basic " + btoa(username + ":" + password),
	};

	const date = dayjs().subtract(3, "days");
	const formattedDate = date.format("YYYY-MM-DD");

	let page = 1;
	let result = [];
	let hasMorePages = true;
	// const stage = "Printed";
	const stage = "New";
	const rowCount = 250;
	while (hasMorePages) {
		// There are old printed orders left in Cin7, invoiceDate filtering removes them
		const sales_endpoint = `v1/SalesOrders?where=invoiceDate>${formattedDate}T00:00:00Z&order=invoiceDate&page=${page}&rows=250`;
		// const sales_endpoint = `v1/SalesOrders?where=stage='${stage}' AND invoiceDate>${formattedDate}T00:00:00Z&order=invoiceDate&page=${page}&rows=250`;

		try {
			const response = await fetch(`${url}${sales_endpoint}`, options);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const data = await response.json();
			await delay(1000);

			if (data.length > 0) {
				for (let i = 0; i < data.length; i++) {
					const row = data[i];
					if (data.length < rowCount) {
						hasMorePages = false;
						if (data.length <= i) {
							break;
						}
					}
					result.push(row);
				}
				page++;
			} else {
				hasMorePages = false;
			}
		} catch (error) {
			console.error("Failed to fetch data:", error);
			hasMorePages = false;
		}
	}

	return result;
}

async function formatPrintedOrderJson(printedOrderJson) {
	let result = [];

	for (const order of printedOrderJson) {
		const company = `${order.company}`;
		const total = order.total;
		const invoiceNumber = `${order.invoiceNumber}`;
		const reference = order.reference;
		const status = order.status;
		const memeberId = order.memberId;
		const createdDate = dayjs(order.createdDate).format("MM/DD/YY");
		const deliveryInstructions = order.deliveryInstructions;
		const stage = order.stage;
		const invoiceDate = order.invoiceDate;
		const id = order.id;
		const createdBy = order.createdBy;
		const itemQuantity = order.qty;
		const trackingCode = order.trackingCode;
		const internalComments = order.internalComments;
		const branchId = order.branchId;

		result.push([
			company,
			total,
			invoiceNumber,
			reference,
			status,
			memeberId,
			createdDate,
			deliveryInstructions,
			stage,
			invoiceDate,
			id,
			createdBy,
			itemQuantity,
			trackingCode,
			internalComments,
			branchId,
		]);
	}

	return result;
}

async function dividePrintedOrdersByRegion(formattedPrintedOrderJson) {
	let regions = {
		NORCAL: [],
		SOCAL: [],
		PNW: [],
		"ROCKY MOUNTAIN": [],
		TEXAS: [],
		MIDWEST: [],
		"MID-ATLANTIC": [],
		NORTHEAST: [],
		SOUTHEAST: [],
		FLORIDA: [],
		SACRAMENTO: [],
		UNKNOWN: [],
	};

	const masterStoreListData = await getMasterStoreListFromBQ();
	const masterStoreMap = new Map();

	for (const row of masterStoreListData) {
		masterStoreMap.set(row.cin7_name.trim(), {
			region: row.region,
			stop_id: row.stop_id,
		});
	}

	for (const row of formattedPrintedOrderJson) {
		const storeName = row.at(4).trim();
		const storeData = masterStoreMap.get(storeName);
		if (storeData?.region && regions.hasOwnProperty(storeData.region)) {
			row[19] = storeData.stop_id;
			regions[storeData.region].push(row);
		} else {
			console.log(`Missing in Master Store List: ${storeName}`);
			regions.UNKNOWN.push(row);
		}
	}

	return regions;
}

async function getUsernameMapFromCin7() {
	const url = "https://api.cin7.com/api/";
	const username = process.env.CIN7_USERNAME;
	const password = process.env.CIN7_PASSWORD;

	let options = {};
	options.headers = {
		Authorization: "Basic " + btoa(username + ":" + password),
	};

	let result = [];
	const user_endpoint = `v1/Users?fields=id,firstName,lastName,isActive`;

	try {
		const response = await fetch(`${url}${user_endpoint}`, options);
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const data = await response.json();
		await delay(1000);

		for (let i = 0; i < data.length; i++) {
			const row = data[i];
			result.push(row);
		}
	} catch (error) {
		console.error("Failed to fetch data:", error);
	}

	const nameMap = new Map();
	for (const user of result) {
		const fullName = `${user.firstName} ${user.lastName}`;
		nameMap.set(user.id, fullName);
	}

	return nameMap;
}

async function getMasterStoreListFromBQ() {
	try {
		const bigquery = new BigQuery();
		const query = `
			SELECT cin7_name, region, stop_id
			FROM \`whishops.order_management.master-store-list\`
		`;

		console.log("Executing query");
		const [rows] = await bigquery.query(query);

		return rows;
	} catch (error) {
		console.error("Error during BigQuery API call:", error);
		throw error;
	}
}

async function getDolMap() {
	const dolSheetExtractor = sheetExtractor({
		functionName: "Cin7 Status Update",
		inSheetID: SHEET_SCHEMAS.WHISHACCEL_NORCAL_ORDER_MANAGEMENT.prod_id,
		inSheetName:
			SHEET_SCHEMAS.WHISHACCEL_NORCAL_ORDER_MANAGEMENT.pages
				.rtg_direct_order_log,
		inSheetRange: "A1:AB",
	});

	const directOrderLogData = await dolSheetExtractor.run();

	console.log(`Got rows from DOL: ${directOrderLogData.length}`);
	// row.at(21) is Dispatch Date, row.at(11) is Cin7 Order ID

	const filteredData = directOrderLogData.filter((row) => row.at(11) !== "");
	console.log(`Found items: ${filteredData.length}`);

	const result = new Map();

	for (const row of filteredData) {
		const invoiceNumber = `${row.at(2)}`;
		const orderNotes = row.at(7);
		const currentRep = row.at(16);
		const dispatchDate = excelDateToTimestamp(
			isNaN(row.at(21)) ? 0 : row.at(21),
		);

		const data = {
			orderNotes: orderNotes,
			currentRep: currentRep,
			dispatchDate: dispatchDate,
		};

		result.set(invoiceNumber, data);
	}

	return result;
}

// Mismarked in Cin7
// Gelson's - La Canada
// Other Gelson's have (#) appended in Cin7 but not MSL

// Missing from master store list
// Cash Customer
// Safeway 3727 (exists as Safeway - 3727)
// Target - 949 (exists as Target - 0949)
// Sprouts - 186 (No stopID? not in MSL)
// Sprouts - 607 (No stopID, not in MSL)
// Sprouts - 670 (No stopID, not in MSL)
