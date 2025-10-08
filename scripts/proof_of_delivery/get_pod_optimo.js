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
		"Stop ID",
		"Invoice No",
		"Target PO Number Direct",
		"Whisha POD",
		"Customer POD",
		"Notes",
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

async function uploadToBigQuery(data) {
	const bigquery = new BigQuery();
	const projectId = "whishops";
	const datasetId = "finance";
	const tableId = "pod_import";

	const fullTableName = `${projectId}.${datasetId}.${tableId}`;
	const query = `TRUNCATE TABLE \`${fullTableName}\``;
	const options = {
		query: query,
		location: "us-west1",
	};

	// try {
	// 	const [job] = await bigquery.createQueryJob(options);
	// 	console.log(`Table ${fullTableName} successfully truncated.`);
	// 	await job.getQueryResults();
	// } catch (e) {
	// 	console.error(`Error truncating table ${fullTableName}:`, e);
	// 	throw e;
	// }

	var sqlheaders = [
		"order_date",
		"region",
		"stop_id",
		"invoice_number",
		"target_po_number",
		"whisha_pod",
		"customer_pod",
		"notes",
	];

	const batchSize = 5000;
	for (let i = 0; i < data.length; i += batchSize) {
		const rawBatch = data.slice(i, i + batchSize);

		const processedBatch = rawBatch.map((row) => {
			const obj = {};
			sqlheaders.forEach((header, j) => {
				obj[header] = row[j];
			});
			return obj;
		});

		try {
			await bigquery.dataset(datasetId).table(tableId).insert(processedBatch);
			console.log(
				`Successfully inserted a batch of ${processedBatch.length} rows.`,
			);
		} catch (e) {
			console.error(`Error inserting batch at index ${i}:`, e);
		}
	}
}

async function uploadToSheet(resultWithHeaders) {
	const podSheetInserter = sheetInserter({
		functionName: "Insert POD Optimo",
		outSheetID: SHEET_SCHEMAS.POD_IMPORT.prod_id,
		outSheetName: SHEET_SCHEMAS.POD_IMPORT.pages.pod,
		outSheetRange: "A1:I",
		wipePreviousData: true,
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
				orderStatus: [
					"scheduled",
					"on_route",
					"servicing",
					"success",
					"failed",
					"rejected",
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
		const orderDate = dayjs(order.data?.date ?? "").format("YYYY-MM-DD");
		const region = order.region;
		const stopID = order.data?.orderNo ?? "";
		const form = orderDetails.data?.form ?? "";
		let cin7InvoiceNo;
		let whishaInvoiceUrls;
		let customerInvoiceUrls;
		let shelfPhotoUrls;
		let targetPoNumberDirect;
		const notes = form?.note ?? "";
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
			stopID,
			invNumber,
			targetPoNumberDirect,
			whishaInvoiceUrls,
			customerInvoiceUrls,
			notes,
		]);
	}

	return result;
}

function getCurrentAndTrailingDates() {
	const format = "YYYY-MM-DD";
	const now = dayjs();
	const startOfCurrentMonth = dayjs().month(now.month()).date(1);
	const startOfTrailingMonth = dayjs()
		.month(now.month() - 1)
		.date(1);
	const endOfTrailingMonth = dayjs()
		.month(now.month())
		.date(1)
		.subtract(1, "day");
	const startOf2ndTrailingMonth = dayjs()
		.month(now.month() - 2)
		.date(1);
	const endOf2ndTrailingMonth = dayjs()
		.month(now.month() - 1)
		.date(1)
		.subtract(1, "day");
	const startOf3rdTrailingMonth = dayjs()
		.month(now.month() - 3)
		.date(1);
	const endOf3rdTrailingMonth = dayjs()
		.month(now.month() - 2)
		.date(1)
		.subtract(1, "day");

	const startOf4thTrailingMonth = dayjs()
		.month(now.month() - 4)
		.date(1);
	const endOf4thTrailingMonth = dayjs()
		.month(now.month() - 3)
		.date(1)
		.subtract(1, "day");

	const startOf5thTrailingMonth = dayjs()
		.month(now.month() - 5)
		.date(1);
	const endOf5thTrailingMonth = dayjs()
		.month(now.month() - 4)
		.date(1)
		.subtract(1, "day");

	const startOf6thTrailingMonth = dayjs()
		.month(now.month() - 6)
		.date(1);
	const endOf6thTrailingMonth = dayjs()
		.month(now.month() - 5)
		.date(1)
		.subtract(1, "day");

	const startOf7thTrailingMonth = dayjs()
		.month(now.month() - 7)
		.date(1);
	const endOf7thTrailingMonth = dayjs()
		.month(now.month() - 6)
		.date(1)
		.subtract(1, "day");

	const startOf8thTrailingMonth = dayjs()
		.month(now.month() - 8)
		.date(1);
	const endOf8thTrailingMonth = dayjs()
		.month(now.month() - 7)
		.date(1)
		.subtract(1, "day");

	const monthsToFetch = [
		// {
		// 	start: startOf8thTrailingMonth.format(format),
		// 	end: endOf8thTrailingMonth.format(format),
		// },
		// {
		// 	start: startOf7thTrailingMonth.format(format),
		// 	end: endOf7thTrailingMonth.format(format),
		// },

		// {
		// 	start: startOf6thTrailingMonth.format(format),
		// 	end: endOf6thTrailingMonth.format(format),
		// },
		// {
		// 	start: startOf5thTrailingMonth.format(format),
		// 	end: endOf5thTrailingMonth.format(format),
		// },

		// {
		// 	start: startOf4thTrailingMonth.format(format),
		// 	end: endOf4thTrailingMonth.format(format),
		// },
		// {
		// 	start: startOf3rdTrailingMonth.format(format),
		// 	end: endOf3rdTrailingMonth.format(format),
		// },

		{
			start: startOf2ndTrailingMonth.format(format),
			end: endOf2ndTrailingMonth.format(format),
		},
		{
			start: startOfTrailingMonth.format(format),
			end: endOfTrailingMonth.format(format),
		},
		{
			start: startOfCurrentMonth.format(format),
			end: now.format(format),
		},
	];

	return monthsToFetch;
}
