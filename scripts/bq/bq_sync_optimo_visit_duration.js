import { BigQuery } from "@google-cloud/bigquery";
import { logRuntimeFor } from "../../util/log_runtime_for.js";

export const run = async (req, res) => {
	console.log("Running Sync Optimo Notes");
	try {
		await logRuntimeFor(syncOptimoVisitDuration);
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function syncOptimoVisitDuration() {
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

	const orderHistory = await getOrderHistoryFromBQ();
	const regionalOrderHistory = {
		ncpnw: orderHistory.filter(
			(order) => order.account_name === "NorCal/Pacific Northwest",
		),
		scrm: orderHistory.filter(
			(order) => order.account_name === "SoCal/Rock Mountain",
		),
		mwtx: orderHistory.filter(
			(order) => order.account_name === "Midwest/Texas",
		),
		nefl: orderHistory.filter(
			(order) => order.account_name === "Northeast/Florida",
		),
	};

	console.log(`NCPNW Orders: ${regionalOrderHistory.ncpnw.length}`);
	console.log(`SCRM Orders: ${regionalOrderHistory.scrm.length}`);
	console.log(`MWTX Orders: ${regionalOrderHistory.mwtx.length}`);
	console.log(`NEFL Orders: ${regionalOrderHistory.nefl.length}`);

	var allOrdersWithDurations = [];
	for (const region of apiKeys) {
		var regionalOrders;
		switch (region.accountName) {
			case "NorCal/Pacific Northwest":
				regionalOrders = { orders: regionalOrderHistory.ncpnw };
				break;
			case "Northeast/Florida":
				regionalOrders = { orders: regionalOrderHistory.nefl };
				break;
			case "SoCal/Rock Mountain":
				regionalOrders = { orders: regionalOrderHistory.scrm };
				break;
			case "Midwest/Texas":
				regionalOrders = { orders: regionalOrderHistory.mwtx };
				break;
			default:
				break;
		}
		if (regionalOrders.orders && regionalOrders.orders.length > 0) {
			let orderCompletionDetails = await fetchOrderCompletionTimes(
				region.key,
				regionalOrders.orders,
			);
			console.log(`Got data from region: ${region.accountName}`);
			const dataToUpload = await mergeOrderData(
				regionalOrders.orders,
				orderCompletionDetails,
			);
			allOrdersWithDurations.push(...dataToUpload);
		} else {
			console.log(`No orders found for region ${region.accountName}`);
		}
	}

	console.log(allOrdersWithDurations.slice(0, 10));

	const durationMap = buildDurationMap(allOrdersWithDurations);

	console.log(durationMap.get("NG002-01"));

	// await uploadToBigQuery(result);
	// console.log("Script run complete");
}

function buildDurationMap(stopDurations) {
	const stopTypes = [
		"SPRINT",
		"DIRECT",
		"DIRECT/DROP",
		"DIRECT/SPRINT",
		"FULL/SPRINT",
		"SUPPLY",
		"TRAINING",
		"QC",
		"COUNT",
		"MERCH",
		"CROSSDOCK",
		"CROSSDOCK35",
		"CROSSDOCK60",
	];
	const durationMap = new Map();
	for (const duration of stopDurations) {
		const prevArr = durationMap.get(duration[0]) ?? [];
		durationMap.set(duration[0], [...prevArr, duration[2]]);
	}
	return durationMap;
}

// async function uploadToBigQuery(data) {
// 	const bigquery = new BigQuery();
// 	const projectId = "whishops";
// 	const datasetId = "order_management";
// 	const tableId = "optimo-visit-duration";

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

async function getOrderHistoryFromBQ() {
	try {
		const bigquery = new BigQuery();
		const today = new Date();

		const firstDayOfCurrentMonth = new Date(
			today.getFullYear(),
			today.getMonth(),
			1,
		);
		const lastDayOfPreviousMonth = new Date(
			firstDayOfCurrentMonth.setDate(firstDayOfCurrentMonth.getDate() - 1),
		);
		const firstDayOfPreviousMonth = new Date(
			lastDayOfPreviousMonth.getFullYear(),
			lastDayOfPreviousMonth.getMonth() - 1,
			1,
		);
		const startDate = firstDayOfPreviousMonth.toISOString().split("T")[0];
		const endDate = lastDayOfPreviousMonth.toISOString().split("T")[0];

		const query = `
			SELECT account_name, order_no, stop_type, order_id
			FROM \`whishops.order_management.optimo-visit-log\`
			WHERE
				date >= '${startDate}'
				AND date <= '${endDate}'
		`;

		console.log("Executing query");
		const [rows] = await bigquery.query(query);

		return rows;
	} catch (error) {
		console.error("Error during BigQuery API call:", error);
		throw error;
	}
}

async function fetchOrderCompletionTimes(apiKey, orders) {
	var completionDetailsUrl =
		"https://api.optimoroute.com/v1/get_completion_details";
	var detailsUrl = `${completionDetailsUrl}?key=${apiKey}`;
	var allDetails = [];
	const orderIds = orders.map((order) => {
		return { id: order.order_id };
	});

	for (let i = 0; i < orderIds.length; i += 500) {
		let chunk = orderIds.slice(i, i + 500);
		let payload = {
			orders: chunk.map((order) => ({ id: order.id ?? "" })),
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
	const detailsMap = new Map();
	orderCompletionDetails.forEach((detail) => {
		detailsMap.set(detail.id, detail.data);
	});

	const result = [];
	for (const order of orders) {
		const stopID = order.order_no;
		const completionDetails = detailsMap.get(order.order_id);
		if (!completionDetails.startTime) {
			continue;
		}

		const startTime = completionDetails.startTime?.unixTimestamp;
		const endTime = completionDetails.endTime?.unixTimestamp;
		// Stop type is a problem, not sure how to categorize
		const stopType = order.stop_type;
		let sprintDuration = 0;
		let directDuration = 0;
		if (stopType === "DIRECT") {
			directDuration = endTime - startTime;
		} else {
			sprintDuration = endTime - startTime;
		}

		result.push([stopID, directDuration, sprintDuration]);
	}
	return result;
}
