import { SHEET_SCHEMAS } from "../../util/sheet_schemas.js";
import { sheetInserter } from "../../util/sheet_inserter.js";
import delay from "../../util/delay.js";
import dayjs from "dayjs";

export const run = async (req, res) => {
	try {
		await getPodCin7();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

const headers = [
	"Company",
	"Total",
	"Invoice Number",
	"Created Date",
	"Stage",
	"Invoice Date",
	"ID",
	"POD",
];

async function getPodCin7() {
	console.log("Running Script: Cin7 Get Printed Orders");
	const ordersJson = await getOrdersCin7();
	console.log(`Got ${ordersJson.length} printed orders from Cin7`);

	const formattedData = await formatPrintedOrderJson(ordersJson);

	const podSheetInserter = sheetInserter({
		outSheetID: SHEET_SCHEMAS.POD_IMPORT.prod_id,
		outSheetName: SHEET_SCHEMAS.POD_IMPORT.pages.pod_cin7,
		outSheetRange: "A2:Q",
		wipePreviousData: true,
		silent: true,
	});

	// podSheetInserter.run([headers, ...formattedData]);
	podSheetInserter.run(formattedData);
}

async function getOrdersCin7() {
	const url = "https://api.cin7.com/api/";
	const username = process.env.CIN7_USERNAME;
	const password = process.env.CIN7_PASSWORD;

	let options = {};
	options.headers = {
		Authorization: "Basic " + btoa(username + ":" + password),
	};

	// const date = dayjs("2025-10-20T00:00:00Z");
	const date = dayjs().subtract(3, "month");
	const formattedDate = date.format("YYYY-MM-DD");

	let page = 1;
	let result = [];
	let hasMorePages = true;
	const stage = "Delivered";
	const rowCount = 250;
	let callCount = 0;
	while (hasMorePages) {
		const sales_endpoint = `v1/SalesOrders?fields=id,createdDate,stage,invoiceDate,internalComments,company,total,invoiceNumber&where=stage='${stage}' AND invoiceDate>${formattedDate}T00:00:00Z&order=invoiceDate&page=${page}&rows=250`;

		try {
			const response = await fetch(`${url}${sales_endpoint}`, options);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const data = await response.json();
			await delay(1000);
			callCount++;

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

	console.log(`API CALLS USED: ${callCount}`);

	return result;
}

async function formatPrintedOrderJson(printedOrderJson) {
	let result = [];

	for (const order of printedOrderJson) {
		const company = `${order.company}`;
		const total = order.total;
		const invoiceNumber = `${order.invoiceNumber}`;
		const createdDate = dayjs(order.createdDate).format("MM/DD/YY");
		const stage = order.stage;
		const invoiceDate = order.invoiceDate;
		const id = order.id;
		const internalComments = order.internalComments.split(",").at(0);

		result.push([
			company,
			total,
			invoiceNumber,
			createdDate,
			stage,
			invoiceDate,
			id,
			internalComments,
		]);
	}

	return result;
}
