import * as fs from "fs";
import * as convert from "xml-js";
import { Client } from "basic-ftp";
import dayjs from "dayjs";
import mailSender from "../../util/mail_sender.js";
import delay from "../../util/delay.js";

export const run = async (req, res) => {
	try {
		await sendPurchaseOrder();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function sendPurchaseOrder() {
	const date = dayjs();
	const dateRange = {
		start: date.subtract(10, "day").format("YYYY-MM-DD"),
		end: date.subtract(3, "day").format("YYYY-MM-DD"),
	};

	const updatedOrderData = await getFullOrderDataCin7(dateRange);
	const formattedData = await formatCin7Data(updatedOrderData);
	const filePaths = writeToXml(formattedData, dateRange.end);
	const mailer = await mailSender();
	await mailer.send({
		recipients: ["bkormylo@whisha.com"],
		// recipients: [
		// 	"bkormylo@whisha.com",
		// 	"wsinks@whisha.com",
		// 	"dlindstrom@whisha.com",
		// ],
		// attachmentName: filePaths.split("/").at(-1),
		// attachmentPath: filePaths,
		attachments: filePaths.map((filePath) => {
			return {
				filename: filePath.split("/").at(-1),
				path: filePath,
			};
		}),
		subject: "Peets Purchase Orders",
		bodyText: "",
	});

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
		const endpoint = `v1/PurchaseOrders?where=createdDate>=${dateRange.start}T00:00:00Z AND createdDate<${dateRange.end}T00:00:00Z AND firstName LIKE '%PTS%' AND status<>'Draft'&order=invoiceDate&page=${page}&rows=250`;

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

	const productIDs = [];
	for (const row of result) {
		for (const lineItem of row.lineItems) {
			productIDs.push(lineItem.productId);
		}
	}
	page = 1;
	hasMorePages = true;
	const productDetails = [];
	while (hasMorePages) {
		const endpoint = `v1/Products?where=styleCode LIKE '%PTS%' OR styleCode LIKE '%SPW%'&page=${page}&rows=250`;

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
					productDetails.push(row);
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

	const productDetailMap = new Map();
	for (const detail of productDetails) {
		productDetailMap.set(detail.id, detail.productOptions.at(0).supplierCode);
	}

	const mergedResults = [];
	for (const order of result) {
		const updatedLineItems = [];
		for (const lineItem of order.lineItems) {
			updatedLineItems.push({
				...lineItem,
				supplierCode: productDetailMap.get(lineItem.productId),
			});
		}
		const updatedOrder = {
			...order,
			lineItems: updatedLineItems,
		};
		mergedResults.push(updatedOrder);
	}

	console.log(mergedResults.at(1).lineItems);
	// console.log(mergedResults);
	// console.log(productDetails);
	// for (const order of result) {
	// 	console.log(order.status);
	// }
	console.log(`Got ${result.length} purchase orders`);

	return mergedResults;
}

async function formatCin7Data(data) {
	const formattedData = [];
	for (const purchaseOrder of data) {
		const items = [];

		for (let i = 1; i <= purchaseOrder.lineItems.length; i++) {
			const lineItem = purchaseOrder.lineItems.at(i - 1);

			// Filters out short barcodes, need to handle bulk items
			const barcode = `${lineItem.barcode.replaceAll("-", "") ?? ""}`;
			if (barcode.length <= 11) continue;

			const formattedItem = {
				OrderLine: {
					LineSequenceNumber: i, // Increment per line
					BuyerPartNumber: lineItem.code, // Whisha Product Code, possibly switch with below
					VendorPartNumber: lineItem.supplierCode, // Peets Product Code
					ConsumerPackageCode: barcode, // Barcode
					OrderQty: lineItem.qty,
					OrderQtyUOM: "EA",
					PurchasePrice: lineItem.unitPrice,
					ExtendedItemTotal: (lineItem.qty * lineItem.unitPrice).toFixed(2), // No description of this, is it price * qty?
				},
				ProductOrItemDescription: {
					ProductCharacteristicCode: "08", // Product Description
					ProductDescription: lineItem.name, // Seems to have best by date
				},
			};
			items.push(formattedItem);
		}

		const formattedInvoiceHeader = {
			Header: {
				OrderHeader: {
					PurchaseOrderNumber: purchaseOrder.reference, // These come in with letters appended, cut or no?
					TsetPurposeCode: "00",
					PrimaryPOTypeCode: "SA",
					PurchaseOrderDate: purchaseOrder.createdDate.slice(0, 10),
					Vendor: purchaseOrder.company,
					BuyersCurrency: purchaseOrder.currencyCode,
				},
				PaymentTerms: {
					TermsDescription: purchaseOrder.paymentTerms, // Optional
				},
				Date: {
					DateTimeQualifier: "002", // Delivery Date
					Date: purchaseOrder.estimatedDeliveryDate.slice(0, 10), // or should it be fullyReceivedDate
				},
				Address: [
					{
						AddressTypeCode: "BT",
						LocationCodeQualifier: "92",
						AddressName: "Whisha",
						Address1: "31 Industrial Way",
						City: "Greenbrae",
						State: "CA",
						PostalCode: "94904",
						Country: "USA",
					},
					{
						AddressTypeCode: "ST",
						LocationCodeQualifier: "92",
						AddressName: purchaseOrder.deliveryCompany, // Delivery Address Info
						Address1: purchaseOrder.deliveryAddress1,
						Address2: purchaseOrder.deliveryAddress2,
						City: purchaseOrder.deliveryCity,
						State: purchaseOrder.deliveryState,
						PostalCode: purchaseOrder.deliveryPostalCode,
						Country: purchaseOrder.deliveryCountry,
					},
				],
				// References: { // No actual info in the build docs
				// 	ReferenceQual: "",
				// 	ReferenceID: "",
				// },
				Notes: [
					{
						NoteCode: "TPA",
						Note: "Please note that by fulfilling any portion of this purchase order, Vendor hereby acknowledges its obligations to protect, defend, hold harmless, save, and indemnify Whisha from and against any and all claims, demands, lawsuits, actions, proceedings, liabilities, fines, penalties, fees, costs, losses, and expenses (including without limitation, attorney’s fees, expenses and costs) arising out of or relating in whole or in part to the Vendor and/or the Product’s alleged or actual failure to comply with Proposition 65. Providing Whisha with products represents that Vendor has authority to execute this indemnity agreement on behalf of Whisha. This agreement shall be governed by the laws of the State of California. Vendor acknowledges that physical invoices are required for proper record-keeping and compliance purposes. Failure to provide a physical invoice within 180 days of the receipt of Products by Whisha shall render the invoice void, and Whisha shall be relieved of any obligation to make payment for such invoice. *By fulfilling this PO, the Vendor acknowledges that for any new or special placement (reset, displays, etc.) they will be paid on Whisha's stated terms that take effect once the items are confirmed to scan in with the applicable new customer. If the customer is experiencing delays, Whisha will contact the Vendor as soon as possible, and we'll also update the due date for this order based on the length of the delay. Thank you for your understanding.",
					},
					{
						NoteCode: "GEN",
						Note: purchaseOrder.deliveryInstructions, // Delivery Instruction
					},
				],
			},
		};

		const formattedInvoiceSummary = {
			Summary: {
				TotalAmount: purchaseOrder.total.toFixed(2),
				TotalLineItemNumber: purchaseOrder.lineItems.length, // Max of LineSequenceNumber
			},
		};

		const fullInvoice = {
			Order: {
				...formattedInvoiceHeader,
				LineItem: items,
				...formattedInvoiceSummary,
			},
		};

		formattedData.push(fullInvoice);
	}

	console.log(`Formatted ${formattedData.length} orders`);

	return formattedData;
}

function writeToXml(purchaseOrderJson, formattedDate) {
	const filePaths = [];

	for (const order of purchaseOrderJson) {
		const poNumber = order.Order.Header.OrderHeader.PurchaseOrderNumber;
		const poDate = order.Order.Header.OrderHeader.PurchaseOrderDate;

		const xmlOrder = convert.json2xml(JSON.stringify(order), {
			compact: true,
			spaces: 4,
		});

		const fileName = `out_whisha_pts_${poNumber}_${poDate}.xml`;

		fs.writeFile("./downloads/" + fileName, xmlOrder, (err) => {
			if (err) {
				console.error("Error writing file:", err);
				return;
			}
			// console.log("File written successfully!");
		});

		filePaths.push(`./downloads/${fileName}`);
	}
	console.log(`Files written ${filePaths.length}`);

	return filePaths;
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
