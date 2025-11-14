import excelDateToTimestamp from "../../util/excel_date_to_timestamp.js";
import { sheetInserter } from "../../util/sheet_inserter.js";
import { logRuntimeFor } from "../../util/log_runtime_for.js";
import dayjs from "dayjs";
import { sheetExtractor } from "../../util/sheet_extractor.js";
import { SHEET_SCHEMAS } from "../../util/sheet_schemas.js";

export const run = async (req, res) => {
	console.log("Running Sync Optimo Notes");
	try {
		await logRuntimeFor(syncOptimoNotes);
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
	const dates = await getCurrentAndTrailingDates();

	let result = [];
	for (const region of apiKeys) {
		let orders = await fetchRecentOrders(region.key, dates);
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

	await uploadToSheet(result);
	console.log("Script run complete");
}

async function uploadToSheet(data) {
	const optimoNotesSheetInserter = sheetInserter({
		outSheetID: "1w3FMxmJEYvGli8akqG6SkQSCqiUCHN7mW-udmiufEd0",
		outSheetName: "Notes",
		outSheetRange: "A2:AO",
		wipeAfterPush: true,
	});

	await optimoNotesSheetInserter.run(data);
}

async function fetchRecentOrders(apiKey, dateRanges) {
	let searchOrdersUrl = "https://api.optimoroute.com/v1/search_orders";
	let ordersUrl = `${searchOrdersUrl}?key=${apiKey}`;
	let allOrders = [];
	let after_tag = null;

	for (const dates of dateRanges) {
		do {
			let payload = {
				dateRange: {
					from: dates.start,
					to: dates.end,
				},
				includeOrderData: true,
				includeScheduleInformation: true,
				orderStatus: ["success", "failed", "rejected"],
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
	let completionDetailsUrl =
		"https://api.optimoroute.com/v1/get_completion_details";
	let detailsUrl = `${completionDetailsUrl}?key=${apiKey}`;
	let allDetails = [];

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
	let detailsMap = {};
	orderCompletionDetails.forEach((detail) => {
		detailsMap[detail.id] = detail;
	});

	return orders.map((order) => {
		let detail = detailsMap[order.id] || {};
		let repId = `${order.data.assignedTo?.serial ?? " "}`;
		let stopType = order.data.location.locationName.split(":")[0];
		let invNumber = "";
		if (order.data.customField5 !== "") {
			invNumber = `${order.data.customField5}`;
		}
		let locationName = order.data.location.locationName.split(":")[1];
		let orderID = `${order.id}`;

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
			mapYesNoChoice(detail.data?.form?.check_full_service ?? ""),
			detail.data?.form?.full_service_invoice_no ?? "",
			detail.data?.form?.full_service_invoice_amount ?? "",
			mapYesNoChoice(detail.data?.form?.dollar_amount_match_full_service ?? ""),
			detail.data?.form?.customer_amount_mismatch ?? "",
			mapYesNoChoice(detail.data?.form?.quantity_match_full_service ?? ""),
			detail.data?.form?.customer_quantity_mismatch ?? "",
			mapYesNoChoice(detail.data?.form?.check_credit ?? ""),
			detail.data?.form?.credit_no ?? "",
			detail.data?.form?.credit_amount ?? "",
			mapYesNoChoice(detail.data?.form?.dollar_amount_match_credit_2 ?? ""),
			detail.data?.form?.customer_amount_mismatch_2 ?? "",
			mapYesNoChoice(detail.data?.form?.quantity_match_credit_2 ?? ""),
			detail.data?.form?.customer_quantity_mismatch_2 ?? "",
			mapYesNoChoice(detail.data?.form?.order_parked ?? ""),
			detail.data?.form?.parked_order_amount ?? "",
			detail.data?.form?.out_of_stocks ?? "",
			detail.data?.form?.target_po_number_direct ?? "",
			detail.data?.form?.target_po_number_full_service ?? "",
			`${order.data.orderNo}${dateToExcelSerialDate(order.data.date)}${repId}${order.data.customField5 ?? ""}`,
			mapStatus(detail.data.status || ""),
			detail.data?.form?.note ?? "",
			stopType,
			invNumber,
			repId,
			// orderID,
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

	return days + 3; // Was set to +1 but wasn't matching the IDs currently in WhishAccel
}

function generateMonthlyDateRanges(startDate, endDate) {
	let current = dayjs(startDate);
	const endDay = dayjs(endDate);

	if (current.isAfter(endDay, "day")) {
		console.error("Start date cannot be after end date.");
		return [];
	}

	const ranges = [];

	while (current.isBefore(endDay, "day") || current.isSame(endDay, "day")) {
		const endOfMonth = current.endOf("month").startOf("day");

		const rangeEnd = endOfMonth.isBefore(endDay, "day") ? endOfMonth : endDay;

		ranges.push({
			start: current.format("YYYY-MM-DD"),
			end: rangeEnd.format("YYYY-MM-DD"),
		});

		if (rangeEnd.isSame(endDay, "day")) {
			break;
		}

		current = rangeEnd.add(1, "day").startOf("day");
	}

	return ranges;
}

async function getCurrentAndTrailingDates() {
	const mvlExtractor = sheetExtractor({
		inSheetID: SHEET_SCHEMAS.WHISHACCEL_ISOLATED_VERSION.prod_id,
		inSheetName:
			SHEET_SCHEMAS.WHISHACCEL_ISOLATED_VERSION.pages.master_visit_log,
		inSheetRange: "C3:C",
		silent: true,
	});

	const mvlDates = await mvlExtractor.run();
	const mvlDatesFlattened = mvlDates
		.map((date) => Number(date.at(0)))
		.filter((date) => !Number.isNaN(date))
		.sort();

	const minDate = excelDateToTimestamp(Math.min(...mvlDatesFlattened));
	const maxDate = excelDateToTimestamp(Math.max(...mvlDatesFlattened));

	return generateMonthlyDateRanges(minDate, maxDate);
}
