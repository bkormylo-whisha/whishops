import psqlHelper from "../../util/psql_helper.js";
import { logRuntimeFor } from "../../util/log_runtime_for.js";
import { sheetExtractor } from "../../util/sheet_extractor.js";
import { SHEET_SCHEMAS } from "../../util/sheet_schemas.js";
import dayjs from "dayjs";

export const run = async (req, res) => {
	console.log("Running Sync Optimo Data PSQL");
	try {
		await logRuntimeFor(syncMasterVisitLogOptimo);
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

const sqlheaders = [
	"optimoroute_id",
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
	"full_service_unit_quantity_match",
	"out_of_stock_count",
	"po_number_direct",
	"po_number_full_service",
	"notes",
	// "must_have_formula",
	// "unique_id",
	// "unique_id_doshit",
	// "unique_id_target",
	// "edi",
	// "region",
];

async function syncMasterVisitLogOptimo() {
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

	let result = [];
	for (const region of apiKeys) {
		let orders = await fetchRecentOrders(region.key);
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

	await uploadToDB(result);
	console.log("Script run complete");
}

async function uploadToDB(data) {
	const psql = await psqlHelper();
	await psql.establishConnection();
	const table = "master_visit_log";

	const batchSize = 100;
	const totalColumns = sqlheaders.length;

	const updateAssignments = sqlheaders
		.filter((header) => header !== "optimoroute_id")
		.map((header) => `${header} = EXCLUDED.${header}`)
		.join(", \n");

	for (let i = 0; i < data.length; i += batchSize) {
		const rawBatch = data.slice(i, i + batchSize);

		const allValues = [];
		const rowPlaceholders = [];
		let localValueIndex = 0;

		for (const visitData of rawBatch) {
			const placeholders = [];
			for (let j = 0; j < totalColumns; j++) {
				localValueIndex++;
				placeholders.push(`$${localValueIndex}`);
			}

			rowPlaceholders.push(`(${placeholders.join(", ")})`);
			allValues.push(...Object.values(visitData));
		}

		if (rowPlaceholders.length === 0) {
			console.log(`Skipping batch at index ${i}: No valid rows found.`);
			continue;
		}

		let insertQuery = `INSERT INTO ${table} (${sqlheaders.join(", ")}) 
            VALUES ${rowPlaceholders.join(", ")} 
            ON CONFLICT (optimoroute_id) 
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
	let searchOrdersUrl = "https://api.optimoroute.com/v1/search_orders";
	let ordersUrl = `${searchOrdersUrl}?key=${apiKey}`;
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
	const completionDetailsUrl =
		"https://api.optimoroute.com/v1/get_completion_details";
	const detailsUrl = `${completionDetailsUrl}?key=${apiKey}`;
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

async function mergeOrderData(orders, orderCompletionDetails, accountName) {
	const detailsMap = new Map();
	orderCompletionDetails.forEach((detail) => {
		detailsMap.set(detail.id, detail);
	});

	const mergedOrders = [];

	const fssMap = await makeFssMap();

	for (const order of orders) {
		const orderData = order.data;
		const orderDetails = detailsMap.get(order.id).data;
		const stopType = orderData.location.locationName.split(":").at(0);
		const locationName = orderData.location.locationName.split(":").at(1);
		// const urgency = `${fssMap.get(orderData.orderNo) ?? ""} (${Number(orderDetails.form.full_service_invoice_amount ?? 0).toFixed(0)})`; // This gets calculated based on RTG: FSS on WADC
		const urgency = `${fssMap.get(orderData.orderNo) ?? ""}`; // This gets calculated based on RTG: FSS on WADC

		const formattedOrder = {
			optimoroute_id: order.id,
			stop_id: orderData.orderNo,
			store: locationName,
			date: orderData.date,
			stop_type: stopType,
			service_rep: orderData.assignedTo?.serial ?? null,
			invoice_number: (orderData.customField5 ?? "").replace(/\D/g, "") || null,
			blank: null, // MANUAL
			inv_adj: null, // MANUAL
			stop_completed_manual: null,
			stop_completed: mapStatus(orderDetails.status || ""),
			urgency: urgency,
			optimo_status: mapStatus(orderDetails.status || ""),
			direct_order: orderDetails.form?.check_do ?? null,
			direct_invoice_number:
				(orderDetails.form?.invoice_number ?? "").replace(/\D/g, "") || null,
			direct_delivered: orderDetails.form?.do_delivered ?? null,
			order_parked: orderDetails.form?.order_parked ?? null,
			rsr_optimoroute_notes: orderDetails.form?.note ?? null,
			direct_order_dollar_amount_match:
				orderDetails.form?.dollar_amount_match ?? null,
			direct_order_quantity_match: orderDetails.form?.quantity_match ?? null,
			full_service_invoice_number:
				(orderDetails.form?.full_service_invoice_number ?? "").replace(
					/\D/g,
					"",
				) || null,
			full_service_dollar_amount_match:
				orderDetails.form?.dollar_amount_match_full_service ?? null,
			full_service_unit_quantity_match:
				orderDetails.form?.quantity_match_full_service ?? null,
			out_of_stock_count: orderDetails.form?.out_of_stocks ?? null,
			po_number_direct: orderDetails.form?.target_po_number_direct ?? null,
			po_number_full_service:
				orderDetails.form?.target_po_number_full_service ?? null,
			notes: "", // MANUAL
			// must_have_formula: orderDetails.status,
			// unique_id: `${orderData.orderNo}${dateToExcelSerialDate(date)}${orderData.assignedTo.serial}${orderData.customField5}`,
			// unique_id_doshit: `${orderData.customField5}${orderData.orderNo}`,
			// unique_id_target: `${orderData.orderNo}${dateToExcelSerialDate(date)}`,
			// edi: `${orderDetails.form.target_po_number_direct}${orderDetails.form.target_po_number_full_service}`,
			// region: "",
		};

		mergedOrders.push(formattedOrder);
	}

	return mergedOrders;
}

async function makeFssMap() {
	const fssSheetExtractor = sheetExtractor({
		inSheetID: SHEET_SCHEMAS.WHISHACCEL_ISOLATED_VERSION.prod_id,
		inSheetName:
			SHEET_SCHEMAS.WHISHACCEL_ISOLATED_VERSION.pages.rtg_full_service_schedule,
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

function getSyncDates() {
	const now = dayjs();
	const dateFormat = "YYYY-MM-DD";
	const dateRangeToFetch = {
		start: now.subtract(7, "day").format(dateFormat),
		end: now.format(dateFormat),
	};
	return dateRangeToFetch;
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
