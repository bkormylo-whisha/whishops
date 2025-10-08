import { SHEET_SCHEMAS } from "../../util/sheet_schemas.js";
import { sheetExtractor } from "../../util/sheet_extractor.js";
import { sheetInserter } from "../../util/sheet_inserter.js";
import { BigQuery } from "@google-cloud/bigquery";
import delay from "../../util/delay.js";
import dayjs from "dayjs";

export const run = async (req, res) => {
	try {
		await cin7GetPrintedOrders();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function cin7GetPrintedOrders() {
	console.log("Running Script: Cin7 Get Printed Orders");
	const printedOrdersJson = await getPrintedOrdersCin7();
	const formattedData = await formatPrintedOrderJson(printedOrdersJson);

	console.log(`Got ${formattedData.length} printed orders from Cin7`);

	// sendPrintedOrdersToDispatchLog(formattedData);

	const regionalData = await dividePrintedOrdersByRegion(formattedData);
	for (const key in regionalData) {
		console.log(`${key}: ${regionalData[key].length}`);
		const regionalSheetInserter = sheetInserter({
			outSheetID: SHEET_SCHEMAS.PRINT_LOG_STAGING.prod_id,
			outSheetName: key,
			outSheetRange: "A2",
			wipePreviousData: true,
		});
		regionalSheetInserter.run(regionalData[key]);
	}
}

async function sendPrintedOrdersToDispatchLog(printedOrders) {
	const dispatchLogSheetExtractor = sheetExtractor({
		inSheetID: SHEET_SCHEMAS.WHISHACCEL_SACRAMENTO_DISPATCH.prod_id,
		inSheetName:
			SHEET_SCHEMAS.WHISHACCEL_SACRAMENTO_DISPATCH.pages.whs_dispatch_log,
		inSheetRange: "B11:H500",
	});

	const prevOrderData = await dispatchLogSheetExtractor.run();
	const prevOrders = prevOrderData.filter(
		(row) => row.at(0) && row.at(0) !== "",
	);

	const dispatchLogSheetInserter = sheetInserter({
		outSheetID: SHEET_SCHEMAS.WHISHACCEL_SACRAMENTO_DISPATCH.prod_id,
		outSheetName:
			SHEET_SCHEMAS.WHISHACCEL_SACRAMENTO_DISPATCH.pages.whs_dispatch_log,
		outSheetRange: "B11:H",
		wipePreviousData: true,
	});

	const allOrders = [...prevOrders, ...printedOrders];
	await dispatchLogSheetInserter.run(allOrders);
}

async function getPrintedOrdersCin7() {
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
		const user_endpoint = `v1/SalesOrders?where=stage='${stage}' AND invoiceDate>${formattedDate}T00:00:00Z&order=invoiceDate&page=${page}&rows=250`;

		try {
			const response = await fetch(`${url}${user_endpoint}`, options);
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
	const date = dayjs();
	for (const order of printedOrderJson) {
		const createdDate = `${order.createdDate}`;
		const dispatchDate = `${order.dispatchedDate}`;
		const createdBy = `${order.createdBy}`;
		const invoiceNumber = `${order.invoiceNumber}`;
		const storeName = `${order.company}`;
		const plTimestamp = date.format("YYYY-MM-DD HH:mm A");
		const originalRep = `${order.trackingCode}`;

		result.push([
			createdDate,
			dispatchDate,
			createdBy,
			invoiceNumber,
			storeName,
			plTimestamp,
			originalRep,
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
		masterStoreMap.set(row.cin7_name.trim(), row.region);
		// masterStoreMap.set(row.cin7_name.split("(").at(0).trim(), row.region);
		// masterStoreMap.set(row.cin7_name.replace(/\s/g, ""), row.region);
	}

	for (const row of formattedPrintedOrderJson) {
		// const storeName = row.at(4).split("(").at(0).trim();
		const storeName = row.at(4).trim();
		const region = masterStoreMap.get(storeName);
		if (region && regions.hasOwnProperty(region)) {
			regions[region].push(row);
		} else {
			console.log(`Missing in Master Store List: ${storeName}`);
			// console.warn(
			// 	`Order for store ${storeName} could not be mapped to a valid region. Region value found: ${region}`,
			// );
			regions.UNKNOWN.push(row);
		}
	}

	return regions;
}

async function getMasterStoreListFromBQ() {
	try {
		const bigquery = new BigQuery();
		const query = `
			SELECT cin7_name, region
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
