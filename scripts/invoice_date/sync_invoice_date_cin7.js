import { SHEET_SCHEMAS } from "../../util/sheet_schemas.js";
import { sheetExtractor } from "../../util/sheet_extractor.js";
import delay from "../../util/delay.js";
import dayjs from "dayjs";

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

	if (directOrderLogData.length === 0) {
		console.log("No matching orders found");
		return;
	}

	await insertUpdatedOrderDataCin7(directOrderLogData);
}

async function getDataFromDOL() {
	const dolSheetExtractor = sheetExtractor({
		functionName: "Cin7 Status Update",
		inSheetID: SHEET_SCHEMAS.WHISHACCEL_NORCAL_ORDER_MANAGEMENT.prod_id,
		inSheetName:
			SHEET_SCHEMAS.WHISHACCEL_NORCAL_ORDER_MANAGEMENT.pages
				.rtg_direct_order_log,
		inSheetRange: "A2:AB",
	});

	const directOrderLogData = await dolSheetExtractor.run();

	console.log(`Got rows from DOL: ${directOrderLogData.length}`);

	const filteredData = directOrderLogData.filter((row) => row.at(11) !== "");
	console.log(`Found items: ${filteredData.length}`);

	let result = [];

	for (const row of filteredData) {
		const orderId = row.at(11);
		const invoiceDate = excelDateToTimestamp(row.at(22));
		const scheduledInvoiceField = row.at(23);
		let scheduledInvoiceDate = excelDateToTimestamp(row.at(23));
		const deliveredOrComplete = row.at(25);

		if (invoiceDate === scheduledInvoiceDate) {
			continue;
		}

		if (deliveredOrComplete === "YES") {
			continue;
		}

		if (
			scheduledInvoiceField === "Unscheduled" ||
			scheduledInvoiceField === "NA"
		) {
			scheduledInvoiceDate =
				`${dayjs().add(1, "day").toISOString().slice(0, 10)}` +
				"T16:00:00.000Z";
		} else {
			if (!Number.isNaN(scheduledInvoiceDate)) {
				scheduledInvoiceDate =
					`${scheduledInvoiceDate}`.slice(0, 10) + "T16:00:00.000Z";
			}
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
	const allResults = [];

	for (let i = 0; i < updatedRows.length; i += BATCH_SIZE) {
		const batch = updatedRows.slice(i, i + BATCH_SIZE);

		const putOptions = {
			method: "PUT",
			headers: {
				Authorization: "Basic " + btoa(username + ":" + password),
				"Content-Type": "application/json",
			},
			body: JSON.stringify(batch),
		};
		try {
			await delay(1000);
			const putResponse = await fetch(`${url}${put_endpoint}`, putOptions);
			const response = await putResponse.json();
			allResults.push(response);
		} catch (e) {
			console.error(`Batch starting at index ${i} failed:`, error.message);
			allResults.push({ error: error.message, index: i });
		}
	}

	console.log(`Completed Upload of ${updatedRows.length} items`);
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
		return NaN;
	}
	return new Date(timestampMs).toISOString();
}
