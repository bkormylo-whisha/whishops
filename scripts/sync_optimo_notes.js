const { google } = require("googleapis");
const { GoogleAuth } = require("google-auth-library");
const { BigQuery } = require("@google-cloud/bigquery");
const SHEET_SCHEMAS = require("./sheet_schemas.js");

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

exports.run = async (req, res) => {
	console.log("Running Sync Optimo Notes");
	try {
		const auth = new GoogleAuth({
			scopes: SCOPES,
		});
		const authClient = await auth.getClient();

		const sheets = google.sheets({ version: "v4", auth: authClient });
		await syncOptimoNotes();

		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function syncOptimoNotes() {
	const apiKeys = [
		{
			key: "7f82dd3da751ce38b4e8cebfbf408542hh03uA1gQfQ",
			accountName: "NorCal/Pacific Northwest",
		},
		{
			key: "1c602a7ab54fd701aefe95a2695fbd0fzgcqdVVDd4Q",
			accountName: "Northeast/Florida",
		},
		{
			key: "e0f2000c893a3a52fe2b531309fd2a2aiUHL53ptaRE",
			accountName: "SoCal/Rock Mountain",
		},
		{
			key: "50bd3010886802770de1d22ceb2a5cceB2XAGzFtIZs",
			accountName: "Midwest/Texas",
		},
	];

	var result = [];

	var headers = [
		"Account name",
		"Order No",
		"Driver Name",
		"Date",
		"Location Name",
		"Custom Field 5",
		"Status",
		"Form Note",
		"Direct order",
		"Delivered",
		"Direct order invoice amount",
		"Dollar amount match (direct order)?",
		"Amount mismatch details",
		"Unit quantity match (direct order)?",
		"Unit quantity mismatch details",
		"Full service invoice",
		"Full service invoice number",
		"Full service invoice amount",
		"Dollar amount match (full service)?",
		"Amount mismatch details",
		"Unit quantity match (full service)?",
		"Unit quantity mismatch details",
		"Credit?",
		"Credit number",
		"Credit amount",
		"Dollar amount match (credit)?",
		"Amount mismatch details",
		"Unit quantity match (credit)?",
		"Unit quantity mismatch details",
		"Parked order?",
		"Parked order amount",
		"Out-of-stocks",
		"Target PO Number (direct order)",
		"Target PO Number (full service)",
		"UNIQUE ID",
		"STATUS",
		"POD NOTES",
		"STOP TYPE",
		"INV NUMBER",
		"REP NAME",
	];

	for (const region of apiKeys) {
		var orders = await fetchAllOrders(region.key);

		if (orders && orders.length > 0) {
			let orderCompletionDetails = await fetchOrderDetails(
				region.key,
				orders.map((order) => order.id),
			);
			let mergedData = await mergeOrderData(
				orders,
				orderCompletionDetails,
				region.accountName,
			);

			console.log(`Got data from region: ${region.accountName}`);
			result.push(...mergedData);
		} else {
			console.log(`No orders found for region ${region.accountName}`);
		}
	}

	const resultWithHeaders = [headers, ...result];

	// const outSheetID = SHEET_SCHEMAS.OPTIMO_UPLOAD_REWORK.id;
	// const outSheetName =
	// 	SHEET_SCHEMAS.OPTIMO_UPLOAD_REWORK.pages.optimoroute_pod_import;
	// const outSheetRange = "A1:AN";

	// const outRequest = {
	// 	valueInputOption: "USER_ENTERED",
	// 	data: [
	// 		{
	// 			range: `${outSheetName}!${outSheetRange}`,
	// 			majorDimension: "ROWS",
	// 			values: resultWithHeaders,
	// 		},
	// 	],
	// };

	// try {
	// 	const clear = Sheets.Spreadsheets.Values.clear(
	// 		{},
	// 		outSheetID,
	// 		`${outSheetName}!${outSheetRange}`,
	// 	);
	// 	if (clear) {
	// 		console.log(clear);
	// 	} else {
	// 		console.log("Clear failed");
	// 	}

	// 	const response = Sheets.Spreadsheets.Values.batchUpdate(
	// 		outRequest,
	// 		outSheetID,
	// 	);
	// 	if (response) {
	// 		console.log(response);
	// 	} else {
	// 		console.log("No Response");
	// 	}
	// } catch (e) {
	// 	console.log(e);
	// }

	uploadToBigQuery(result);

	console.log("Script run complete");
}

function uploadToBigQuery(data) {
	const bigquery = new BigQuery();
	const projectId = "test-accel";
	const datasetId = "optimo_upload";
	const tableId = "optimo-upload";

	var sqlheaders = [
		"account_name",
		"order_no",
		"driver_name",
		"date",
		"location_name",
		"custom_field_5",
		"status",
		"form_note",
		"direct_order",
		"delivered",
		"direct_order_invoice_amount",
		"dollar_amount_match_direct_order",
		"amount_mismatch_details",
		"unit_quantity_match_direct_order",
		"unit_quantity_mismatch_details",
		"full_service_invoice",
		"full_service_invoice_number",
		"full_service_invoice_amount",
		"dollar_amount_match_full_service",
		"amount_mismatch_details",
		"unit_quantity_match_full_service",
		"unit_quantity_mismatch_details",
		"credit",
		"credit_number",
		"credit_amount",
		"dollar_amount_match_credit",
		"amount_mismatch_details",
		"unit_quantity_match_credit",
		"unit_quantity_mismatch_details",
		"parked_order",
		"parked_order_amount",
		"out_of_stocks",
		"target_po_number_direct_order",
		"target_po_number_full_service",
		"unique_id",
		"status",
		"pod_notes",
		"stop_type",
		"inv_number",
		"rep_name",
	];

	const rows = data.map((row) => {
		const obj = {};
		sqlheaders.forEach((header, i) => {
			obj[header] = row[i];
		});
		return obj;
	});

	let writeDisposition = "WRITE_TRUNCATE";
	for (let i = 0; i <= rows.length; i += 10000) {
		const batch = rows
			.slice(i, 10000 + i)
			.map((row) => JSON.stringify(row))
			.join("\n");
		const blob = Utilities.newBlob(batch, "application/octet-stream");

		const job = {
			configuration: {
				load: {
					destinationTable: {
						projectId: projectId,
						datasetId: datasetId,
						tableId: tableId,
					},
					sourceFormat: "NEWLINE_DELIMITED_JSON",
					writeDisposition: writeDisposition,
				},
			},
		};

		try {
			const insertJob = BigQuery.Jobs.insert(job, projectId, blob);
			console.log(`BigQuery job started: ${insertJob.jobReference.jobId}`);
			writeDisposition = "WRITE_APPEND";
		} catch (e) {
			console.log(`Error inserting data: ${e.message}`);
		}
	}
}

async function fetchAllOrders(apiKey) {
	let dateObj = getCurrentAndTrailingDates();
	var searchOrdersUrl = "https://api.optimoroute.com/v1/search_orders";
	var ordersUrl = `${searchOrdersUrl}?key=${apiKey}`;
	let allOrders = [];
	let after_tag = null;

	// do {
	// 	let payload = {
	// 		dateRange: {
	// 			from: dateObj.startOf2ndTrailingMonth,
	// 			to: dateObj.endOf2ndTrailingMonth,
	// 		},
	// 		includeOrderData: true,
	// 		includeScheduleInformation: true,
	// 	};

	// 	if (after_tag) {
	// 		payload.after_tag = after_tag;
	// 	}

	// 	let options = {
	// 		method: "POST",
	// 		headers: {
	// 			"Content-Type": "application/json",
	// 		},
	// 		body: JSON.stringify(payload),
	// 	};

	// 	try {
	// 		const response = await fetch(ordersUrl, options);
	// 		const data = await response.json();

	// 		if (response.ok && data.success) {
	// 			allOrders = allOrders.concat(data.orders);

	// 			after_tag = data.after_tag || null;
	// 		} else {
	// 			console.log(`Failed to fetch orders: ${JSON.stringify(data)}`);
	// 			break;
	// 		}
	// 	} catch (e) {
	// 		console.log(`Exception: ${e.message}`);
	// 		break;
	// 	}
	// } while (after_tag);

	// do {
	// 	let payload = {
	// 		dateRange: {
	// 			from: dateObj.startOfTrailingMonth,
	// 			to: dateObj.endOfTrailingMonth,
	// 		},
	// 		includeOrderData: true,
	// 		includeScheduleInformation: true,
	// 	};

	// 	if (after_tag) {
	// 		payload.after_tag = after_tag;
	// 	}

	// 	let options = {
	// 		method: "POST",
	// 		headers: {
	// 			"Content-Type": "application/json",
	// 		},
	// 		body: JSON.stringify(payload),
	// 	};

	// 	try {
	// 		const response = await fetch(ordersUrl, options);
	// 		const data = await response.json();

	// 		if (response.ok && data.success) {
	// 			allOrders = allOrders.concat(data.orders);

	// 			after_tag = data.after_tag || null;
	// 		} else {
	// 			console.log(`Failed to fetch orders: ${JSON.stringify(data)}`);
	// 			break;
	// 		}
	// 	} catch (e) {
	// 		console.log(`Exception: ${e.message}`);
	// 		break;
	// 	}
	// } while (after_tag);

	do {
		let payload = {
			dateRange: {
				from: dateObj.startOfCurrentMonth,
				to: dateObj.currentDate,
			},
			includeOrderData: true,
			includeScheduleInformation: true,
		};

		if (after_tag) {
			payload.after_tag = after_tag;
		}

		let options = {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		};

		try {
			const response = await fetch(ordersUrl, options);
			const data = await response.json();

			if (response.ok && data.success) {
				allOrders = allOrders.concat(data.orders);

				after_tag = data.after_tag || null;
			} else {
				console.log(`Failed to fetch orders: ${JSON.stringify(data)}`);
				break;
			}
		} catch (e) {
			console.log(`Exception: ${e.message}`);
			break;
		}
	} while (after_tag);

	return allOrders;
}

async function fetchOrderDetails(apiKey, orderIds) {
	var completionDetailsUrl =
		"https://api.optimoroute.com/v1/get_completion_details";
	var detailsUrl = `${completionDetailsUrl}?key=${apiKey}`;
	var allDetails = [];

	for (let i = 0; i < orderIds.length; i += 500) {
		let chunk = orderIds.slice(i, i + 500);
		let payload = {
			orders: chunk.map((id) => ({ id: id ?? "" })),
		};

		let options = {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		};

		try {
			const response = await fetch(detailsUrl, options);
			const data = await response.json();

			if (response.ok && data.success) {
				allDetails = allDetails.concat(data.orders);
			} else {
				console.log(`Failed to fetch order details: ${JSON.stringify(data)}`);
			}
		} catch (e) {
			console.log(`Exception: ${e.message}`);
		}
	}

	return allDetails;
}

function mergeOrderData(orders, orderCompletionDetails, accountName) {
	var detailsMap = {};
	orderCompletionDetails.forEach((detail) => {
		detailsMap[detail.id] = detail;
	});

	return orders.map((order) => {
		// console.log(order);
		let detail = detailsMap[order.id] || {};
		let driverName = `${order.scheduleInformation?.driverName ?? " "}`.split(
			" ",
		);
		let repId = order.scheduleInformation?.driverName
			? `${driverName[0]}_${driverName[1].charAt(0)}`
			: "";
		let stopType = order.data.location.locationName.split(":")[0];
		let invNumber = "";
		if (order.data.customField5 != "") {
			invNumber = `${order.data.customField5}`;
		}
		let locationName = order.data.location.locationName.split(":")[1];

		return [
			accountName,
			order.data.orderNo,
			order.scheduleInformation?.driverName ?? " ",
			order.data.date,
			locationName,
			order.data.customField5,
			mapStatus(detail.data.status || ""),
			detail.data?.form?.note ?? "",
			mapYesNoChoice(detail.data?.form?.check_do ?? ""),
			mapYesNoChoice(detail.data?.form?.do_delivered ?? ""),
			detail.data?.form?.customer_dollar_amount_match ?? "",
			mapYesNoChoice(detail.data?.form?.dollar_amount_match ?? ""),
			detail.data?.form?.dollar_amount_mismatch ?? "",
			mapYesNoChoice(detail.data?.form?.quantity_match ?? ""),
			detail.data?.form?.quantity_mismatch ?? "",
			//detail.data?.form?.whisha_invoice_documentation ?? '',
			//detail.data?.form?.customer_invoice_documentation ?? '',
			mapYesNoChoice(detail.data?.form?.check_full_service ?? ""),
			detail.data?.form?.full_service_invoice_no ?? "",
			detail.data?.form?.full_service_invoice_amount ?? "",
			mapYesNoChoice(detail.data?.form?.dollar_amount_match_full_service ?? ""),
			detail.data?.form?.customer_amount_mismatch ?? "",
			mapYesNoChoice(detail.data?.form?.quantity_match_full_service ?? ""),
			detail.data?.form?.customer_quantity_mismatch ?? "",
			//detail.data?.form?.whisha_invoice_documentation_full_service ?? '',
			//detail.data?.form?.customer_invoice_documentation_full_service ?? '',
			mapYesNoChoice(detail.data?.form?.check_credit ?? ""),
			detail.data?.form?.credit_no ?? "",
			detail.data?.form?.credit_amount ?? "",
			mapYesNoChoice(detail.data?.form?.dollar_amount_match_credit_2 ?? ""),
			detail.data?.form?.customer_amount_mismatch_2 ?? "",
			mapYesNoChoice(detail.data?.form?.quantity_match_credit_2 ?? ""),
			detail.data?.form?.customer_quantity_mismatch_2 ?? "",
			//detail.data?.form?.whisha_credit_documentation ?? '',
			//detail.data?.form?.customer_credit_documentation ?? '',
			mapYesNoChoice(detail.data?.form?.order_parked ?? ""),
			detail.data?.form?.parked_order_amount ?? "",
			detail.data?.form?.out_of_stocks ?? "",
			detail.data?.form?.target_po_number_direct ?? "",
			detail.data?.form?.target_po_number_full_service ?? "",
			//detail.data?.form?.photos_of_shelf_displays ?? '',
			//detail.data?.form?.images ?? '',
			`${order.data.orderNo}${dateToExcelSerialDate(order.data.date)}${repId}`,
			mapStatus(detail.data.status || ""),
			detail.data?.form?.note ?? "",
			stopType,
			invNumber,
			repId,
		];
	});
}

function mapStatus(status) {
	const statusMapping = {
		rejected: "Rejected",
		failed: "Failed",
		success: "Completed",
	};
	return statusMapping[status] || status; // Return the mapped status or the original if not found
}

function mapYesNoChoice(choice) {
	const choiceMapping = {
		TRUE: "Y",
		FALSE: "N",
		True: "Y",
		False: "N",
		true: "Y",
		false: "N",
		yes: "Y",
		no: "N",
	};
	return choiceMapping[choice] || choice; // Return the mapped status or the original if not found
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

function formatDateToYYYYMMDD(date) {
	return date.toISOString().split("T")[0];
}

function getCurrentAndTrailingDates() {
	const now = new Date();
	const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
	const startOfTrailingMonth = new Date(
		now.getFullYear(),
		now.getMonth() - 1,
		1,
	);
	const endOfTrailingMonth = new Date(now.getFullYear(), now.getMonth(), 0);
	const startOf2ndTrailingMonth = new Date(
		now.getFullYear(),
		now.getMonth() - 2,
		1,
	);
	const endOf2ndTrailingMonth = new Date(
		now.getFullYear(),
		now.getMonth() - 1,
		0,
	);

	const dateObject = {
		currentDate: formatDateToYYYYMMDD(now),
		startOfCurrentMonth: formatDateToYYYYMMDD(startOfCurrentMonth),
		endOfTrailingMonth: formatDateToYYYYMMDD(endOfTrailingMonth),
		startOfTrailingMonth: formatDateToYYYYMMDD(startOfTrailingMonth),
		endOf2ndTrailingMonth: formatDateToYYYYMMDD(endOf2ndTrailingMonth),
		startOf2ndTrailingMonth: formatDateToYYYYMMDD(startOf2ndTrailingMonth),
	};

	return dateObject;
}
