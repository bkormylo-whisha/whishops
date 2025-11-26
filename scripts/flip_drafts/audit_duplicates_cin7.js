import delay from "../../util/delay.js";
import mailSender from "../../util/mail_sender.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);

// ACTIVE, runs daily at 7 AM
export const run = async (req, res) => {
	try {
		await auditDuplicatesCin7();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function auditDuplicatesCin7() {
	const dateRange = getDateRange();
	const ordersJson = await getRecentOrders(dateRange);
	console.log(`Got ${ordersJson.length} orders from Cin7`);
	const duplicates = await createDuplicateList(ordersJson);

	if (ordersJson.length === 0) {
		console.log("No matching orders found");
		return;
	}

	const dateFormat = "MM/DD/YYYY";
	const bodyText =
		`Dates Searched: ${dayjs(dateRange.start).format(dateFormat)} - ${dayjs(dateRange.end).format(dateFormat)}` +
		"\n\n" +
		"The following references exist twice in Cin7 on open orders:" +
		"\n" +
		`${duplicates.map((order) => order.ref).join("\n")}` +
		`${duplicates.length === 0 ?? "None Found"}`;

	const mailer = await mailSender();
	await mailer.send({
		recipients: [
			"bkormylo@whisha.com",
			"wsinks@whisha.com",
			"dlindstrom@whisha.com",
			// "tcarlozzi@whisha.com",
			// "rramirez@whisha.com",
			// "lklotz@whisha.com",
		],
		subject: `Cin7 - Duplicate Order Checker ${dayjs(dateRange.start).format(dateFormat)} - ${dayjs(dateRange.end).format(dateFormat)}: ${duplicates.length > 0 ? duplicates.length : "none"} detected`,
		bodyText: bodyText,
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
		const sales_endpoint = `v1/SalesOrders?fields=id,reference,invoiceNumber,createdDate,modifiedDate&where=createdDate>'${dateRange.start}' AND status<>'Void'&order=createdDate&page=${page}&rows=250`;

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
					if (data.length < rowCount || row.createdDate > dateRange.end) {
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

	return result;
}

async function createDuplicateList(printedOrderJson) {
	let duplicates = [];
	const freqMap = new Map();

	for (const order of printedOrderJson) {
		if (!freqMap.get(order.reference)) {
			freqMap.set(order.reference, 1);
		} else {
			freqMap.set(order.reference, freqMap.get(order.reference) + 1);
			const duplicateOrder = {
				id: order.id,
				ref: order.reference,
				invoiceNumber: order.invoiceNumber,
				count: freqMap.get(order.reference),
			};
			duplicates.push(duplicateOrder);
		}
	}

	let checkedDuplicates = [];
	for (const duplicate of duplicates) {
		const occurences = printedOrderJson.filter(
			(order) => order.reference === duplicate.ref,
		);

		if (occurences.at(0).createdDate === occurences.at(1).createdDate) {
			checkedDuplicates.push(duplicate);
		}
	}

	console.log(duplicates);
	console.log(`Found ${duplicates.length} duplicates`);

	return duplicates;
}

function getDateRange() {
	const startDate = dayjs().utc().subtract(7, "day").toISOString();
	const endDate = dayjs().utc().subtract(1, "day").toISOString();

	return {
		start: startDate,
		end: endDate,
	};
}
