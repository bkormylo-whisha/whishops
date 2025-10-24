import { SHEET_SCHEMAS } from "../../util/sheet_schemas.js";
import { sheetExtractor } from "../../util/sheet_extractor.js";
import delay from "../../util/delay.js";
import convertJsonToCsv from "../../util/convert_json_to_csv.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import mailSender from "../../util/mail_sender.js";
import * as fs from "fs";

dayjs.extend(utc);

export const run = async (req, res) => {
	try {
		await flipDraftsCin7();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function flipDraftsCin7() {
	const printedOrdersJson = await getDraftOrders();
	console.log(`Got ${printedOrdersJson.length} orders from Cin7`);
	const formattedData = await filterAndAdjustData(printedOrdersJson);

	console.log(printedOrdersJson);
	console.log(formattedData.slice(0, 4));

	if (printedOrdersJson.length === 0) {
		console.log("No matching orders found");
		return;
	}

	// await insertUpdatedOrderDataCin7(formattedData);
}

async function getDraftOrders() {
	const url = "https://api.cin7.com/api/";
	const username = process.env.CIN7_USERNAME;
	const password = process.env.CIN7_PASSWORD;

	let options = {};
	options.headers = {
		Authorization: "Basic " + btoa(username + ":" + password),
	};

	let page = 1;
	let result = [];
	let hasMorePages = true;
	const rowCount = 250;
	const status = "Draft";
	while (hasMorePages) {
		const sales_endpoint = `v1/SalesOrders?fields=id,status,source,total,invoiceDate&where=status='${status}'&page=${page}&rows=250`;

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

async function filterAndAdjustData(printedOrderJson) {
	let result = [];

	// const now = dayjs().add(7, "hour").toISOString(); // Added hours to account for Cin7 server location, ensures correct date
	const now = dayjs().utc().add(1, "day").toISOString();

	for (const order of printedOrderJson) {
		if (!order.source.includes("POS") || order.total < 100.0) {
			continue;
		}
		const adjustedOrder = { ...order, invoiceDate: now };
		result.push(adjustedOrder);
	}

	return result;
}

async function insertUpdatedOrderDataCin7(updatedRows) {
	const url = "https://api.cin7.com/api/";
	const username = process.env.CIN7_USERNAME;
	const password = process.env.CIN7_PASSWORD;
	const put_endpoint = "v1/SalesOrders";
	const BATCH_SIZE = 50;

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
