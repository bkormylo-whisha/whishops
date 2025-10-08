import { SHEET_SCHEMAS } from "../../util/sheet_schemas.js";
import { sheetExtractor } from "../../util/sheet_extractor.js";
import { BigQuery } from "@google-cloud/bigquery";
import { sheetInserter } from "../../util/sheet_inserter.js";

export const run = async (req, res) => {
	try {
		await getUnpaidInvoices();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function getUnpaidInvoices() {
	const sheetData = await getDataFromArDashboard();
	console.log(`Filtered Unpaid Invoices: ${sheetData.length}`);

	if (sheetData.length === 0) {
		console.log("No matching orders found");
		return;
	}

	const podData = await getPodDataFromBQ();
	const podMap = new Map();
	for (const pod of podData) {
		podMap.set(pod.invoice_number, pod.customer_pod);
	}
	const mergedSproutsData = await mergeSheetDataWithPOD(
		sheetData.sproutsData,
		podMap,
	);
	const mergedWholeFoodsData = await mergeSheetDataWithPOD(
		sheetData.wholeFoodsData,
		podMap,
	);

	const sproutsSheetInserter = sheetInserter({
		outSheetID: SHEET_SCHEMAS.INVOICE_MAILER.prod_id,
		outSheetName: SHEET_SCHEMAS.INVOICE_MAILER.pages.sprouts,
		outSheetRange: "A2:E",
		wipePreviousData: true,
	});

	sproutsSheetInserter.run(mergedSproutsData.map((obj) => Object.values(obj)));

	const wholeFoodsSheetInserter = sheetInserter({
		outSheetID: SHEET_SCHEMAS.INVOICE_MAILER.prod_id,
		outSheetName: SHEET_SCHEMAS.INVOICE_MAILER.pages.whole_foods,
		outSheetRange: "A2",
		wipePreviousData: true,
	});

	wholeFoodsSheetInserter.run(
		mergedWholeFoodsData.map((obj) => Object.values(obj)),
	);
}

async function getDataFromArDashboard() {
	const arSheetExtractor = sheetExtractor({
		functionName: "Get Data From AR Dashboard",
		inSheetID: SHEET_SCHEMAS.WHISHA_AR_DASHBOARD.prod_id,
		inSheetName:
			SHEET_SCHEMAS.WHISHA_AR_DASHBOARD.pages.ar_overdue_invoice_list_2025,
		inSheetRange: "A6:M",
	});

	const overdueInvoiceData = await arSheetExtractor.run();

	const filteredData = overdueInvoiceData.filter(
		(row) =>
			row.at(9) === "Unpaid" &&
			(row.at(12) === "Sprouts" || row.at(12) === "Whole Foods") &&
			row.at(16) !== "Accounting" &&
			row.at(16) !== "Dispatch and Delivery Issues",
	);
	console.log(`Got rows: ${filteredData.length}`);

	let sproutsData = [];
	let wholeFoodsData = [];

	for (const row of filteredData) {
		const invoiceNumber = row.at(11);
		const storeName = row.at(5);
		const amount = row.at(7);

		if (row.at(12) === "Sprouts") {
			const storeNumber = storeName.split(" ").at(-1).split("#").at(-1);
			const storeNumberLength = storeNumber.length;
			const sproutsEmail = `st${storeNumberLength === 2 || storeNumberLength === 1 ? "0" : ""}${
				storeNumberLength === 1 ? "0" : ""
			}${storeNumber}receiver@sprouts.com`;

			const formattedRow = {
				id: invoiceNumber,
				email: sproutsEmail,
				amount: amount,
				storeName: storeName.split(":").at(-1),
			};
			sproutsData.push(formattedRow);
		} else {
			const formattedRow = {
				id: invoiceNumber,
				email: storeName,
				amount: amount,
			};
			wholeFoodsData.push(formattedRow);
		}
	}

	return { sproutsData: sproutsData, wholeFoodsData: wholeFoodsData };
}

async function getPodDataFromBQ() {
	try {
		const bigquery = new BigQuery();
		const query = `
			SELECT invoice_number, customer_pod
			FROM \`whishops.finance.pod_import\`
            WHERE LEFT(stop_id, 2) IN ('SP', 'WF')
		`;

		console.log("Executing query");
		const [rows] = await bigquery.query(query);

		return rows;
	} catch (error) {
		console.error("Error during BigQuery API call:", error);
		throw error;
	}
}

async function mergeSheetDataWithPOD(sheetData, podMap) {
	let mergedData = [];

	for (const row of sheetData) {
		const customer_pod = podMap.get(`${row.id}`);
		if (customer_pod) {
			const mergedRow = {
				...row,
				customer_pod: `"${customer_pod}"`,
			};
			mergedData.push(mergedRow);
		}
	}

	return mergedData;
}
