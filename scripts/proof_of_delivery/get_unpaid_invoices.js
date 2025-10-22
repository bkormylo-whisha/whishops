import { SHEET_SCHEMAS } from "../../util/sheet_schemas.js";
import { sheetExtractor } from "../../util/sheet_extractor.js";
import { BigQuery } from "@google-cloud/bigquery";
import { sheetInserter } from "../../util/sheet_inserter.js";
import excelDateToTimestamp from "../../util/excel_date_to_timestamp.js";

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
		const data = {
			order_date: pod.order_date,
			customer_pod: pod.customer_pod,
			target_po_number: pod.target_po_number,
		};
		podMap.set(pod.invoice_number, data);
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
		outSheetRange: "A2:H",
		wipePreviousData: true,
	});

	sproutsSheetInserter.run(mergedSproutsData.map((obj) => Object.values(obj)));

	const wholeFoodsSheetInserter = sheetInserter({
		outSheetID: SHEET_SCHEMAS.INVOICE_MAILER.prod_id,
		outSheetName: SHEET_SCHEMAS.INVOICE_MAILER.pages.whole_foods,
		outSheetRange: "A2:H",
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
		inSheetRange: "A6:W",
	});

	const overdueInvoiceData = await arSheetExtractor.run();
	console.log(`Fetched ${overdueInvoiceData.length} rows`);

	const filteredData = overdueInvoiceData.filter(
		(row) =>
			row.at(9) === "Unpaid" &&
			(row.at(12).includes("Sprouts") || row.at(12).includes("Whole Foods")) &&
			row.at(17) !== "Accounting" &&
			row.at(17) !== "Dispatch and Delivery Issues",
	);
	console.log(`After filter: ${filteredData.length}`);

	let sproutsData = [];
	let wholeFoodsData = [];

	for (const row of filteredData) {
		const invoiceNumber = row.at(11);
		const storeName = row.at(5);
		const amount = row.at(7);
		const date = excelDateToTimestamp(row.at(1)).slice(0, 10);

		if (row.at(12) === "Sprouts") {
			const storeNumber = storeName.split(" ").at(-1).split("#").at(-1);
			const storeNumberLength = storeNumber.length;
			const sproutsEmail = `st${storeNumberLength === 2 || storeNumberLength === 1 ? "0" : ""}${
				storeNumberLength === 1 ? "0" : ""
			}${storeNumber}receiver@sprouts.com`;

			const formattedRow = {
				id: invoiceNumber,
				date: date,
				email: sproutsEmail,
				amount: amount,
				storeName: storeName.split(":").at(-1),
			};
			sproutsData.push(formattedRow);
		} else {
			const formattedRow = {
				id: invoiceNumber,
				date: date,
				email: storeName,
				amount: amount,
			};
			wholeFoodsData.push(formattedRow);
		}
	}

	console.log(sproutsData.length);
	console.log(wholeFoodsData.length);

	return { sproutsData: sproutsData, wholeFoodsData: wholeFoodsData };
}

async function getPodDataFromBQ() {
	try {
		const bigquery = new BigQuery();
		const query = `
			SELECT invoice_number, customer_pod, order_date, target_po_number
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
		const rowPodData = podMap.get(`${row.id}`);
		if (rowPodData) {
			const mergedRow = {
				...row,
				order_date: `${rowPodData.order_date.value}`,
				customer_pod: `${rowPodData.customer_pod}`,
				target_po_number: `${rowPodData.target_po_number}`,
			};
			mergedData.push(mergedRow);
		} else {
			mergedData.push(row);
		}
	}

	return mergedData;
}
