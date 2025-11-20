import delay from "../../util/delay.js";
import getUsernameMapFromCin7 from "../../util/cin7/get_username_map.js";
import mailSender from "../../util/mail_sender.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);

// LIVE DO NOT MODIFY
export const run = async (req, res) => {
	try {
		await auditMissingPoWholeFoodsCin7();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function auditMissingPoWholeFoodsCin7() {
	const dateRange = getDateRange();
	const ordersJson = await getRecentOrders(dateRange);
	console.log(`Got ${ordersJson.length} orders from Cin7`);
	const ordersMappedByName = await mapToRsrName(ordersJson);

	if (ordersJson.length === 0) {
		console.log("No matching orders found");
		return;
	}

	const dateFormat = "MM/DD/YYYY";
	const formattedRange = `${dayjs(dateRange.start).format(dateFormat)} - ${dayjs(dateRange.end).format(dateFormat)}`;
	const headerText =
		"<h2>Checking for Whole Foods orders marked as 'Delivered' in Cin7 but with incorrect PO numbers</h2>" +
		`<h3>Dates Searched: ${formattedRange}</h3>`;
	let bodyText = "";
	const keys = [...ordersMappedByName.keys()];
	const sortedKeys = keys.sort(
		(a, b) =>
			ordersMappedByName.get(b).length - ordersMappedByName.get(a).length,
	);

	bodyText += `<h2 style="text-decoration: underline;">Summary</h2>`;
	bodyText += `<h4>Total Errors - ${ordersJson.length}</h4>`;

	bodyText += "<table>";
	bodyText += `<tr><th style="text-align: left;">RSR Name</th><th>Error Count</th></tr>`;
	for (const key of sortedKeys) {
		const orders = ordersMappedByName.get(key);
		bodyText += `<tr><td>${key}</td><td style="text-align: right;">${orders.length}</td></tr>`;
	}
	bodyText += "</table>";

	bodyText += `<div style="height: 20px;"/>`;
	bodyText += `<h2 style="text-decoration: underline;">Details</h2>`;

	for (const key of sortedKeys) {
		const orders = ordersMappedByName.get(key);
		bodyText += `<h3>${key} (${orders.length} found)</h3>`;

		for (const order of orders) {
			const enteredOrderNo = order.customerOrderNo;
			let errorExplanation = "";
			if (enteredOrderNo.length > 9) {
				errorExplanation = "Order number can't be longer than 9 digits";
			} else if (enteredOrderNo.length < 9 && enteredOrderNo.length !== 0) {
				errorExplanation = "Order number can't be less than 9 digits";
			} else {
				errorExplanation = "No order number entered";
			}
			bodyText += `<p>Invoice Number: ${order.invoiceNumber}<\p>`;
			bodyText += `<p>RSR Entered PO Number: ${order.customerOrderNo}<\p>`;
			bodyText += `<p>Error: ${errorExplanation}</p>`;
			bodyText += `<div style="height: 6px;"/>`;
		}
		bodyText += `<div style="height: 4px;">---------------------------------------</div>`;
		bodyText += `<div style="height: 20px;"/>`;
	}

	const mailer = await mailSender();
	await mailer.send({
		recipients: [
			"bkormylo@whisha.com",
			"wsinks@whisha.com",
			"dlindstrom@whisha.com",
			"chris@whisha.com",
			"jonathan@whisha.com",
			"rocco@whisha.com",
			"scott@whisha.com",
			"kgada@whisha.com",
			"ggenenbacher@whisha.com",
			"vvaviya@whisha.com",
		],
		subject: `WHOLE FOODS EDI | RSR PO Error Report for Week of ${formattedRange}`,
		html: headerText + bodyText,
	});

	console.log("Script run complete");
}

async function getRecentOrders(dateRange) {
	const url = "https://api.cin7.com/api/";
	const username = process.env.CIN7_USERNAME;
	const password = process.env.CIN7_PASSWORD;

	let options = {};
	options.headers = {
		Authorization: "Basic " + btoa(username + ":" + password),
	};

	let page = 1;
	let result = [];
	let hasMorePages = true;
	const rowCount = 250;
	while (hasMorePages) {
		const sales_endpoint = `v1/SalesOrders?fields=id,createdBy,customerOrderNo,invoiceNumber,createdDate&where=invoiceDate>'${dateRange.start}' AND invoiceDate<='${dateRange.end}' AND stage='Delivered' AND source LIKE '%POS%' AND company LIKE '%Whole Foods%' AND customerOrderNo NOT LIKE '_________'&order=createdDate&page=${page}&rows=250`;

		try {
			const response = await fetch(`${url}${sales_endpoint}`, options);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const data = await response.json();
			await delay(200);

			if (data.length > 0) {
				for (let i = 0; i < data.length; i++) {
					const row = data[i];
					if (data.length < rowCount) {
						hasMorePages = false;
						if (data.length <= i) {
							break;
						}
					}
					result.push(row);
				}
				page++;
			} else {
				hasMorePages = false;
			}
		} catch (error) {
			console.error("Failed to fetch data:", error);
			hasMorePages = false;
		}
	}

	const usernameMap = await getUsernameMapFromCin7();
	const resultWithNames = result.map((order) => {
		const rsr = usernameMap.get(order.createdBy);
		return { ...order, createdBy: rsr };
	});

	return resultWithNames;
}

async function mapToRsrName(printedOrderJson) {
	const rsrMap = new Map();

	for (const order of printedOrderJson) {
		if (!rsrMap.get(order.createdBy)) {
			rsrMap.set(order.createdBy, [order]);
		} else {
			rsrMap.set(order.createdBy, [...rsrMap.get(order.createdBy), order]);
		}
	}

	return rsrMap;
}

function getDateRange() {
	const startDate = dayjs().utc().subtract(8, "day").toISOString();
	const endDate = dayjs().utc().subtract(1, "day").toISOString();

	return {
		start: startDate,
		end: endDate,
	};
}
