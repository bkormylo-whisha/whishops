import { SHEET_SCHEMAS } from "../../util/sheet_schemas.js";
import { sheetExtractor } from "../../util/sheet_extractor.js";
import delay from "../../util/delay.js";
import convertJsonToCsv from "../../util/convert_json_to_csv.js";
import dayjs from "dayjs";
import mailSender from "../../util/mail_sender.js";
import * as fs from "fs";

// If column Z is not YES, overwrite the invoice date with the scheduleded invoice date

export const run = async (req, res) => {
	try {
		await cin7InvoiceDateUpdate();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function cin7InvoiceDateUpdate() {
	const directOrderLogData = await getDataFromDOL();
	console.log(`Filtered Direct Order Log Items: ${directOrderLogData.length}`);

	const date = dayjs();
	const formattedDate = date.format("YYYY-MM-DD");

	if (directOrderLogData.length === 0) {
		console.log("No matching orders found");
		return;
	}

	const filePath = writeCsvData(directOrderLogData, formattedDate);

	const mailer = mailSender();
	await mailer.send({
		recipients: [
			"bkormylo@whisha.com",
			// "wsinks@whisha.com",
			// "dlindstrom@whisha.com",
			// "tcarlozzi@whisha.com",
		],
		attachmentName: filePath.split("/").at(-1),
		attachmentPath: filePath,
		subject: "Orders to update in Cin7",
		bodyText: "",
	});

	await insertUpdatedOrderDataCin7(directOrderLogData);
}

async function getDataFromDOL() {
	const dolSheetExtractor = sheetExtractor({
		functionName: "Cin7 Status Update",
		inSheetID: SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.prod_id,
		inSheetName:
			SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.pages.rtg_direct_order_log,
		inSheetRange: "A1:V",
	});

	const directOrderLogData = await dolSheetExtractor.run();
	const currDateAsExcelDate = directOrderLogData[0][0];

	console.log(`Got rows from DOL: ${directOrderLogData.length}`);
	// row.at(21) is Dispatch Date, row.at(11) is Cin7 Order ID
	const filteredData = directOrderLogData.filter(
		(row) =>
			row.at(21) !== "" &&
			row.at(21) >= currDateAsExcelDate &&
			row.at(11) != "",
	);

	// FOR TESTING
	// const filteredData = directOrderLogData.filter(
	// 	(row) => row.at(0) >= currDateAsExcelDate - 2 && row.at(6) === "SACRAMENTO",
	// );

	let result = [];

	const futureLimit = dayjs().add(2, "day").toISOString();
	for (const row of filteredData) {
		const orderId = row.at(11);
		const etd = excelDateToTimestamp(row.at(21));
		if (!dayjs(etd).isValid()) {
			continue;
		}

		if (etd > futureLimit) {
			// console.log(`${etd} --- ${futureLimit}`);
			continue;
		}
		const rsr = row.at(16);
		if (rsr === "") {
			continue;
		}
		const formattedRow = {
			id: orderId,
			estimatedDeliveryDate: etd,
			// trackingCode: rsr,
		};
		result.push(formattedRow);
	}

	return result;
}

async function insertUpdatedOrderDataCin7(updatedRows) {
	const url = "https://api.cin7.com/api/";
	const username = process.env.CIN7_USERNAME;
	const password = process.env.CIN7_PASSWORD;
	const put_endpoint = "v1/SalesOrders";
	const BATCH_SIZE = 250;

	console.log("Uploading to Cin7");

	for (let i = 0; i <= updatedRows.length; i += BATCH_SIZE) {
		const batch = updatedRows.slice(i, i + BATCH_SIZE);

		const putOptions = {
			method: "PUT",
			headers: {
				Authorization: "Basic " + btoa(username + ":" + password),
				"Content-Type": "application/json",
			},
			body: JSON.stringify(batch),
		};
		const putResponse = await fetch(`${url}${put_endpoint}`, putOptions);
		const response = await putResponse.json();
		await delay(1000);
		console.log(response);
	}

	console.log(`Completed Upload of ${updatedRows.length} items`);

	// return response;
}

function writeCsvData(jsonData, formattedDate) {
	const csvData = convertJsonToCsv(jsonData);
	const fileName = `whisha${formattedDate}_sales_orders.csv`;

	fs.writeFile("./downloads/" + fileName, csvData, (err) => {
		if (err) {
			console.error("Error writing file:", err);
			return;
		}
		console.log("File written successfully!");
	});

	return `./downloads/${fileName}`;
}

function excelDateToTimestamp(excelDate) {
	if (typeof excelDate !== "number" || excelDate <= 0) {
		return NaN;
	}

	const EXCEL_EPOCH_DIFF_DAYS = 25569;
	const MS_PER_DAY = 24 * 60 * 60 * 1000;
	const daysSinceEpoch = excelDate - EXCEL_EPOCH_DIFF_DAYS;
	const timestampMs = daysSinceEpoch * MS_PER_DAY;

	if (isNaN(timestampMs)) {
		return "Invalid Date";
	}
	return new Date(timestampMs).toISOString();
}

// async function getFullOrderDataCin7(directOrderLogData) {
// 	const dolMap = new Map();
// 	for (const row of directOrderLogData.slice(3)) {
// 		if (row.at(11) !== "") {
// 			dolMap.set(row.at(11), row);
// 		}
// 	}
// 	const orderIds = [...dolMap.keys()];
// 	console.log(orderIds.length);

// 	const url = "https://api.cin7.com/api/";
// 	const username = process.env.CIN7_USERNAME;
// 	const password = process.env.CIN7_PASSWORD;

// 	let options = {};
// 	options.headers = {
// 		Authorization: `Basic ${btoa(username + ":" + password)}`,
// 	};

// 	let result = [];
// 	const chunkSize = 50;

// 	for (let i = 0; i < orderIds.length; i += chunkSize) {
// 		console.log(`Chunk ${i}`);
// 		const chunk = orderIds.slice(i, i + chunkSize);
// 		const orderIdString = `(${chunk.join(",")})`;
// 		const user_endpoint = `v1/SalesOrders?where=id IN ${orderIdString}`;
// 		try {
// 			const response = await fetch(`${url}${user_endpoint}`, options);
// 			if (!response.ok) {
// 				throw new Error(`HTTP error! status: ${response.status}`);
// 			}
// 			const data = await response.json();
// 			await delay(1000);

// 			if (data.length > 0) {
// 				for (let i = 0; i < data.length; i++) {
// 					const row = data[i];
// 					const orderId = row["id"];
// 					const dolEntry = dolMap.get(orderId);
// 					const etd = excelDateToTimestamp(dolEntry.at(21));
// 					if (Number.isNaN(etd) || etd > dayjs().add(2, "day").toISOString()) {
// 						continue;
// 					}
// 					// row.estimatedDeliveryDate = etd;
// 					// row.trackingCode = dolEntry.at(16);
// 					const formattedRow = {
// 						id: orderId,
// 						etd: excelDateToTimestamp(dolEntry.at(21)),
// 						trackingCode: dolEntry.at(16),
// 					};
// 					result.push(formattedRow);
// 				}
// 			}
// 		} catch (error) {
// 			console.error("Failed to fetch data:", error);
// 		}
// 	}

// 	return result;
// }
