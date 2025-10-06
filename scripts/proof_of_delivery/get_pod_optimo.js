import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import { BigQuery } from "@google-cloud/bigquery";
import { SHEET_SCHEMAS } from "../../util/sheet_schemas.js";
import { logRuntimeFor } from "../../util/log_runtime_for.js";
import { sheetInserter } from "../../util/sheet_inserter.js";
import dayjs from "dayjs";

export const run = async (req, res) => {
	console.log("Running Optimo POD Extraction");
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
		"Order Date",
		"Region",
		// "Optimoroute ID",
		"Stop ID",
		"Invoice No",
		"Target PO Number Direct",
		// "Target PO Number From Order",
		"Whisha POD",
		"Customer POD",
		"Shelf Photo",
	];

	var result = [];
	for (const region of apiKeys) {
		var orders = await fetchAllOrders(region);
		if (orders && orders.length > 0) {
			let orderCompletionDetails = await fetchOrderDetails(
				region,
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

async function uploadToSheet(resultWithHeaders) {
	const podSheetInserter = sheetInserter({
		functionName: "Insert POD Optimo",
		outSheetID: SHEET_SCHEMAS.POD_IMPORT.prod_id,
		outSheetName: SHEET_SCHEMAS.POD_IMPORT.pages.pod,
		outSheetRange: "A1",
		wipePrevousData: true,
		insertTimestamp: true,
		timestampCol: 8,
	});

	await podSheetInserter.run(resultWithHeaders);
}

async function fetchAllOrders(region) {
	let dateObj = getCurrentAndTrailingDates();
	var searchOrdersUrl = "https://api.optimoroute.com/v1/search_orders";
	var ordersUrl = `${searchOrdersUrl}?key=${region.key}`;
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
				// orderStatus: [
				// 	// "scheduled",
				// 	// "on_route",
				// 	// "servicing",
				// 	// "success",
				// 	// "failed",
				// 	// "rejected",
				// ],
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

	const ordersTaggedWithRegion = allOrders.map((row) => {
		return {
			...row,
			region: region.accountName,
		};
	});

	return ordersTaggedWithRegion;
}

async function fetchOrderDetails(region, orderIds) {
	var completionDetailsUrl =
		"https://api.optimoroute.com/v1/get_completion_details";
	var detailsUrl = `${completionDetailsUrl}?key=${region.key}`;
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
		const optimorouteID = order.id;
		const orderDetails = detailsMap.get(optimorouteID);
		if (!orderDetails) {
			console.log("No details found");
		}
		const orderDate = order.data?.date ?? "";
		const region = order.region;
		const stopID = order.data?.orderNo ?? "";
		const form = orderDetails.data?.form ?? "";
		let cin7InvoiceNo;
		let whishaInvoiceUrls;
		let customerInvoiceUrls;
		let shelfPhotoUrls;
		let targetPoNumberDirect;
		// console.log(order);
		// console.log(form);

		if (form && typeof form === "object") {
			cin7InvoiceNo = form.full_service_invoice_no;
			targetPoNumberDirect = form.target_po_number_direct;
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

			if (whishaInvoiceUrls.length === 0) {
				whishaInvoiceUrls =
					form.whisha_invoice_documentation
						?.map((imageObj) => imageObj.url)
						.join(", ") ?? "";
			}

			if (customerInvoiceUrls.length === 0) {
				customerInvoiceUrls =
					form.customer_invoice_documentation
						?.map((imageObj) => imageObj.url)
						.join(", ") ?? "";
			}
		}

		let invNumber = "";
		if (order.data.customField5 !== "") {
			invNumber = `${order.data.customField5}`;
		} else {
			invNumber = cin7InvoiceNo;
		}

		result.push([
			orderDate,
			region,
			// optimorouteID,
			stopID,
			invNumber,
			targetPoNumberDirect,
			// targetPoFromOtherField,
			whishaInvoiceUrls,
			customerInvoiceUrls,
			shelfPhotoUrls,
		]);
	}

	return result;
}

function getCurrentAndTrailingDates() {
	const format = "YYYY-MM-DD";
	const now = dayjs();
	const formattedNow = now.format(format);
	const startOfCurrentMonth = dayjs().month(now.month()).date(1).format(format);
	const startOfTrailingMonth = dayjs()
		.month(now.month() - 1)
		.date(1)
		.format(format);
	const endOfTrailingMonth = dayjs()
		.month(now.month())
		.subtract(1, "day")
		.format(format);
	const startOf2ndTrailingMonth = dayjs()
		.month(now.month() - 2)
		.date(1)
		.format(format);
	const endOf2ndTrailingMonth = dayjs()
		.month(now.month() - 1)
		.subtract(1, "day")
		.format(format);
	const startOf3rdTrailingMonth = dayjs()
		.month(now.month() - 3)
		.date(1)
		.format(format);
	const endOf3rdTrailingMonth = dayjs()
		.month(now.month() - 2)
		.subtract(1, "day")
		.format(format);

	const monthsToFetch = [
		// {
		// 	start: startOf3rdTrailingMonth,
		// 	end: endOf3rdTrailingMonth,
		// },
		// {
		// 	start: startOf2ndTrailingMonth,
		// 	end: endOf2ndTrailingMonth,
		// },
		{
			start: startOfTrailingMonth,
			end: endOfTrailingMonth,
		},
		{
			start: startOfCurrentMonth,
			end: formattedNow,
		},
	];

	return monthsToFetch;
}
