import convertJsonToCsv from "../util/convert_json_to_csv.js";
import * as fs from "fs";
import { Client } from "basic-ftp";
import dayjs from "dayjs";

export const run = async (req, res) => {
	try {
		await runWholeFoodsUpload();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function runWholeFoodsUpload() {
	const updatedOrderData = await getFullOrderDataCin7();
	const formattedData = await formatCin7Data(updatedOrderData);
	const filePath = writeCsvData(formattedData);
	// uploadToFtp(filePath);
}

async function getFullOrderDataCin7() {
	const url = "https://api.cin7.com/api/";
	const username = process.env.CIN7_USERNAME;
	const password = process.env.CIN7_PASSWORD;

	let options = {};
	options.headers = {
		Authorization: "Basic " + btoa(username + ":" + password),
	};

	const now = dayjs();
	const formattedDate = now.subtract(7, "day").format("YYYY-MM-DD");

	console.log(formattedDate);

	let page = 1;
	let result = [];
	let hasMorePages = true;
	while (hasMorePages) {
		const user_endpoint = `v1/SalesOrders?where=invoiceDate>=${formattedDate}T00:00:00Z AND firstName='WF'&order=invoiceDate&page=${page}&rows=250`;

		try {
			const response = await fetch(`${url}${user_endpoint}`, options);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const data = await response.json();
			await delay(1000);

			if (data.length > 0) {
				for (let i = 0; i < data.length; i++) {
					const row = data[i];
					if (!`${row["invoiceDate"]}`.includes(formattedDate)) {
						hasMorePages = false;
						break;
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

async function formatCin7Data(data) {
	const formattedData = [];
	for (const salesOrder of data) {
		for (let i = 1; i <= salesOrder.lineItems.length; i++) {
			const lineItem = salesOrder.lineItems.at(i - 1);
			const deliveryAddress2 = salesOrder.lastName.split(" ").at(2);
			const company = salesOrder.company.split("-").at(-1).trim();
			const totalItems = salesOrder.lineItems.reduce(
				(total, item) => total + item.qty,
				0,
			);

			const rowJSON = {
				"Order Id": salesOrder.id ?? "",
				"Order Ref": salesOrder.reference ?? "",
				"Invoice No": salesOrder.invoiceNumber ?? "",
				"Customer PO No": salesOrder.customerPoNo ?? 0, // NOT A FIELD
				Company: company,
				"First Name": salesOrder.firstName ?? "",
				"Last Name": salesOrder.lastName ?? "",
				"Created Date": salesOrder.createdDate ?? "",
				Phone: salesOrder.phone ?? "",
				Mobile: salesOrder.mobile ?? "",
				Fax: salesOrder.fax ?? "",
				Email: salesOrder.email ?? "",
				"Delivery Company": salesOrder.deliveryCompany ?? "",
				"Delivery First Name": salesOrder.deliveryFirstName ?? "",
				"Delivery Last Name": salesOrder.deliveryLastName ?? "",
				"Delivery Address 1": salesOrder.deliveryAddress1 ?? "",
				"Delivery Address 2": deliveryAddress2,
				"Delivery City": salesOrder.deliveryCity ?? "",
				"Delivery State": salesOrder.deliveryState ?? "",
				"Delivery Postal Code": salesOrder.deliveryPostalCode ?? "",
				"Delivery Country": salesOrder.deliveryCountry ?? "",
				"Billing Company": salesOrder.billingCompany ?? "",
				"Billing First Name": salesOrder.billingFirstName ?? "",
				"Billing Last Name": salesOrder.billingLastName ?? "",
				"Billing Address 1": salesOrder.billingAddress1 ?? "",
				"Billing Address 2": salesOrder.billingAddress2 ?? "",
				"Billing City": salesOrder.billingCity ?? "",
				"Billing State": salesOrder.billingState ?? "",
				"Billing Postal Code": salesOrder.billingPostalCode ?? "",
				"Billing Country": salesOrder.billingCountry ?? "",
				"Created By": "",
				"Sales Rep": "",
				"Processed By": salesOrder.processedBy ?? "",
				Branch: "",
				"Branch ID": salesOrder.branchId ?? "",
				"Internal Comments": salesOrder.internalComments ?? "",
				"Delivery Instructions": salesOrder.deliveryInstructions ?? "",
				"Tracking Code": salesOrder.trackingCode ?? "",
				"Project Name": salesOrder.projectName ?? "",
				Channel: "", // Not a field
				"Payment Type": "", // Not a field
				"Payment Terms": salesOrder.paymentTerms ?? "",
				"Billing No": "", // Not a field
				"Department No": "",
				"Store No": deliveryAddress2,
				"Ship To DC/Store": "", // Not a field
				"SSCC Label No": "", // Not a field
				Carrier: "", // Not a field
				"Integration Contact Ref": "",
				"Currency Name": salesOrder.currencyCode ?? "",
				"Tax Status": salesOrder.taxStatus ?? "",
				"Tax Amount": 0,
				"Tax Amount (Local Currency)": 0,
				"Total Items": totalItems,
				"Product Total (Local Currency)": salesOrder.total ?? "",
				"Product Total": salesOrder.total ?? "",
				"Freight Description": salesOrder.freightDescription ?? "",
				"Freight Cost (Local Currency)": salesOrder.freightTotal ?? "",
				"Freight Cost": salesOrder.freightTotal ?? "",
				"Surcharge Description": salesOrder.surchargeDescription ?? "",
				"Surcharge Total (Local Currency)": salesOrder.surcharge ?? "",
				"Surcharge Total": salesOrder.surcharge ?? "",
				"Discount Description": salesOrder.discountDescription ?? "",
				"Discount Total (Local Currency)": salesOrder.discountTotal ?? "",
				"Discount Total": salesOrder.discountTotal ?? "",
				"Total Excl (Local Currency)": salesOrder.total ?? "",
				"Total Excl": salesOrder.total ?? "",
				"Total Incl (Local Currency)": salesOrder.total ?? "",
				"Total Incl": salesOrder.total ?? "",
				"Item Code": lineItem.code ?? "",
				"Item Name": lineItem.name ?? "",
				"Item Qty": lineItem.qty ?? "",
				"Item Qty Moved": salesOrder.itemQtyMoved ?? "",
				"Item Price (Local Currency)": lineItem.unitPrice ?? "",
				"Item Price": lineItem.unitPrice ?? "",
				"Item Total Discount (Local Currency)": lineItem.discount ?? "",
				"Item Total Discount": lineItem.discount ?? "",
				"Item Option 1": lineItem.option1 ?? "",
				"Item Option 2": lineItem.option2 ?? "",
				"Item Option 3": lineItem.option3 ?? "",
				"Item Notes": lineItem.lineComments ?? "",
				"Item Row Format": "",
				"Item BOM Load": "",
				"Item Sort": i,
				"Item GL Account": "",
				"Invoice Date": salesOrder.invoiceDate ?? "",
				"Fully Dispatched": salesOrder.dispatchedDate ?? "",
				ETD: salesOrder.invoiceDate ?? "",
				"Cancellation Date": salesOrder.cancellationDate ?? "",
				Barcode: lineItem.barcode ?? "",
			};

			formattedData.push(rowJSON);
		}
	}

	return formattedData;
}

function writeCsvData(jsonData) {
	const csvData = convertJsonToCsv(jsonData);
	const date = dayjs();
	const fileName = `whisha${date.subtract(7, "day").format("YYYY-MM-DD")}_invoices.csv`;

	fs.writeFile("./downloads/" + fileName, csvData, (err) => {
		if (err) {
			console.error("Error writing file:", err);
			return;
		}
		console.log("File written successfully!");
	});

	return `./downloads/${fileName}`;
}

async function uploadToFtp(filePath) {
	const client = new Client();
	client.ftp.verbose = true;

	try {
		await client.access({
			host: "your_ftp_host",
			user: "your_ftp_username",
			password: "your_ftp_password",
			secure: true,
		});

		await client.upload(
			fs.createReadStream(filePath),
			"remote_directory/remote_file.txt",
		);
		console.log("File uploaded successfully!");
	} catch (err) {
		console.error("FTP Error:", err);
	} finally {
		client.close();
	}
}

function delay(time) {
	return new Promise((resolve) => setTimeout(resolve, time));
}
