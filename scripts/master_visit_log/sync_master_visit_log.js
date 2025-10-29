import { SHEET_SCHEMAS } from "../../util/sheet_schemas.js";
import { sheetExtractor } from "../../util/sheet_extractor.js";
import { sheetInserter } from "../../util/sheet_inserter.js";
import { BigQuery } from "@google-cloud/bigquery";
import dayjs from "dayjs";

// Not finished, future
// Still needs to also extract the current MVL, insert the missing manually completed fields, then reinsert
// Not attached to any live tables

export const run = async (req, res) => {
	try {
		await syncMasterVisitLog();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function syncMasterVisitLog() {
	const rows = await getTableDataFromBQ();

	await buildMasterVisitLogTable(rows);
	console.log("Script run complete");
}

async function getTableDataFromBQ() {
	const bigquery = new BigQuery();
	const projectId = "whishops";
	const datasetId = "order_management";
	const tableId = "optimo-visit-log";
	const dateRange = getDateRange();

	const query = `SELECT 
        order_no,
        location_name,
        date,
        stop_type,
        rep_name,
        inv_number,
        status,
        form_note,
        direct_order_invoice_amount,
        direct_order,
        delivered,
        parked_order,
        pod_notes,
        dollar_amount_match_direct_order,
        unit_quantity_match_direct_order,
        full_service_invoice_number,
        dollar_amount_match_full_service,
        unit_quantity_match_full_service,
        out_of_stocks,
        target_po_number_direct_order,
        target_po_number_full_service,
        unique_id,
        account_name,
        FROM \`${projectId}.${datasetId}.${tableId}\` where \`date\` BETWEEN '${dateRange.start}' AND '${dateRange.end}'`;

	const options = {
		query: query,
		location: "us-west1",
	};

	let result;

	try {
		const [job] = await bigquery.createQueryJob(options);
		console.log(`Data successfully retrieved.`);
		result = await job.getQueryResults();
	} catch (e) {
		console.error(`Error reading table:`, e);
		throw e;
	}

	const rows = result.at(0);

	return rows;
}

async function buildMasterVisitLogTable(rows) {
	const headers = [
		"STOP ID",
		"STORE",
		"DATE",
		"STOP TYPE",
		"SERVICE REP",
		"INVOICE NUMBER", // BLANK NOW
		"INV ADJ", // NO OVERWRITE
		"STOP COMPLETED (Manual)", // NO OVERWRITE
		"STOP COMPLETED",
		"URGENCY",
		"OPTIMO STATUS",
		"DIRECT ORDER? (Y/N)",
		"DIRECT INVOICE #",
		"DIRECT DELIVERED? (Y/N)",
		"ORDER PARKED? (Y/N)",
		"RSR OPTIMOROUTE NOTES",
		"DIRECT ORDER $ AMT MATCH? (Y/N)",
		"DIRECT ORDER $ QUANTITY MATCH? (Y/N)",
		"F/S INVOICE #",
		"F/S AMT MATCH? (Y/N)",
		"F/S UNIT QUANTITY MATCH? (Y/N)",
		"OOS COUNT",
		"PO# (DIRECT)",
		"PO# (F/S)",
		"NOTES", // NO OVERWRITE
		"MUST HAVE FORMULA",
		"UNIQUE ID",
		"UNIQUE ID (DOSHIT)",
		"UNIQUE ID (TARGET)",
		"EDI",
		"REGION",
	];

	let formattedData = [];

	const fssMap = await makeFssMap();
	const mvlMap = await makeMvlMap();

	for (const row of rows) {
		if (!row) {
			continue;
		}
		const stopID = row.order_no;
		const store = row.location_name;
		const date = row.date.value;
		const stopType = row.stop_type;
		const serviceRep = row.rep_name;
		const invoiceNumber = row.inv_number;
		const stopCompleted = row.status === "Completed" ? "YES" : "NO";
		const urgency = `${fssMap.get(stopID) ?? ""} (${Number(row.direct_order_invoice_amount).toFixed(0)})`; // This gets calculated based on RTG: FSS on WADC
		const optimoStatus = row.status;
		const directOrder = row.direct_order === "Y" ? "YES" : "NO";
		const directInvoiceNumber = row.inv_number;
		const directDelivered = row.delivered === "Y" ? "YES" : "NO";
		const parkedOrder = row.parked_order === "Y" ? "YES" : "NO";
		const rsrOptimorouteNotes = row.pod_notes;
		const directOrderAmtMatch = row.dollar_amount_match_direct_order;
		const directOrderQuantityMatch = row.unit_quantity_match_direct_order;
		const fullServiceInvoiceNumber = row.full_service_invoice_number;
		const fullServiceAmountMatch =
			row.dollar_amount_match_full_service === "Y" ? "YES" : "NO";
		const fullServiceQuantityMatch =
			row.unit_quantity_match_full_service === "Y" ? "YES" : "NO";
		const targetPoNumberDirectOrder = row.target_po_number_direct_order;
		const targetPoNumberFullService = row.target_po_number_full_service;
		const uniqueId = row.unique_id;
		const uniqueIdDOSHIT = `${stopID}${invoiceNumber}`;
		const uniqueIdTARGET = `${stopID}${dateToExcelSerialDate(date)}`;
		const edi = ""; // Every formula is broken so
		const region = row.account_name;
		const outOfStocks = row.out_of_stocks;

		const prevManuallyEnteredData = mvlMap.get(uniqueId);

		const rowValues = [
			stopID,
			store,
			date,
			stopType,
			serviceRep,
			invoiceNumber,
			prevManuallyEnteredData?.inv_adj ?? "", // BLANK FIELD,
			prevManuallyEnteredData?.stop_completed_manual ?? "", // STOP COMPLETED MANUAL FIELD,
			stopCompleted,
			urgency,
			optimoStatus,
			directOrder,
			directInvoiceNumber,
			directDelivered,
			parkedOrder,
			rsrOptimorouteNotes,
			directOrderAmtMatch,
			directOrderQuantityMatch,
			fullServiceInvoiceNumber,
			fullServiceAmountMatch,
			fullServiceQuantityMatch,
			outOfStocks,
			targetPoNumberDirectOrder,
			targetPoNumberFullService,
			prevManuallyEnteredData?.notes ?? "", // BLANK FIELD FOR NOTES,
			stopCompleted, // REPEATED FIELD APPARENTLY NEEDED IDK
			uniqueId,
			uniqueIdDOSHIT,
			uniqueIdTARGET,
			edi,
			region,
		];

		formattedData.push(rowValues);
	}
	formattedData = formattedData.sort((a, b) => a.at(2).localeCompare(b.at(2)));

	formattedData = [[""], headers, ...formattedData];

	const uploadReworkSheetInserter = sheetInserter({
		outSheetID: SHEET_SCHEMAS.MVL_REWORK.id,
		outSheetName: SHEET_SCHEMAS.MVL_REWORK.pages.master_visit_log,
		outSheetRange: "A1:AE",
		wipePreviousData: true,
		insertTimestamp: true,
		silent: true,
	});

	await uploadReworkSheetInserter.run(formattedData);
}

async function makeMvlMap() {
	const mvlSheetExtractor = sheetExtractor({
		inSheetID: SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.testing,
		inSheetName: SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.pages.master_visit_log,
		inSheetRange: "H3:AB",
		silent: true,
	});

	const inSheetData = await mvlSheetExtractor.run();

	const inSheetMap = new Map();
	for (const row of inSheetData) {
		const unique_id = row.at(20);
		const data = {
			inv_adj: row.at(0),
			stop_completed_manual: row.at(1),
			notes: `${row.at(18)}`,
		};
		inSheetMap.set(unique_id, data);
	}

	return inSheetMap;
}

async function makeFssMap() {
	const fssSheetExtractor = sheetExtractor({
		inSheetID: SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.testing,
		inSheetName:
			SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.pages.rtg_full_service_schedule,
		inSheetRange: "A1:K",
		silent: true,
	});

	const inSheetData = await fssSheetExtractor.run();

	const inSheetMap = new Map();
	for (const row of inSheetData) {
		if (row[0] && row[0] !== "") {
			inSheetMap.set(row[0], row[10]);
		}
	}

	return inSheetMap;
}

function dateToExcelSerialDate(prevDate) {
	const excelEpoch = new Date(1900, 0, 1); // January 1, 1900
	const date = new Date(prevDate);
	const isLeapYear = (year) =>
		(year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

	let days = Math.floor(
		(date.getTime() - excelEpoch.getTime()) / (1000 * 60 * 60 * 24),
	);

	if (isLeapYear(date.getFullYear()) && date > new Date(1900, 1, 28)) {
		days += 1;
	}

	return days + 1;
}

function getDateRange() {
	const dateFormat = "YYYY-MM-DD";
	const now = dayjs();
	const startDate = now.subtract(31, "day").format(dateFormat);
	const endDate = now.format(dateFormat);
	return {
		start: startDate,
		end: endDate,
	};
}
