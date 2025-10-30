import psqlHelper from "../../util/psql_helper.js";
import delay from "../../util/delay.js";
import dayjs from "dayjs";

export const run = async (req, res) => {
	try {
		await getOrdersCin7();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function getOrdersCin7() {
	console.log("Running Script: Get Orders Cin7 PSQL");
	const printedOrdersJson = await getRawOrderData();
	console.log(`Got ${printedOrdersJson.length} orders from Cin7`);

	const formattedData = await formatOrderData(printedOrdersJson);

	await uploadToDB(formattedData);
}

async function getRawOrderData() {
	const url = "https://api.cin7.com/api/";
	const username = process.env.CIN7_USERNAME;
	const password = process.env.CIN7_PASSWORD;

	let options = {};
	options.headers = {
		Authorization: "Basic " + btoa(username + ":" + password),
	};

	const date = dayjs().subtract(3, "days");
	const formattedDate = date.format("YYYY-MM-DD");

	let page = 1;
	let result = [];
	let hasMorePages = true;
	const rowCount = 250;
	while (hasMorePages) {
		console.log(`Grabbing page ${page}`);
		const sales_endpoint = `v1/SalesOrders?where=invoiceDate>${formattedDate}T00:00:00Z&order=invoiceDate&page=${page}&rows=250`;

		try {
			const response = await fetch(`${url}${sales_endpoint}`, options);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const data = await response.json();
			await delay(1000);

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

	return result;
}

async function formatOrderData(printedOrderJson) {
	let result = [];

	for (const order of printedOrderJson) {
		const invoiceNumber = order.invoiceNumber;
		const cin7Id = order.id;
		const orderDate = order.createdDate;
		const store = order.company;
		const orderNotes = order.internalComments;
		const orderValue = order.total;
		const dispatchDate = order.dispatchedDate;
		const invoiceDate = order.invoiceDate;
		const cin7Status = order.status;
		const rsr = "";

		result.push([
			invoiceNumber,
			cin7Id,
			orderDate,
			store,
			orderNotes,
			orderValue,
			dispatchDate,
			invoiceDate,
			cin7Status,
			rsr,
		]);
	}

	return result;
}

async function uploadToDB(data) {
	const psql = await psqlHelper();
	await psql.establishConnection();
	const table = "direct_orders";
	const sqlheaders = [
		"invoice_number",
		"cin7_id",
		"order_date",
		"store",
		"order_notes",
		"order_value",
		"dispatch_date",
		"invoice_date",
		"cin7_status",
		"rsr",
	];

	const batchSize = 100;
	const totalColumns = sqlheaders.length;

	const dataToProcess = data;
	const updateAssignments = sqlheaders
		.filter((header) => header !== "invoice_number")
		.map((header) => `${header} = EXCLUDED.${header}`)
		.join(", \n");

	for (let i = 0; i < dataToProcess.length; i += batchSize) {
		const rawBatch = dataToProcess.slice(i, i + batchSize);

		const allValues = [];
		const rowPlaceholders = [];
		let localValueIndex = 0;

		for (const orderData of rawBatch) {
			const placeholders = [];
			for (let j = 0; j < totalColumns; j++) {
				localValueIndex++;
				placeholders.push(`$${localValueIndex}`);
			}

			rowPlaceholders.push(`(${placeholders.join(", ")})`);
			allValues.push(...orderData);
		}

		if (rowPlaceholders.length === 0) {
			console.log(`Skipping batch at index ${i}: No valid rows found.`);
			continue;
		}

		let insertQuery = `INSERT INTO ${table} (${sqlheaders.join(", ")}) 
            VALUES ${rowPlaceholders.join(", ")} 
            ON CONFLICT (invoice_number) 
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
	return;
}
