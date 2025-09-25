import { SHEET_SCHEMAS } from "../util/sheet_schemas.js";
import { sheetCoordinator } from "../util/sheet_coordinator.js";
import getAuthenticatedClient from "../util/sheet_auth.js";
import { google } from "googleapis";
import { sheetExtractor } from "../util/sheet_extractor.js";

export const run = async (req, res) => {
	try {
		await cin7StatusUpdate();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function cin7StatusUpdate() {
	// const directOrderLogData = await getDataFromDOL();
	// const currDateAsExcelDate = `${directOrderLogData[0][0]}`;
	// const filteredData = directOrderLogData.filter(
	// 	(row) => `${row.at(0)}` === currDateAsExcelDate,
	// );
	// console.log(filteredData.length);

	const updatedOrderData = await getFullOrderDataCin7();

	// DONT USE UNTIL TEST ORDERS ARE INSERTED
	// await insertUpdatedOrderDataCin7(updatedOrderData);
}

async function getDataFromDOL() {
	const dolSheetExtractor = sheetExtractor({
		functionName: "Cin7 Status Update",
		inSheetID: SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.prod_id,
		inSheetName:
			SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.pages.rtg_direct_order_log,
		inSheetRange: "A1:AE",
	});

	const dolData = await dolSheetExtractor.run();
	return dolData;
}

async function getFullOrderDataCin7() {
	const url = "https://api.cin7.com/api/";
	const username = "Whisha2US";
	const password = "8e21e00dc8954506aed09df629041d87";

	let options = {};
	options.headers = {
		Authorization: "Basic " + btoa(username + ":" + password),
	};
	const today = new Date();
	const year = today.getFullYear();
	const month = String(today.getMonth() + 1).padStart(2, "0");
	const day = String(today.getDate()).padStart(2, "0");
	const formattedDate = `${year}-${month}-${day}`;

	const user_endpoint = "v1/SalesOrders?createdDate=" + formattedDate;

	const response = await fetch(`${url}${user_endpoint}`, options);
	const data = await response.json();

	let result = [];

	for (let i = 0; i < data.length; i++) {
		let row = data[i];
		row.stage = "Ready To Pick - WMS";
		result.push(row);
	}

	return result;
}

async function insertUpdatedOrderDataCin7(updatedRows) {
	const url = "https://api.cin7.com/api/";
	const username = "Whisha2US";
	const password = "8e21e00dc8954506aed09df629041d87";
	const put_endpoint = "v1/SalesOrders";

	const putOptions = {
		method: "PUT",
		headers: {
			Authorization: "Basic " + btoa(username + ":" + password),
			"Content-Type": "application/json",
		},
		body: JSON.stringify(updatedRows),
	};

	const putResponse = await fetch(`${url}${put_endpoint}`, putOptions);
	const putData = await putResponse.json();

	return putData;
}
