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
			whisha_pod: pod.whisha_pod,
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
	const mergedTargetData = await mergeSheetDataWithPOD(
		sheetData.targetData,
		podMap,
	);
	const mergedKrogerData = await mergeSheetDataWithPOD(
		sheetData.krogerData,
		podMap,
	);
	const mergedSafewayData = await mergeSheetDataWithPOD(
		sheetData.safewayData,
		podMap,
	);
	const mergedCentralMarketData = await mergeSheetDataWithPOD(
		sheetData.centralMarketData,
		podMap,
	);

	const sproutsSheetInserter = sheetInserter({
		outSheetID: SHEET_SCHEMAS.INVOICE_MAILER.prod_id,
		outSheetName: SHEET_SCHEMAS.INVOICE_MAILER.pages.sprouts,
		outSheetRange: "A2:I",
		wipePreviousData: true,
	});

	sproutsSheetInserter.run(mergedSproutsData.map((obj) => Object.values(obj)));

	const wholeFoodsSheetInserter = sheetInserter({
		outSheetID: SHEET_SCHEMAS.INVOICE_MAILER.prod_id,
		outSheetName: SHEET_SCHEMAS.INVOICE_MAILER.pages.whole_foods,
		outSheetRange: "A2:I",
		wipePreviousData: true,
	});

	wholeFoodsSheetInserter.run(
		mergedWholeFoodsData.map((obj) => Object.values(obj)),
	);

	const targetSheetInserter = sheetInserter({
		outSheetID: SHEET_SCHEMAS.INVOICE_MAILER.prod_id,
		outSheetName: SHEET_SCHEMAS.INVOICE_MAILER.pages.target,
		outSheetRange: "A2:I",
		wipePreviousData: true,
	});

	targetSheetInserter.run(mergedTargetData.map((obj) => Object.values(obj)));

	const krogerSheetInserter = sheetInserter({
		outSheetID: SHEET_SCHEMAS.INVOICE_MAILER.prod_id,
		outSheetName: SHEET_SCHEMAS.INVOICE_MAILER.pages.kroger,
		outSheetRange: "A2:I",
		wipePreviousData: true,
	});

	krogerSheetInserter.run(mergedKrogerData.map((obj) => Object.values(obj)));

	const safewaySheetInserter = sheetInserter({
		outSheetID: SHEET_SCHEMAS.INVOICE_MAILER.prod_id,
		outSheetName: SHEET_SCHEMAS.INVOICE_MAILER.pages.safeway,
		outSheetRange: "A2:I",
		wipePreviousData: true,
	});

	safewaySheetInserter.run(mergedSafewayData.map((obj) => Object.values(obj)));

	const centralMarketSheetInserter = sheetInserter({
		outSheetID: SHEET_SCHEMAS.INVOICE_MAILER.prod_id,
		outSheetName: SHEET_SCHEMAS.INVOICE_MAILER.pages.central_market,
		outSheetRange: "A2:I",
		wipePreviousData: true,
	});

	centralMarketSheetInserter.run(
		mergedCentralMarketData.map((obj) => Object.values(obj)),
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
			(row.at(12).includes("Sprouts") ||
				row.at(12).includes("Whole Foods") ||
				row.at(12).includes("Kroger") ||
				row.at(12).includes("Safeway") ||
				row.at(12).includes("Central Market") ||
				row.at(12).includes("Target")) &&
			row.at(17) !== "Accounting" &&
			row.at(17) !== "Dispatch and Delivery Issues",
	);
	console.log(`After filter: ${filteredData.length}`);

	let sproutsData = [];
	let wholeFoodsData = [];
	let targetData = [];
	let krogerData = [];
	let safewayData = [];
	let centralMarketData = [];

	for (const row of filteredData) {
		const invoiceNumber = row.at(11);
		const storeName = row.at(5);
		const amount = row.at(7);
		const date = excelDateToTimestamp(row.at(1)).slice(0, 10);

		if (row.at(12) === "Sprouts") {
			const storeNumber = storeName.split(" ").at(-1).split("#").at(-1);
			const sproutsEmail = `st${storeNumber}receiver@sprouts.com`;

			const formattedRow = {
				id: invoiceNumber,
				date: date,
				email: sproutsEmail,
				amount: amount,
				storeName: storeName.split(":").at(-1),
			};
			sproutsData.push(formattedRow);
		} else if (row.at(12).includes("Whole Foods")) {
			const formattedRow = {
				id: invoiceNumber,
				date: date,
				email: storeName,
				amount: amount,
			};
			wholeFoodsData.push(formattedRow);
		} else if (row.at(12).includes("Target")) {
			const formattedRow = {
				id: invoiceNumber,
				date: date,
				email: storeName,
				amount: amount,
			};
			targetData.push(formattedRow);
		} else if (row.at(12).includes("Kroger")) {
			const formattedRow = {
				id: invoiceNumber,
				date: date,
				email: storeName,
				amount: amount,
			};
			krogerData.push(formattedRow);
		} else if (row.at(12).includes("Safeway")) {
			const formattedRow = {
				id: invoiceNumber,
				date: date,
				email: storeName,
				amount: amount,
			};
			safewayData.push(formattedRow);
		} else if (row.at(12).includes("Central Market")) {
			const formattedRow = {
				id: invoiceNumber,
				date: date,
				email: storeName,
				amount: amount,
			};
			centralMarketData.push(formattedRow);
		}
	}

	console.log(sproutsData.length);
	console.log(wholeFoodsData.length);

	return {
		sproutsData: sproutsData,
		wholeFoodsData: wholeFoodsData,
		targetData: targetData,
		krogerData: krogerData,
		safewayData: safewayData,
		centralMarketData: centralMarketData,
	};
}

async function getPodDataFromBQ() {
	try {
		const bigquery = new BigQuery();
		const query = `
			SELECT invoice_number, customer_pod, whisha_pod, order_date, target_po_number
			FROM \`whishops.finance.pod_import\`
            WHERE LEFT(stop_id, 2) IN ('SP', 'WF', 'KS', 'TG', 'SA')
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
				customer_pod: `${rowPodData.customer_pod}`.split(",").at(0),
				whisha_pod: `${rowPodData.whisha_pod}`.split(",").at(0),
				target_po_number: `${rowPodData.target_po_number}`,
			};
			mergedData.push(mergedRow);
		} else {
			mergedData.push(row);
		}
	}

	return mergedData;
}
