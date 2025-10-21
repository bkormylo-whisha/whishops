import { SHEET_SCHEMAS } from "../../util/sheet_schemas.js";
import { sheetExtractor } from "../../util/sheet_extractor.js";
import delay from "../../util/delay.js";
import convertJsonToCsv from "../../util/convert_json_to_csv.js";
import dayjs from "dayjs";
import mailSender from "../../util/mail_sender.js";
import * as fs from "fs";

// NOT STARTED YET
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

	const mailer = await mailSender();
	await mailer.send({
		recipients: [
			"bkormylo@whisha.com",
			// "wsinks@whisha.com",
			// "dlindstrom@whisha.com",
			"tcarlozzi@whisha.com",
		],
		attachmentName: filePath.split("/").at(-1),
		attachmentPath: filePath,
		subject: "Orders to update in Cin7",
		bodyText: "",
	});

	// await insertUpdatedOrderDataCin7(directOrderLogData);
}

async function getDataFromDOL() {
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

	let result = [];

	for (const row of filteredData) {
		const orderId = row.at(11);
		const invoiceDate = excelDateToTimestamp(row.at(22));
		const scheduledInvoiceDate = excelDateToTimestamp(row.at(23));
		const deliveredOrComplete = row.at(25);

		if (Number.isNaN(invoiceDate) || Number.isNaN(scheduledInvoiceDate)) {
			continue;
		}

		if (invoiceDate === scheduledInvoiceDate) {
			continue;
		}

		if (deliveredOrComplete === "YES") {
			continue;
		}

		const formattedRow = {
			id: orderId,
			invoiceDate: scheduledInvoiceDate,
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
