import { sheetExtractor } from "../../util/sheet_extractor.js";
import delay from "../../util/delay.js";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import excelDateToTimestamp from "../../util/excel_date_to_timestamp.js";

dayjs.extend(customParseFormat);

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
	const correctedData = await getCorrectedData();
	console.log(`Items Found: ${correctedData.length}`);

	if (correctedData.length === 0) {
		console.log("No matching orders found");
		return;
	}

	console.log(correctedData.slice(0, 4));
	console.log(
		correctedData.slice(correctedData.length - 4, correctedData.length),
	);

	// await insertUpdatedOrderDataCin7(correctedData);
}

async function getCorrectedData() {
	const correctionSheetExtractor = sheetExtractor({
		functionName: "Cin7 Status Update",
		inSheetID: "1V6A_hfdw1zDRYJBFf1jFjPqO6D48iDHAVOWD2NBT_gk",
		inSheetName: "Sheet1",
		inSheetRange: "A2:A",
		silent: true,
	});

	const correctedData = await correctionSheetExtractor.run();

	console.log(`Got ${correctedData.length} rows`);

	let result = [];

	for (const row of correctedData) {
		const id = row.at(0);
		// const invoiceDate = dayjs(excelDateToTimestamp(row.at(3)))
		// 	.add(9, "hour")
		// 	.toISOString();

		const formattedRow = {
			id: id,
			projectName: "zzz",
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
	let batchCount = 1;

	for (let i = 0; i < updatedRows.length; i += BATCH_SIZE) {
		const batch = updatedRows.slice(i, i + BATCH_SIZE);
		batchCount++;
		console.log(batchCount);

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
