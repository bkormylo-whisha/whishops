import { BigQuery } from "@google-cloud/bigquery";
import psqlHelper from "../../util/psql_helper.js";
import { logRuntimeFor } from "../../util/log_runtime_for.js";
import { sheetExtractor } from "../../util/sheet_extractor.js";
import dayjs from "dayjs";

export const run = async (req, res) => {
	console.log("Running Sync Optimo Data PSQL");
	try {
		await logRuntimeFor(syncOptimoDataPSQL);
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

const sqlheaders = [
	"stop_id",
	"store",
	"date",
	"stop_type",
	"service_rep",
	"invoice_number",
	"blank",
	"inv_adj",
	"stop_completed_manual",
	"stop_completed",
	"urgency",
	"optimo_status",
	"direct_order",
	"direct_invoice_number",
	"direct_delivered",
	"order_parked",
	"rsr_optimoroute_notes",
	"direct_order_dollar_amount_match",
	"direct_order_quantity_match",
	"full_service_invoice_number",
	"full_service_dollar_amount_match",
	"out_of_stock_count",
	"po_number_direct",
	"po_number_full_service",
	"notes",
	"must_have_formula",
	"unique_id",
	"unique_id_doshit",
	"unique_id_target",
	"edi",
	"region",
];

async function syncOptimoDataPSQL() {
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
	for (const region of apiKeys) {
		var orders = await fetchRecentOrders(region.key);
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

	// await uploadToDB(result);
	console.log("Script run complete");
}

// async function formatAndCleanData(data) {
// 	const result = [];
// 	for (const row of data) {
// 		const rowObj = {
// 			stop_id: row.at(0),
// 			store: row.at(1),
// 			address: row.at(2),
// 			city: row.at(3),
// 			state: row.at(4),
// 			zip: `${row.at(5)}`,
// 			start_time: convertDecimalToTime(row.at(7)),
// 			lunch_start: convertDecimalToTime(row.at(8)),
// 			lunch_end: convertDecimalToTime(row.at(9)),
// 			end_time: convertDecimalToTime(row.at(10)),
// 			saturday_hours_and_notes: row.at(11),
// 			action_flag: row.at(12),
// 			store_abbr: row.at(13),
// 			banner: row.at(14),
// 			region: row.at(16),
// 			do_not_sell_list: row.at(17),
// 			sold_here: row.at(18),
// 			full_stop: ensureNumber(row.at(19)),
// 			direct: ensureNumber(row.at(20)),
// 			sprint: ensureNumber(row.at(21)),
// 			supply: ensureNumber(row.at(22)),
// 			cin7_name: row.at(23),
// 			last_visit: excelDateToTimestamp(row.at(24)),
// 			on_gs: row.at(25),
// 			on_fss: row.at(26),
// 			address_full: row.at(27),
// 			ship_eligible: row.at(28),
// 		};
// 		result.push(rowObj);
// 	}

// 	return result;
// }

async function uploadToDB(data) {
	const psql = await psqlHelper();
	await psql.establishConnection();
	const table = "master_store_list";

	const batchSize = 100;
	const totalColumns = sqlheaders.length;

	const updateAssignments = sqlheaders
		.filter((header) => header !== "unique_id")
		.map((header) => `${header} = EXCLUDED.${header}`)
		.join(", \n");

	for (let i = 0; i < data.length; i += batchSize) {
		const rawBatch = data.slice(i, i + batchSize);

		const allValues = [];
		const rowPlaceholders = [];
		let localValueIndex = 0;

		for (const storeData of rawBatch) {
			if (
				!storeData.at(0) ||
				storeData.at(0) === "" ||
				storeData.at(0) === "NA"
			) {
				continue;
			}

			if (storeData.at(23) === "" || storeData.at(23) === "Not in Cin7") {
				continue;
			}

			const placeholders = [];
			for (let j = 0; j < totalColumns; j++) {
				localValueIndex++;
				placeholders.push(`$${localValueIndex}`);
			}
			if (cleanedRow.length !== totalColumns) {
				console.log(storeData);
				console.error(
					`Row data is incomplete! Expected ${totalColumns}, got ${cleanedRow.length}`,
				);
			}

			rowPlaceholders.push(`(${placeholders.join(", ")})`);
			allValues.push(...cleanedRow);
		}

		if (rowPlaceholders.length === 0) {
			console.log(`Skipping batch at index ${i}: No valid rows found.`);
			continue;
		}

		let insertQuery = `INSERT INTO ${table} (${sqlheaders.join(", ")}) 
            VALUES ${rowPlaceholders.join(", ")} 
            ON CONFLICT (unique_id) 
            DO UPDATE SET 
                ${updateAssignments}`;

		try {
			await psql.runQuery(insertQuery, allValues);

			console.log(
				`Successfully inserted a batch of ${rawBatch.length} rows using ${allValues.length} parameters.`,
			);
		} catch (e) {
			console.error(`Error inserting batch at index ${i}:`, e);
			console.error("Failing Query:", insertQuery);
			console.error("Failing Values (first 10):", allValues.slice(0, 10));
		}
	}

	await psql.closeConnection();
}

async function fetchRecentOrders(apiKey) {
	let dates = getSyncDates();
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
				"scheduled",
				"on_route",
				"servicing",
				// "unscheduled",
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
	const detailsMap = new Map();
	orderCompletionDetails.forEach((detail) => {
		detailsMap.set(detail.id, detail);
	});

	const mergedOrders = [];

	const fssMap = await makeFssMap();

	for (const order of orders.slice(0, 2)) {
		const orderData = order.data;
		const orderDetails = detailsMap.get(order.id).data;
		console.log(orderData);
		console.log(orderDetails);
		const stopType = orderData.location.locationName.split(":").at(0);
		const locationName = orderData.location.locationName.split(":").at(1);
		const urgency = `${fssMap.get(orderData.orderNo) ?? ""} (${Number(orderDetails.form.direct_order_invoice_amount).toFixed(0)})`; // This gets calculated based on RTG: FSS on WADC

		const formattedOrder = {
			stop_id: orderData.orderNo,
			store: locationName,
			date: orderData.date,
			stop_type: stopType,
			service_rep: orderData.assignedTo.serial,
			invoice_number: orderData.customField5,
			blank: "", // MANUAL
			inv_adj: "", // MANUAL
			stop_completed_manual: "",
			stop_completed: orderDetails.status,
			urgency: urgency,
			optimo_status: mapStatus(orderDetails.status || ""),
			direct_order: orderDetails.form.check_do,
			direct_invoice_number: orderDetails.form.invoice_number ?? null,
			direct_delivered: orderDetails.form.do_delivered ?? null,
			order_parked: orderDetails.form.order_parked,
			rsr_optimoroute_notes: orderData.notes,
			direct_order_dollar_amount_match: orderDetails.form.dollar_amount_match,
			direct_order_quantity_match: orderDetails.form.quantity_match,
			full_service_invoice_number: orderDetails.form.invoice_number,
			full_service_dollar_amount_match: orderDetails.form.dollar_amount_match,
			out_of_stock_count: orderDetails.form.out_of_stocks,
			po_number_direct: orderDetails.form.target_po_number_direct,
			po_number_full_service: orderDetails.form.full_service_invoice_no,
			notes: "", // MANUAL
			must_have_formula: "",
			unique_id: "",
			unique_id_doshit: "",
			unique_id_target: "",
			edi: "",
			region: "",
		};

		mergedOrders.push(formattedOrder);
	}

	return mergedOrders;

	// return orders.map((order) => {
	// 	let detail = detailsMap[order.id] || {};
	// 	let repId = `${order.data.assignedTo?.serial ?? " "}`;
	// 	let stopType = order.data.location.locationName.split(":")[0];
	// 	let invNumber = "";
	// 	if (order.data.customField5 !== "") {
	// 		invNumber = `${order.data.customField5}`;
	// 	}
	// 	let locationName = order.data.location.locationName.split(":")[1];
	// 	let orderID = `${order.id}`;

	// 	return [
	// 		accountName,
	// 		order.data.orderNo,
	// 		order.scheduleInformation?.driverName ?? " ",
	// 		order.data.date,
	// 		locationName,
	// 		order.data.customField5,
	// 		mapStatus(detail.data.status || ""),
	// 		detail.data?.form?.note ?? "",
	// 		mapYesNoChoice(detail.data?.form?.check_do ?? ""),
	// 		mapYesNoChoice(detail.data?.form?.do_delivered ?? ""),
	// 		detail.data?.form?.customer_dollar_amount_match ?? "",
	// 		mapYesNoChoice(detail.data?.form?.dollar_amount_match ?? ""),
	// 		detail.data?.form?.dollar_amount_mismatch ?? "",
	// 		mapYesNoChoice(detail.data?.form?.quantity_match ?? ""),
	// 		detail.data?.form?.quantity_mismatch ?? "",
	// 		mapYesNoChoice(detail.data?.form?.check_full_service ?? ""),
	// 		detail.data?.form?.full_service_invoice_no ?? "",
	// 		detail.data?.form?.full_service_invoice_amount ?? "",
	// 		mapYesNoChoice(detail.data?.form?.dollar_amount_match_full_service ?? ""),
	// 		detail.data?.form?.customer_amount_mismatch ?? "",
	// 		mapYesNoChoice(detail.data?.form?.quantity_match_full_service ?? ""),
	// 		detail.data?.form?.customer_quantity_mismatch ?? "",
	// 		mapYesNoChoice(detail.data?.form?.check_credit ?? ""),
	// 		detail.data?.form?.credit_no ?? "",
	// 		detail.data?.form?.credit_amount ?? "",
	// 		mapYesNoChoice(detail.data?.form?.dollar_amount_match_credit_2 ?? ""),
	// 		detail.data?.form?.customer_amount_mismatch_2 ?? "",
	// 		mapYesNoChoice(detail.data?.form?.quantity_match_credit_2 ?? ""),
	// 		detail.data?.form?.customer_quantity_mismatch_2 ?? "",
	// 		mapYesNoChoice(detail.data?.form?.order_parked ?? ""),
	// 		detail.data?.form?.parked_order_amount ?? "",
	// 		detail.data?.form?.out_of_stocks ?? "",
	// 		detail.data?.form?.target_po_number_direct ?? "",
	// 		detail.data?.form?.target_po_number_full_service ?? "",
	// 		`${order.data.orderNo}${dateToExcelSerialDate(order.data.date)}${repId}${order.data.customField5 ?? ""}`,
	// 		mapStatus(detail.data.status || ""),
	// 		detail.data?.form?.note ?? "",
	// 		stopType,
	// 		invNumber,
	// 		repId,
	// 		orderID,
	// 	];
	// });
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

function formatDateToYYYYMMDD(date) {
	return date.toISOString().split("T")[0];
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

function getCurrentAndTrailingDates() {
	const now = new Date();
	const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
	const startOfTrailingMonth = new Date(
		now.getFullYear(),
		now.getMonth() - 1,
		1,
	);
	const endOfTrailingMonth = new Date(now.getFullYear(), now.getMonth(), 0);
	// const startOf2ndTrailingMonth = new Date(
	// 	now.getFullYear(),
	// 	now.getMonth() - 2,
	// 	1,
	// );
	// const endOf2ndTrailingMonth = new Date(
	// 	now.getFullYear(),
	// 	now.getMonth() - 1,
	// 	0,
	// );

	const monthsToFetch = [
		// {
		// 	start: formatDateToYYYYMMDD(startOf2ndTrailingMonth),
		// 	end: formatDateToYYYYMMDD(endOf2ndTrailingMonth),
		// },
		{
			start: formatDateToYYYYMMDD(startOfTrailingMonth),
			end: formatDateToYYYYMMDD(endOfTrailingMonth),
		},
		{
			start: formatDateToYYYYMMDD(startOfCurrentMonth),
			end: formatDateToYYYYMMDD(now),
		},
	];

	return monthsToFetch;
}
