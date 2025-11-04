import { logRuntimeFor } from "../../util/log_runtime_for.js";
import { sheetInserter } from "../../util/sheet_inserter.js";
import dayjs from "dayjs";

export const run = async (req, res) => {
	console.log("Running Sync Optimo Notes");
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

	var result = [];
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
	await uploadToSheet(resultWithHeaders);
	console.log("Script run complete");
}

async function uploadToSheet(resultWithHeaders) {
	const optimoCompletedSheetInserter = sheetInserter({
		outSheetID: "17-RXYMPeujucrW3jk-gWKAWnVLAFVtj-rAvJdwcKP4s",
		outSheetName: "optimo completed",
		outSheetRange: "A1:AO",
	});

	await optimoCompletedSheetInserter.run(resultWithHeaders);
}

async function fetchAllOrders(apiKey) {
	const dates = getSyncDates();
	var searchOrdersUrl = "https://api.optimoroute.com/v1/search_orders";
	var ordersUrl = `${searchOrdersUrl}?key=${apiKey}`;
	let allOrders = [];
	let after_tag = null;

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
				// "unscheduled",
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
		let detail = detailsMap[order.id] || {};
		let driverName = `${order.scheduleInformation?.driverName ?? " "}`.split(
			" ",
		);
		// let repId = order.scheduleInformation?.driverName
		// 	? `${driverName[0]}_${driverName[1].charAt(0)}`
		// 	: "";
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
			`${order.data.orderNo}${dateToExcelSerialDate(order.data.date)}${repId}`,
			mapStatus(detail.data.status || ""),
			detail.data?.form?.note ?? "",
			stopType,
			invNumber,
			repId,
			orderID,
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

function getSyncDates() {
	const now = dayjs();
	const dateFormat = "YYYY-MM-DD";
	const dateRangeToFetch = {
		start: now.subtract(7, "day").format(dateFormat),
		end: now.format(dateFormat),
	};
	return dateRangeToFetch;
}
