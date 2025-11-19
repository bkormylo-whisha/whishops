import delay from "../../util/delay.js";
import { SHEET_SCHEMAS } from "../../util/sheet_schemas.js";
import { sheetExtractor } from "../../util/sheet_extractor.js";
import { sheetInserter } from "../../util/sheet_inserter.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);

// ACTIVE, runs every 15 minutes, called by CRON on Norcal-Debian (Laptop in closet)
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

	if (printedOrdersJson.length === 0) {
		console.log("No matching orders found");
		return;
	}

	if (formattedData.length > 0) {
		await insertUpdatedOrderDataCin7(formattedData);
	}

	console.log("Script run complete");
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
		const sales_endpoint = `v1/SalesOrders?fields=id,status,source,total,invoiceDate,modifiedDate&where=status='${status}'&page=${page}&rows=250`;

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
	const now = dayjs.utc();
	const tomorrow = dayjs().utc().add(1, "day").toISOString();

	for (const order of printedOrderJson) {
		const diff = dayjs(now).diff(order.modifiedDate, "minute");
		if (!order.source.includes("POS") || order.total < 100.0 || diff < 15) {
			continue;
		}
		const adjustedOrder = { id: order.id, invoiceDate: tomorrow };
		result.push(adjustedOrder);
	}

	console.log(result);

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

	const flippedOrderCount = updatedRows.length;
	console.log(`Completed Upload of ${flippedOrderCount} items`);

	logFlippedOrders(flippedOrderCount);
}

async function logFlippedOrders(flipCount) {
	let ordersFlippedCount = 0;
	const logExtractor = sheetExtractor({
		functionName: "Get Flipped Order Count",
		inSheetID: SHEET_SCHEMAS.WHISHOPS_LOGS.prod_id,
		inSheetName: SHEET_SCHEMAS.WHISHOPS_LOGS.pages.dashboard,
		inSheetRange: "A2",
		silent: true,
	});
	const flippedOrders = await logExtractor.run();

	ordersFlippedCount += Number(flippedOrders[0][0]);
	ordersFlippedCount += flipCount;

	const logInserter = sheetInserter({
		functionName: "Update Flipped Order Count",
		outSheetID: SHEET_SCHEMAS.WHISHOPS_LOGS.prod_id,
		outSheetName: SHEET_SCHEMAS.WHISHOPS_LOGS.pages.dashboard,
		outSheetRange: "A2",
		wipePreviousData: true,
		silent: true,
	});

	await logInserter.run([[ordersFlippedCount]]);
}
