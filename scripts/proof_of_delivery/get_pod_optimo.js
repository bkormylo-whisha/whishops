import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import { BigQuery } from "@google-cloud/bigquery";
import { SHEET_SCHEMAS } from "../../util/sheet_schemas.js";
import { logRuntimeFor } from "../../util/log_runtime_for.js";
import { sheetInserter } from "../../util/sheet_inserter.js";

export const run = async (req, res) => {
	console.log("Running Sync Optimo Notes");
	try {
		await logRuntimeFor(getPODOptimo);
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function getPODOptimo() {
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

	var headers = [
		"Order ID",
		"Invoice No",
		"Whisha POD",
		"Customer POD",
		"Shelf Photo",
	];

	var result = [];
	for (const region of apiKeys) {
		var orders = await fetchAllOrders(region.key);
		if (orders && orders.length > 0) {
			let orderCompletionDetails = await fetchOrderDetails(
				region.key,
				orders.map((order) => order.id),
			);
			let mergedData = await mergeOrderData(orders, orderCompletionDetails);
			console.log(`Got data from region: ${region.accountName}`);
			result.push(...mergedData);
		} else {
			console.log(`No orders found for region ${region.accountName}`);
		}
	}

	const resultWithHeaders = [headers, ...result];
	await uploadToSheet(resultWithHeaders);
	// await uploadToBigQuery(result);
	console.log("Script run complete");
}

// async function uploadToBigQuery(data) {
// 	const bigquery = new BigQuery();
// 	const projectId = "whishops";
// 	const datasetId = "order_management";
// 	const tableId = "optimo-visit-log";

// 	const fullTableName = `${projectId}.${datasetId}.${tableId}`;
// 	const query = `TRUNCATE TABLE \`${fullTableName}\``;
// 	const options = {
// 		query: query,
// 		location: "us-west1",
// 	};

// 	try {
// 		const [job] = await bigquery.createQueryJob(options);
// 		console.log(`Table ${fullTableName} successfully truncated.`);
// 		await job.getQueryResults();
// 	} catch (e) {
// 		console.error(`Error truncating table ${fullTableName}:`, e);
// 		throw e;
// 	}

// 	var sqlheaders = [
// 		"account_name",
// 		"order_no",
// 		"driver_name",
// 		"date",
// 		"location_name",
// 		"custom_field_5",
// 		"status",
// 		"form_note",
// 		"direct_order",
// 		"delivered",
// 		"direct_order_invoice_amount",
// 		"dollar_amount_match_direct_order",
// 		"amount_mismatch_details",
// 		"unit_quantity_match_direct_order",
// 		"unit_quantity_mismatch_details",
// 		"full_service_invoice",
// 		"full_service_invoice_number",
// 		"full_service_invoice_amount",
// 		"dollar_amount_match_full_service",
// 		"amount_mismatch_details",
// 		"unit_quantity_match_full_service",
// 		"unit_quantity_mismatch_details",
// 		"credit",
// 		"credit_number",
// 		"credit_amount",
// 		"dollar_amount_match_credit",
// 		"amount_mismatch_details",
// 		"unit_quantity_match_credit",
// 		"unit_quantity_mismatch_details",
// 		"parked_order",
// 		"parked_order_amount",
// 		"out_of_stocks",
// 		"target_po_number_direct_order",
// 		"target_po_number_full_service",
// 		"unique_id",
// 		"status",
// 		"pod_notes",
// 		"stop_type",
// 		"inv_number",
// 		"rep_name",
// 		"order_id",
// 	];

// 	const batchSize = 5000;
// 	for (let i = 0; i < data.length; i += batchSize) {
// 		const rawBatch = data.slice(i, i + batchSize);

// 		const processedBatch = rawBatch.map((row) => {
// 			const obj = {};
// 			sqlheaders.forEach((header, j) => {
// 				obj[header] = row[j];
// 			});
// 			return obj;
// 		});

// 		try {
// 			await bigquery.dataset(datasetId).table(tableId).insert(processedBatch);
// 			console.log(
// 				`Successfully inserted a batch of ${processedBatch.length} rows.`,
// 			);
// 		} catch (e) {
// 			console.error(`Error inserting batch at index ${i}:`, e);
// 		}
// 	}
// }

// async function getAuthenticatedClient() {
// 	const base64String = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64;
// 	const jsonString = Buffer.from(base64String, "base64").toString("utf-8");
// 	const credentials = JSON.parse(jsonString);

// 	const auth = new GoogleAuth({
// 		credentials: {
// 			client_email: credentials.client_email,
// 			private_key: credentials.private_key,
// 		},
// 		scopes: ["https://www.googleapis.com/auth/spreadsheets"], // And other scopes
// 	});

// 	return await auth.getClient();
// }

async function uploadToSheet(resultWithHeaders) {
	const podSheetInserter = sheetInserter({
		functionName: "Insert POD Optimo",
		outSheetID: SHEET_SCHEMAS.POD_IMPORT.prod_id,
		outSheetName: SHEET_SCHEMAS.POD_IMPORT.pages.pod,
		outSheetRange: "A1",
	});

	await podSheetInserter.run(resultWithHeaders);
}

async function fetchAllOrders(apiKey) {
	let dateObj = getCurrentAndTrailingDates();
	var searchOrdersUrl = "https://api.optimoroute.com/v1/search_orders";
	var ordersUrl = `${searchOrdersUrl}?key=${apiKey}`;
	let allOrders = [];
	let after_tag = null;

	for (const dates of dateObj) {
		do {
			let payload = {
				dateRange: {
					from: dates.start,
					to: dates.end,
				},
				includeOrderData: true,
				includeScheduleInformation: true,
				orderStatus: [
					// "scheduled",
					// "on_route",
					// "servicing",
					"success",
					// "failed",
					// "rejected",
				],
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
	}

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

async function mergeOrderData(orders, orderCompletionDetails) {
	let detailsMap = new Map();
	console.log(orders.length);
	console.log(orderCompletionDetails.length);
	for (const orderCompletionDetail of orderCompletionDetails) {
		detailsMap.set(orderCompletionDetail.id, orderCompletionDetail);
	}

	let result = [];

	for (const order of orders) {
		const orderID = order.id;
		const orderDetails = detailsMap.get(orderID);
		if (!orderDetails) {
			console.log("No details found");
		}
		const form = orderDetails.data?.form ?? "";
		let cin7InvoiceNo;
		let whishaInvoiceUrls;
		let customerInvoiceUrls;
		let shelfPhotoUrls;
		if (form && typeof form === "object") {
			cin7InvoiceNo = form.full_service_invoice_number;
			whishaInvoiceUrls =
				form.whisha_invoice_documentation_full_service
					?.map((imageObj) => imageObj.url)
					.join(", ") ?? "";
			customerInvoiceUrls =
				form.customer_invoice_documentation_full_service
					?.map((imageObj) => imageObj.url)
					.join(", ") ?? "";
			shelfPhotoUrls =
				form.photos_of_shelf_displays
					?.map((imageObj) => imageObj.url)
					.join(", ") ?? "";
		}

		let invNumber = "";
		if (order.data.customField5 !== "") {
			invNumber = `${order.data.customField5}`;
		}

		result.push([
			orderID,
			cin7InvoiceNo,
			whishaInvoiceUrls,
			customerInvoiceUrls,
			shelfPhotoUrls,
		]);
	}

	return result;
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

	const monthsToFetch = [
		// {
		// 	start: formatDateToYYYYMMDD(startOf2ndTrailingMonth),
		// 	end: formatDateToYYYYMMDD(endOf2ndTrailingMonth),
		// },
		// {
		// 	start: formatDateToYYYYMMDD(startOfTrailingMonth),
		// 	end: formatDateToYYYYMMDD(endOfTrailingMonth),
		// },
		{
			start: formatDateToYYYYMMDD(startOfCurrentMonth),
			end: formatDateToYYYYMMDD(now),
		},
	];

	return monthsToFetch;
}
