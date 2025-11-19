import { SHEET_SCHEMAS } from "../../util/sheet_schemas.js";
import { sheetExtractor } from "../../util/sheet_extractor.js";
import { sheetInserter } from "../../util/sheet_inserter.js";
import getUsernameMapFromCin7 from "../../util/cin7/get_username_map.js";
import { BigQuery } from "@google-cloud/bigquery";
import delay from "../../util/delay.js";
import dayjs from "dayjs";
import excelDateToTimestamp from "../../util/excel_date_to_timestamp.js";

export const run = async (req, res) => {
	try {
		await generatePrintLog();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function generatePrintLog() {
	console.log("Running Script: Cin7 Get Printed Orders");
	const printedOrdersJson = await getPrintedOrdersCin7();
	console.log(`Got ${printedOrdersJson.length} printed orders from Cin7`);

	const formattedData = await formatPrintedOrderJson(printedOrdersJson);

	// sendPrintedOrdersToDispatchLog(formattedData);

	const regionalData = await dividePrintedOrdersByRegion(formattedData);
	for (const key in regionalData) {
		console.log(`${key}: ${regionalData[key].length}`);
		const regionalSheetInserter = sheetInserter({
			outSheetID: SHEET_SCHEMAS.PRINT_LOG_STAGING.prod_id,
			outSheetName: key,
			outSheetRange: "A2:AD",
			wipePreviousData: true,
		});
		regionalSheetInserter.run(regionalData[key]);
	}
}

// async function sendPrintedOrdersToDispatchLog(printedOrders) {
// 	const dispatchLogSheetExtractor = sheetExtractor({
// 		inSheetID: SHEET_SCHEMAS.WHISHACCEL_SACRAMENTO_DISPATCH.prod_id,
// 		inSheetName:
// 			SHEET_SCHEMAS.WHISHACCEL_SACRAMENTO_DISPATCH.pages.whs_dispatch_log,
// 		inSheetRange: "B11:H500",
// 	});

// 	const prevOrderData = await dispatchLogSheetExtractor.run();
// 	const prevOrders = prevOrderData.filter(
// 		(row) => row.at(0) && row.at(0) !== "",
// 	);

// 	const dispatchLogSheetInserter = sheetInserter({
// 		outSheetID: SHEET_SCHEMAS.WHISHACCEL_SACRAMENTO_DISPATCH.prod_id,
// 		outSheetName:
// 			SHEET_SCHEMAS.WHISHACCEL_SACRAMENTO_DISPATCH.pages.whs_dispatch_log,
// 		outSheetRange: "B11:H",
// 		wipePreviousData: true,
// 	});

// 	const allOrders = [...prevOrders, ...printedOrders];
// 	await dispatchLogSheetInserter.run(allOrders);
// }

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
	const date = dayjs();
	const userMap = await getUsernameMapFromCin7();

	const dolMap = await getDolMap();

	for (const order of printedOrderJson) {
		const createdDate = dayjs(order.createdDate).format("MM/DD/YY");
		const dispatchDate = dayjs(order.dispatchedDate).format("MM/DD/YY");
		const createdBy = userMap.get(order.createdBy); // Each code references a name, need those
		const invoiceNumber = `${order.invoiceNumber}`;
		const dolData = dolMap.get(invoiceNumber);
		const storeName = `${order.company}`;
		const plTimestamp = date.format("HH:mm A");
		const originalRep = `${order.trackingCode ?? ""}`;
		const currentRep = dolData?.currentRep ?? "";
		const warehouseNotes = "";
		const orderAmount = order.total.toFixed(2);
		const dispatchHistory = "";
		const assignee = "";
		const stage = "";
		let cin7Status = ""; // Comes from Submit Directs and needs more info
		if (order.status === "VOID") {
			cin7Status = "Void";
		} else if (order.stage === "Dispatched") {
			cin7Status = "Dispatched";
		} else if (order.stage === "Recieved") {
			cin7Status = "Yes";
		} else {
			cin7Status = order.status.at(0) + order.status.slice(1).toLowerCase();
		}
		const orderLogStatus = "";
		const packOrder = "";
		const mon = `${order.invoiceNumber}`;
		const prepack = "";
		const deliveryDate = dayjs(order.invoiceDate).format("MM/DD/YY"); // Switch to ETD later
		const stopID = "";
		const units = order.lineItems.reduce((acc, curr) => acc + curr.qty, 0);
		const bo = "";
		const trackingCode = "";
		const possibleDuplicate = "";
		const doshitNotes = `${dolData?.orderNotes ?? ""}`;
		const doshitDispatchDate = `${dolData?.dispatchDate === "NaN" ? "" : dolData?.dispatchDate}`;
		const region = "";

		result.push([
			createdDate,
			dispatchDate,
			createdBy,
			invoiceNumber,
			storeName,
			plTimestamp,
			originalRep,
			currentRep,
			warehouseNotes,
			orderAmount,
			dispatchHistory,
			assignee,
			stage,
			cin7Status,
			orderLogStatus,
			packOrder,
			mon,
			prepack,
			deliveryDate,
			stopID,
			units,
			bo,
			trackingCode,
			possibleDuplicate,
			doshitNotes,
			doshitDispatchDate,
			region,
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
