import { SHEET_SCHEMAS } from "../util/sheet_schemas.js";
import { BigQuery } from "@google-cloud/bigquery";
import { google } from "googleapis";
import getAuthenticatedClient from "../util/sheet_auth.js";
import convertSheetDataToJson from "../util/convert_sheet_data_to_json.js";

export const run = async (req, res) => {
	try {
		await uploadRoutesToOptimo();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function uploadRoutesToOptimo() {
	console.log(`Running script: Upload Routes To Optimo`);

	const weeklyCoverageData = await getWeeklyCoverage();
	await buildOptimoUploadTable(weeklyCoverageData);

	console.log("Script run complete");
}

async function getWeeklyCoverage() {
	const auth = await getAuthenticatedClient();
	const sheets = google.sheets({ version: "v4", auth });

	const weeklyCoverageID = SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.prod_id;
	const weeklyCoverageName =
		SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.pages.rtg_weekly_coverage;

	const weeklyCoverageRanges = {
		monday: "DX3:EF",
		tuesday: "EG3:EO",
		wednesday: "EP3:EX",
		thursday: "EY3:FG",
		friday: "FH3:FP",
		saturday: "FQ3:FY",
	};
	const dayNames = [
		"sunday",
		"monday",
		"tuesday",
		"wednesday",
		"thursday",
		"friday",
		"saturday",
	];

	const today = new Date();
	const currentDayIndex = today.getDay();

	let daysToAdd = 1;
	if (currentDayIndex === 5) {
		daysToAdd = 3;
	} else if (currentDayIndex === 6) {
		daysToAdd = 2;
	}

	const nextBusinessDay = new Date(today);
	nextBusinessDay.setDate(today.getDate() + daysToAdd);

	let nextDayIndex = nextBusinessDay.getDay();

	const nextDayName = dayNames[nextDayIndex];
	const weeklyCoverageRange = weeklyCoverageRanges[nextDayName];

	console.log("Getting initial data from Weekly Coverage");
	let weeklyCoverageData = [[]];

	try {
		const getResponse = await sheets.spreadsheets.values.get({
			spreadsheetId: weeklyCoverageID,
			range: `${weeklyCoverageName}!${weeklyCoverageRange}`,
			valueRenderOption: "UNFORMATTED_VALUE",
		});

		weeklyCoverageData = getResponse.data.values;
		if (!weeklyCoverageData) {
			weeklyCoverageData = [[]];
		}

		console.log("Retrieved data successfully");
	} catch (e) {
		console.error("Error during sheet operation:", e);
		throw e;
	}

	return {
		data: convertSheetDataToJson(weeklyCoverageData),
		date: nextBusinessDay,
	};
}

async function getMasterStoreListMapFromBQ() {
	try {
		const bigquery = new BigQuery();
		const query = `
			SELECT *
			FROM \`whishops.order_management.master-store-list\`
		`;

		console.log("Executing query");
		const [rows] = await bigquery.query(query);

		const storeMap = new Map();
		for (const row of rows) {
			storeMap.set(row.stop_id, row);
		}
		return storeMap;
	} catch (error) {
		console.error("Error during BigQuery API call:", error);
		throw error;
	}
}

async function buildOptimoUploadTable(weeklyCoverage) {
	const headers = [
		"Order Type",
		"Order ID",
		"Date",
		"Address",
		"Location ID",
		"Location Name",
		"Duration",
		"Time Windows",
		"TW from",
		"TW to",
		"Notes (PASTE VALUES!!!)",
		"Write Order with Cin7",
		"Whisha Product Cheat Sheet",
		"INVENTORY COUNT LINK",
		"Assigned to Driver",
		"Invoice Number",
		"Scan Issue Reporting",
		"Target PO",
		"QC Link",
		"Priority",
	];

	let formattedData = [];

	const storeMap = await getMasterStoreListMapFromBQ();

	// The range will change based on the day of the week it is
	// Master Store List gets used to generate start time and notes
	// Find the date in row 2, then get the data from that chunk
	// Weekly Coverage pull will take the Stop Type, Driver, Stop ID, Store, Warehouse Notes, Service Notes and Tier
	// Master Store List will provide Validation (Store Name), Address, City, State, Start, Lunch Start, Lunch End, End, Store Master Notes

	// Get the number of products delivered to a store from lookup and use the other stuff
	// Geofences for the specific store stop id

	for (const row of weeklyCoverage.data) {
		const orderID = row["Stop ID"];
		if (!orderID) {
			continue;
		}

		const storeListData = storeMap.get(orderID);
		if (!storeListData) {
			continue;
		}

		const orderType = "TASK";
		const date = weeklyCoverage.date.toLocaleDateString();
		const address = `${storeListData?.address_full}`;
		const locationID = `${orderID}${row["Driver"]}`;
		const locationName = row["Store"];
		const duration = "60"; // This gets complicated
		const twFrom = `${storeListData?.start}`;
		const twTo = `${storeListData?.end}`;
		const timeWindows = `${twFrom} - ${twTo}`;
		const notes = timeWindows;
		const writeOrderWithCin7 =
			"https://pos.cin7.com/Cloud/POS/Client3/pos.html";
		const whishaProductCheatsheet =
			"https://drive.google.com/file/d/1z0WmSGHtJNnSwqsdAseZhaD-5fBJchwN/view?usp=sharing";
		const inventoryCountLink =
			"https://docs.google.com/spreadsheets/d/1OGh84s-60hETGZJYWK6HkGVUB_vuXWHV8vljzYesNi8/edit#gid=0";
		const assignedToDriver = row["Driver"];
		const invoiceNumber = "";
		const scanIssueReporting = "https://forms.gle/2RwbU6XzJBDB4jn98";
		const targetPO = "";
		const qcLink = "";
		const priority = "";

		const rowValues = [
			orderType,
			orderID,
			date,
			address,
			locationID,
			locationName,
			duration,
			timeWindows,
			twFrom,
			twTo,
			notes,
			writeOrderWithCin7,
			whishaProductCheatsheet,
			inventoryCountLink,
			assignedToDriver,
			invoiceNumber,
			scanIssueReporting,
			targetPO,
			qcLink,
			priority,
		];
		formattedData.push(rowValues);
	}

	console.log(formattedData.slice(0, 8));
	// const outSheetID = SHEET_SCHEMAS.OPTIMO_UPLOAD_REWORK.id;
	// const outSheetName =
	// 	SHEET_SCHEMAS.OPTIMO_UPLOAD_REWORK.pages.master_visit_log;
	// const outSheetRange = "A1:AL";

	// formattedData = [[""], headers, ...formattedData];

	// const today = new Date();
	// formattedData[0][0] = `Last Update: ${today}`;

	// const outRequest = {
	// 	valueInputOption: "USER_ENTERED",
	// 	data: [
	// 		{
	// 			range: `${outSheetName}!${outSheetRange}`,
	// 			majorDimension: "ROWS",
	// 			values: formattedData,
	// 		},
	// 	],
	// };

	// try {
	// 	const clear = Sheets.Spreadsheets.Values.clear(
	// 		{},
	// 		outSheetID,
	// 		`${outSheetName}!${outSheetRange}`,
	// 	);
	// 	if (clear) {
	// 		Logger.log(clear);
	// 	} else {
	// 		Logger.log("Clear failed");
	// 	}
	// 	const response = Sheets.Spreadsheets.Values.batchUpdate(
	// 		outRequest,
	// 		outSheetID,
	// 	);
	// 	if (response) {
	// 		Logger.log(response);
	// 	} else {
	// 		Logger.log("No Response");
	// 	}
	// } catch (e) {
	// 	console.log(e);
	// }
}
