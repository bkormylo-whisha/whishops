import * as fs from "fs";
import * as convert from "xml-js";
import { Client } from "basic-ftp";
import dayjs from "dayjs";
import mailSender from "../../util/mail_sender.js";
import { sheetInserter } from "../../util/sheet_inserter.js";
import delay from "../../util/delay.js";

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
	const dateRange = {
		start: date.subtract(10, "day").format("YYYY-MM-DD"),
		end: date.subtract(3, "day").format("YYYY-MM-DD"),
	};
	const fileName = `in_whisha_wfm_${dateRange.end}.xml`;

	const updatedOrderData = await getFullOrderDataCin7(dateRange);
	const formattedData = await formatCin7Data(updatedOrderData);
	const filePath = writeToXml(formattedData, dateRange.end);

	// const mailer = await mailSender();
	// await mailer.send({
	// 	// recipients: ["bkormylo@whisha.com"],
	// 	recipients: [
	// 		"bkormylo@whisha.com",
	// 		// "wsinks@whisha.com",
	// 		// "dlindstrom@whisha.com",
	// 	],
	// 	attachmentName: fileName,
	// 	attachmentPath: filePath,
	// 	subject: "Whole Foods Upload",
	// 	bodyText: "ONLY 5 INVOICES FOR TESTING",
	// });

	// await uploadToFtp(filePath);
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
				// result.push(...data);
				page++;
			} else {
				hasMorePages = false;
			}
		} catch (error) {
			console.error("Failed to fetch data:", error);
			hasMorePages = false;
		}
	}

	// console.log(result.slice(0, 4));
	// console.log(result.slice(result.length - 4, result.length));

	return result;
}

async function formatCin7Data(data) {
	const formattedData = [];
	let missingOrderNoCount = 0;
	const badInvoices = [];
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

		if (!salesOrder.customerOrderNo) {
			missingOrderNoCount++;
			continue;
		}

		if (
			`${salesOrder.customerOrderNo}`.length === 1 ||
			`${salesOrder.customerOrderNo}`.length > 9
		) {
			// console.log(salesOrder.invoiceNumber);
			badInvoices.push(salesOrder.invoiceNumber);
			continue;
		}

		const items = [];

		for (let i = 1; i <= salesOrder.lineItems.length; i++) {
			const lineItem = salesOrder.lineItems.at(i - 1);

			// Filters out items we shouldn't be selling anyways
			const barcode = `${lineItem.barcode ?? ""}`;
			if (barcode.length <= 11) {
				continue;
			}

			const formattedItem = {
				InvoiceLine: {
					ConsumerPackageCode: lineItem.barcode.replaceAll("-", ""),
					VendorPartNumber: lineItem.code,
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
					PackSize: 1.0,
				},
			};
			items.push(formattedItem);
		}

		const formattedInvoiceHeader = {
			Header: {
				InvoiceHeader: {
					TradingPartnerId: "5B5ALLWHITESHAD",
					InvoiceNumber: salesOrder.invoiceNumber,
					InvoiceDate: salesOrder.invoiceDate.slice(0, 10),
					PurchaseOrderDate: salesOrder.createdDate.slice(0, 10),
					PurchaseOrderNumber: salesOrder.customerOrderNo,
				},
				Dates: {
					DateTimeQualifier: "017",
					Date: dayjs(salesOrder.dispatchedDate)
						.add(1, "day")
						.toISOString()
						.slice(0, 10),
				},
				Address: [
					{
						AddressTypeCode: "ST",
						AddressName: salesOrder.deliveryCompany.split("-").at(-1).trim(),
					},
					{
						AddressTypeCode: "NES",
						LocationCodeQualifier: 92,
						AddressLocationNumber: salesOrder.lastName.split(" ").at(2),
						AddressName: salesOrder.deliveryCompany.split("-").at(-1).trim(),
					},
					{
						AddressTypeCode: "VN",
						LocationCodeQualifier: 91,
						AddressLocationNumber: "0000235079",
						AddressName: "Whisha - LLC",
					},
				],
			},
		};

		const formattedInvoiceSummary = {
			Summary: {
				TotalAmount: salesOrder.total.toFixed(2),
				TotalLineItemNumber: salesOrder.lineItems.length,
			},
		};

		const fullInvoice = {
			...formattedInvoiceHeader,
			LineItem: items,
			...formattedInvoiceSummary,
		};

		formattedData.push(fullInvoice);
	}

	console.log(`Skipped ${missingOrderNoCount} orders`);
	console.log(`Wrote ${formattedData.length} orders`);

	await logMalformedPONumbers(badInvoices);

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
	const fileName = filePath.split("/").at(-1);
	console.log(`Uploading ${fileName}`);
	client.ftp.verbose = false;

	try {
		await client.access({
			host: "ftp.spscommerce.com",
			user: "whisha",
			password: "TFio8egTvDHS",
			secure: false,
		});

		await client.ensureDir("testin");
		await client.uploadFrom(fs.createReadStream(filePath), fileName);
	} catch (err) {
		console.error("FTP Error:", err);
	} finally {
		client.close();
	}
}

async function logMalformedPONumbers(badInvoices) {
	const url = "https://api.cin7.com/api/";
	const username = process.env.CIN7_USERNAME;
	const password = process.env.CIN7_PASSWORD;
	const uniqueBadInvoices = new Set(badInvoices);
	const badInvoiceArr = [...uniqueBadInvoices];

	let options = {};
	options.headers = {
		Authorization: "Basic " + btoa(username + ":" + password),
	};

	let page = 1;
	let result = [];
	let hasMorePages = true;
	while (hasMorePages) {
		const endpoint = `v1/SalesOrders?where=invoiceNumber IN (${badInvoiceArr.join(",")})&page=${page}&rows=250`;

		try {
			const response = await fetch(`${url}${endpoint}`, options);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const data = await response.json();
			await delay(500);

			if (data.length > 0) {
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

	const customerPurchaseOrderSheetInserter = sheetInserter({
		outSheetID: "1xF01u5KEbpJ3HPcPaj_wawU3ziA9e211Uqeld6bfvyY",
		outSheetName: "Whole Foods PO Audit",
		outSheetRange: "A2:C",
		wipePreviousData: true,
		silent: true,
	});

	const salesRegions = new Map([
		["5876", "TEXAS"],
		["6025", "SOCAL"],
		["3", "NORCAL"],
		["6582", "ROCKY MOUNTAIN"],
		["7542", "PNW"],
		["7856", "MIDWEST"],
		["10199", "FLORIDA"],
		["10029", "NORTHEAST"],
		["11979", "SOUTHEAST"],
		["11978", "MID-ATLANTIC"],
	]);

	const formattedInvoices = result
		.sort((a, b) => {
			if (a.source < b.source) {
				return -1;
			}
			if (a.source > b.source) {
				return 1;
			}
			return 0;
		})
		.map((invoice) => [
			invoice.invoiceNumber,
			invoice.source,
			salesRegions.get(`${invoice.branchId}`),
		]);

	await customerPurchaseOrderSheetInserter.run(formattedInvoices);
}
