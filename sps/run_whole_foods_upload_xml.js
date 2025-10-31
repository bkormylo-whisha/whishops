import * as fs from "fs";
import * as convert from "xml-js";
import { Client } from "basic-ftp";
import dayjs from "dayjs";
import mailSender from "../util/mail_sender.js";
import delay from "../util/delay.js";

export const run = async (req, res) => {
	try {
		await runWholeFoodsUploadXml();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function runWholeFoodsUploadXml() {
	const date = dayjs();
	const formattedDate = date.subtract(7, "day").format("YYYY-MM-DD");
	const dateRange = {
		start: date.subtract(7, "day").format("YYYY-MM-DD"),
		end: date.subtract(1, "day").format("YYYY-MM-DD"),
	};
	const fileName = `in_whisha_wfm_${formattedDate}.xml`;

	const updatedOrderData = await getFullOrderDataCin7(dateRange);
	const formattedData = await formatCin7Data(updatedOrderData, formattedDate);
	const filePath = writeToXml(formattedData, formattedDate);
	// uploadToFtp(filePath);

	const mailer = await mailSender();
	await mailer.send({
		// recipients: ["bkormylo@whisha.com"],
		recipients: [
			"bkormylo@whisha.com",
			"wsinks@whisha.com",
			// "dlindstrom@whisha.com",
		],
		attachmentName: fileName,
		attachmentPath: filePath,
		subject: "Whole Foods Upload",
		bodyText: "",
	});
}

async function getFullOrderDataCin7(dateRange) {
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
	while (hasMorePages) {
		const endpoint = `v1/SalesOrders?where=invoiceDate>=${dateRange.start}T00:00:00Z AND firstName='WF'&order=invoiceDate&page=${page}&rows=250`;

		try {
			const response = await fetch(`${url}${endpoint}`, options);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const data = await response.json();
			await delay(500);

			if (data.length > 0) {
				for (let i = 0; i < data.length; i++) {
					const row = data[i];
					if (`${row["invoiceDate"]}`.includes(dateRange.end)) {
						hasMorePages = false;
						break;
					}
					result.push(row);
				}
				result.push(...data);
				page++;
			} else {
				hasMorePages = false;
			}
		} catch (error) {
			console.error("Failed to fetch data:", error);
			hasMorePages = false;
		}
	}

	console.log(result.slice(0, 4));
	console.log(result.slice(result.length - 4, result.length));

	return result;
}

async function formatCin7Data(data) {
	const formattedData = [];
	for (const salesOrder of data) {
		const totalItems = salesOrder.lineItems.reduce(
			(total, item) => total + item.qty,
			0,
		);

		if (totalItems === 0) {
			continue;
		}

		if (!salesOrder.dispatchedDate) {
			continue;
		}

		const items = [];

		for (let i = 1; i <= salesOrder.lineItems.length; i++) {
			const lineItem = salesOrder.lineItems.at(i - 1);

			// Filters out items we shouldn't be selling anyways
			const barcode = `${lineItem.barcode ?? ""}`;
			if (barcode.length <= 11) {
				// console.log(`Skipped: ${JSON.stringify(salesOrder)}`);
				continue;
			}

			const formattedItem = {
				InvoiceLine: {
					ConsumerPackageCode: "0000000000000", // Not the barcode, no idea what this is
					VendorPartNumber: lineItem.code,
					// No reference to this part in docs
					ProductID: {
						PartNumberQual: "UD",
						PartNumber: lineItem.barcode, // Seems correct
					},
					InvoiceQty: lineItem.qty,
					InvoiceQtyUOM: "BG",
					PurchasePrice: lineItem.unitPrice,
				},
				ProductOrItemDescription: {
					ProductCharacteristicCode: "08",
					ProductDescription: lineItem.name,
				},
				PhysicalDetails: {
					PackQualifier: "OU",
					PackValue: lineItem.qty,
					PackUOM: "BG",
					PackSize: 1.0, // Might not be applicable, defaulting to 1.0
				},
			};
			items.push(formattedItem);
		}

		const formattedInvoiceHeader = {
			Header: {
				InvoiceHeader: {
					TradingPartnerId: "5B5ALLWHITESHAD", // Manually Assigned by SPS
					InvoiceNumber: salesOrder.invoiceNumber,
					InvoiceDate: salesOrder.invoiceDate.slice(0, 10),
					PurchaseOrderDate: salesOrder.createdDate.slice(0, 10),
					PurchaseOrderNumber: salesOrder.customerPoNo,
				},
				Dates: {
					DateTimeQualifier: "017", // Designates it as Estimated Delivery according to WF
					Date: salesOrder.dispatchedDate.slice(0, 10), // Which date goes here?
				},
				Address: [
					{
						AddressTypeCode: "ST", // Ship To
						AddressName: salesOrder.deliveryCompany,
					},
					{
						AddressTypeCode: "NES", // New Store?
						LocationCodeQualifier: 92,
						AddressLocationNumber: salesOrder.lastName.split(" ").at(2),
						AddressName: salesOrder.deliveryCompany,
					},
					{
						AddressTypeCode: "VN", // Vendor (should be Whisha Info)
						LocationCodeQualifier: 91, // Sample had 92 but that should be for buyer location
						AddressLocationNumber: "S-03427", // No idea what this is for us
						AddressName: "Whisha - LLC",
					},
				],
			},
		};

		const formattedInvoiceSummary = {
			Summary: {
				TotalAmount: salesOrder.total,
				TotalLineItemNumber: salesOrder.lineItems.reduce(
					(total, item) => total + item.qty,
					0,
				),
			},
		};

		const fullInvoice = {
			...formattedInvoiceHeader,
			LineItem: items,
			...formattedInvoiceSummary,
		};

		formattedData.push(fullInvoice);
	}

	return formattedData;
}

function writeToXml(jsonData, formattedDate) {
	const dataToConvert = {
		RSX: {
			Invoice: [...jsonData],
		},
	};

	const xmlData = convert.json2xml(JSON.stringify(dataToConvert), {
		compact: true,
		spaces: 4,
	});

	const fileName = `in_whisha_wfm_${formattedDate}.xml`;

	fs.writeFile("./downloads/" + fileName, xmlData, (err) => {
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
