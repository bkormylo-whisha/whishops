import { SHEET_SCHEMAS } from "../util/sheet_schemas.js";
import { sheetExtractor } from "../util/sheet_extractor.js";
import { sheetInserter } from "../util/sheet_inserter.js";
import { BigQuery } from "@google-cloud/bigquery";
import dayjs from "dayjs";

// Not finished, future

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
	await getTableDataFromBQ();

	console.log("Script run complete");
}

async function getTableDataFromBQ() {
	const bigquery = new BigQuery();
	const projectId = "whishops";
	const datasetId = "order_management";
	const tableId = "optimo-visit-log";

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
        FROM \`${projectId}.${datasetId}.${tableId}\` where \`date\` BETWEEN '2025-10-01' AND '2025-10-28'`;

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

	await buildMasterVisitLogTable(rows);
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
		"OOS COUNT",
		"TARGET PO# (DIRECT)",
		"TARGET PO# (F/S)",
		"NOTES", // NO OVERWRITE
		"MUST HAVE FORMULA",
		"UNIQUE ID",
		"UNIQUE ID (DOSHIT)",
		"UNIQUE ID (TARGET)",
		"EDI",
		"REGION",
		"Weekly No Order Tracking",
		"Weekly No Order Tracking",
		"URGENCY CONCAT",
		"ON GS?",
		"TIER/VDAYS",
		"ORDER SIZE",
	];

	let formattedData = [];

	console.log(rows.slice(0, 4));

	const fssMap = await makeFssMap();

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
		// const weeklyNoOrderTracking = ""; // Does nothing?
		// const urgencyConcat = "urgency";
		// const onGS = ""; // Fetch the golden schedule from weekly coverage and check for stopID
		// const tierVDays = `${fssMap.get(stopID) ?? ""}`;
		// const orderSize = `($${Number(row.f[7].v).toFixed(0).toLocaleString("en-US")})`;

		const rowValues = [
			stopID,
			store,
			date,
			stopType,
			serviceRep,
			invoiceNumber,
			"", // BLANK FIELD,
			"", // STOP COMPLETED MANUAL FIELD,
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
			targetPoNumberDirectOrder,
			targetPoNumberFullService,
			"", // BLANK FIELD FOR NOTES,
			stopCompleted, // REPEATED FIELD APPARENTLY NEEDED IDK
			uniqueId,
			uniqueIdDOSHIT,
			uniqueIdTARGET,
			edi,
			region,
			// weeklyNoOrderTracking,
			// urgencyConcat,
			// onGS,
			// tierVDays,
			// orderSize,
		];
		formattedData.push(rowValues);
	}

	const uploadReworkSheetInserter = sheetInserter({
		outSheetID: SHEET_SCHEMAS.OPTIMO_UPLOAD_REWORK.id,
		outSheetName: SHEET_SCHEMAS.OPTIMO_UPLOAD_REWORK.pages.master_visit_log,
		outSheetRange: "A1:AL",
		wipePreviousData: true,
		insertTimestamp: true,
		silent: true,
	});

	formattedData = [[""], headers, ...formattedData];
	await uploadReworkSheetInserter.run(formattedData);
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
