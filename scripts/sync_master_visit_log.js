import { SHEET_SCHEMAS } from "../util/sheet_schemas.js";

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

	Logger.log("Script run complete");
}

async function getTableDataFromBQ() {
	const projectId = "test-accel";
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
        FROM \`${projectId}.${datasetId}.${tableId}\` limit 1000`;

	console.log(query);
	const request = {
		query: query,
		useLegacySql: false,
	};

	let queryResults = BigQuery.Jobs.query(request, projectId);
	const jobId = queryResults.jobReference.jobId;
	const jobLocation = queryResults.jobReference.location;

	let sleepTimeMs = 500;
	while (!queryResults.jobComplete) {
		Utilities.sleep(sleepTimeMs);
		sleepTimeMs *= 2;
		console.log("trying query");
		queryResults = BigQuery.Jobs.getQueryResults(projectId, jobId);
	}

	let rows = queryResults.rows;
	while (queryResults.pageToken) {
		queryResults = BigQuery.Jobs.getQueryResults(projectId, jobId, {
			pageToken: queryResults.pageToken,
			location: jobLocation,
		});
		rows = rows.concat(queryResults.pageToken);
	}

	buildMasterVisitLogTable(rows);
}

function buildMasterVisitLogTable(rows) {
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

	const fssMap = makeFssMap();

	for (const row of rows) {
		if (!row) {
			continue;
		}
		const stopID = row.f[0].v;
		const store = row.f[1].v;
		const date = row.f[2].v;
		const stopType = row.f[3].v;
		const serviceRep = row.f[4].v;
		const invoiceNumber = row.f[5].v;
		const stopCompleted = row.f[6].v === "Completed" ? "YES" : "NO";
		const urgency = `${fssMap.get(stopID) ?? ""} (${Number(row.f[7].v).toFixed(0)})`; // This gets calculated based on RTG: FSS on WADC
		const optimoStatus = row.f[6].v;
		const directOrder = row.f[8].v === "Y" ? "YES" : "NO";
		const directInvoiceNumber = invoiceNumber;
		const directDelivered = row.f[9].v === "Y" ? "YES" : "NO";
		const parkedOrder = row.f[10].v === "Y" ? "YES" : "NO";
		const rsrOptimorouteNotes = row.f[11].v;
		const directOrderAmtMatch = row.f[12].v;
		const directOrderQuantityMatch = row.f[13].v;
		const fullServiceInvoiceNumber = row.f[14].v;
		const fullServiceAmountMatch = row.f[15].v === "Y" ? "YES" : "NO";
		const fullServiceQuantityMatch = row.f[16].v === "Y" ? "YES" : "NO";
		const targetPoNumberDirectOrder = row.f[17].v;
		const targetPoNumberFullService = row.f[18].v;
		const uniqueId = row.f[19].v;
		const uniqueIdDOSHIT = `${stopID}${invoiceNumber}`;
		const uniqueIdTARGET = `${stopID}${dateToExcelSerialDate(date)}`;
		const edi = ""; // Every formula is broken so
		const region = row.f[20].v;
		const weeklyNoOrderTracking = ""; // Does nothing?
		const urgencyConcat = urgency;
		const onGS = ""; // Fetch the golden schedule from weekly coverage and check for stopID
		const tierVDays = `${fssMap.get(stopID) ?? ""}`;
		const orderSize = `($${Number(row.f[7].v).toFixed(0).toLocaleString("en-US")})`;

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
			weeklyNoOrderTracking,
			urgencyConcat,
			onGS,
			tierVDays,
			orderSize,
		];
		formattedData.push(rowValues);
	}

	console.log(formattedData.slice(2, 3));
	const outSheetID = SHEET_SCHEMAS.OPTIMO_UPLOAD_REWORK.id;
	const outSheetName =
		SHEET_SCHEMAS.OPTIMO_UPLOAD_REWORK.pages.master_visit_log;
	const outSheetRange = "A1:AL";

	formattedData = [[""], headers, ...formattedData];

	const today = new Date();
	formattedData[0][0] = `Last Update: ${today}`;

	const outRequest = {
		valueInputOption: "USER_ENTERED",
		data: [
			{
				range: `${outSheetName}!${outSheetRange}`,
				majorDimension: "ROWS",
				values: formattedData,
			},
		],
	};

	try {
		const clear = Sheets.Spreadsheets.Values.clear(
			{},
			outSheetID,
			`${outSheetName}!${outSheetRange}`,
		);
		if (clear) {
			Logger.log(clear);
		} else {
			Logger.log("Clear failed");
		}
		const response = Sheets.Spreadsheets.Values.batchUpdate(
			outRequest,
			outSheetID,
		);
		if (response) {
			Logger.log(response);
		} else {
			Logger.log("No Response");
		}
	} catch (e) {
		console.log(e);
	}

	Logger.log("Script run complete");
}

function makeFssMap() {
	const inSheetID = SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.id;
	const inSheetName =
		SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.pages.rtg_full_service_schedule;
	const inSheetRange = "A1:K";

	Logger.log("Getting initial data from input sheet");

	const inSheetData = Sheets.Spreadsheets.Values.get(
		inSheetID,
		`${inSheetName}!${inSheetRange}`,
		{ valueRenderOption: "UNFORMATTED_VALUE" },
	).values;

	Logger.log("Retrieved data successfully");

	const inSheetMap = new Map();
	for (const row of inSheetData) {
		if (row[0] != "") {
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
