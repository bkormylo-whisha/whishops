import delay from "../../util/delay.js";
import getUsernameMapFromCin7 from "../../util/cin7/get_username_map.js";
import mailSender from "../../util/mail_sender.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import { sheetInserter } from "../../util/sheet_inserter.js";

dayjs.extend(utc);

// LIVE DO NOT MODIFY
export const run = async (req, res) => {
	try {
		await getBulkIdsCin7();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function getBulkIdsCin7() {
	const dateRange = getDateRange();
	const ordersJson = await getRecentOrders(dateRange);
	console.log(`Got ${ordersJson.length} orders from Cin7`);

	if (ordersJson.length === 0) {
		console.log("No matching orders found");
		return;
	}

	await pushDataToSheet(ordersJson);

	console.log("Script run complete");
}

async function getRecentOrders(dateRange) {
	const url = "https://api.cin7.com/api/";
	const username = process.env.CIN7_USERNAME;
	const password = process.env.CIN7_PASSWORD;

	let options = {};
	options.headers = {
		Authorization: "Basic " + btoa(username + ":" + password),
	};

	let calls = 0;
	let page = 1;
	let result = [];
	let hasMorePages = true;
	const rowCount = 250;
	while (hasMorePages) {
		calls++;
		console.log(calls);
		const sales_endpoint = `v1/SalesOrders?fields=id,invoiceNumber,invoiceDate&where=invoiceDate>'${dateRange.start}' AND invoiceDate<='${dateRange.end}' AND status<>'Void'&order=invoiceDate&page=${page}&rows=250`;

		try {
			const response = await fetch(`${url}${sales_endpoint}`, options);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const data = await response.json();
			await delay(200);

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

async function pushDataToSheet(data) {
	const formattedData = [];
	for (const salesOrder of data) {
		formattedData.push([
			salesOrder.invoiceNumber,
			salesOrder.id,
			salesOrder.invoiceDate,
		]);
	}
	const cin7IdRefSheetInserter = sheetInserter({
		outSheetID: "1V6A_hfdw1zDRYJBFf1jFjPqO6D48iDHAVOWD2NBT_gk",
		outSheetName: "REF",
		outSheetRange: "A2:C",
		// wipePreviousData: true,
		append: true,
	});

	await cin7IdRefSheetInserter.run(formattedData);
}

function getDateRange() {
	const startDate = dayjs().utc().subtract(120, "day").toISOString();
	const endDate = dayjs().utc().subtract(90, "day").toISOString();

	return {
		start: startDate,
		end: endDate,
	};
}
