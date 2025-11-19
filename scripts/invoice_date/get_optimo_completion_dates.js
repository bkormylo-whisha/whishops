import { BigQuery } from "@google-cloud/bigquery";
import { logRuntimeFor } from "../../util/log_runtime_for.js";
import { sheetInserter } from "../../util/sheet_inserter.js";
import dayjs from "dayjs";

// Used for a report for Tanner
export const run = async (req, res) => {
	console.log("Running Get Optimo Completion Dates");
	try {
		await logRuntimeFor(getOptimoCompletionDates);
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function getOptimoCompletionDates() {
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

	const headers = [
		"Date",
		"Account name",
		"Driver ID",
		"Location Name",
		"Stop Type",
		"Invoice Number",
		"Duration (Min)",
	];

	let result = [];
	for (const region of apiKeys) {
		const orders = await fetchAllOrders(region.key);
		if (orders && orders.length > 0) {
			const orderCompletionDetails = await fetchOrderDetails(
				region.key,
				orders.map((order) => order.id),
			);
			const mergedData = await mergeOrderData(
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
	await uploadToSheet(resultWithHeaders);
	console.log("Script run complete");
}

async function uploadToSheet(resultWithHeaders) {
	const durationSheetInserter = sheetInserter({
		outSheetID: "19FGG2sZ8yFDwHHK4EP5wjUirzzMY-v7v5mJ1uPUhngw",
		outSheetName: "durations",
		outSheetRange: "A1:G",
		// wipePreviousData: true,
		append: true,
		silent: true,
	});

	await durationSheetInserter.run(resultWithHeaders);
}

async function fetchAllOrders(apiKey) {
	const dates = getSyncDates();
	// const dateRanges = getCurrentAndTrailingDates();
	const searchOrdersUrl = "https://api.optimoroute.com/v1/search_orders";
	const ordersUrl = `${searchOrdersUrl}?key=${apiKey}`;
	let allOrders = [];
	let after_tag = null;

	// for (const dateRange of dateRanges) {
	do {
		let payload = {
			// dateRange: {
			// 	from: dateRange.start,
			// 	to: dateRange.end,
			// },
			dateRange: {
				from: dates.start,
				to: dates.end,
			},
			includeOrderData: true,
			includeScheduleInformation: true,
			orderStatus: ["success"],
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
	// }

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

async function mergeOrderData(orders, orderCompletionDetails, accountName) {
	let detailsMap = new Map();
	orderCompletionDetails.forEach((detail) => {
		detailsMap.set(detail.id, detail);
	});

	const masterStoreListData = await getMasterStoreListFromBQ();
	const masterStoreMap = new Map();

	for (const row of masterStoreListData) {
		masterStoreMap.set(row.stop_id, row.region);
	}

	let result = [];

	for (const order of orders) {
		const detail = detailsMap.get(order.id) || {};
		const driverName = `${order.scheduleInformation?.driverName ?? " "}`.split(
			" ",
		);
		const repId = `${order.data.assignedTo?.serial ?? " "}`;
		const stopType = order.data.location.locationName.split(":")[0];
		let invNumber = "";
		if (order.data.customField5 !== "") {
			invNumber = `${order.data.customField5}`;
		}
		const locationName = order.data.location.locationName.split(":")[1];

		if (!detail.data.startTime?.utcTime || !detail.data.endTime?.utcTime)
			continue;

		const startTime = dayjs(detail.data.startTime.utcTime);
		const endTime = dayjs(detail.data.endTime.utcTime);
		const duration = endTime.diff(startTime, "minute");

		const mslData = masterStoreMap.get(order.data.orderNo);

		result.push([
			order.data.date,
			accountName,
			repId,
			order.data.orderNo,
			stopType,
			mslData,
			duration,
		]);
	}

	return result;
}

async function getMasterStoreListFromBQ() {
	try {
		const bigquery = new BigQuery();
		const query = `
			SELECT cin7_name, region, stop_id
			FROM \`whishops.order_management.master-store-list\`
		`;

		console.log("Executing query");
		const [rows] = await bigquery.query(query);

		return rows;
	} catch (error) {
		console.error("Error during BigQuery API call:", error);
		throw error;
	}
}

function getSyncDates() {
	const now = dayjs();
	const dateFormat = "YYYY-MM-DD";
	const dateRangeToFetch = {
		start: now.subtract(30, "day").format(dateFormat),
		end: now.subtract(1, "day").format(dateFormat),
	};
	return dateRangeToFetch;
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
		{
			start: startOf4thTrailingMonth.format(format),
			end: endOf4thTrailingMonth.format(format),
		},
		{
			start: startOf3rdTrailingMonth.format(format),
			end: endOf3rdTrailingMonth.format(format),
		},
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
