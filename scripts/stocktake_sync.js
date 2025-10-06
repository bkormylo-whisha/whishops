import { SHEET_SCHEMAS } from "../util/sheet_schemas.js";
import { sheetExtractor } from "../util/sheet_extractor.js";
import { driveUploader } from "../util/drive_uploader.js";
import mailSender from "../util/mail_sender.js";
import * as fs from "fs";
import dayjs from "dayjs";

export const run = async (req, res) => {
	try {
		await stockTakeSync();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function stockTakeSync() {
	const stockTakeData = await getStockTakeData();
	console.log(stockTakeData.length);

	const csvString = stockTakeData.map((row) => row.join(",")).join("\n");
	const filePath = await writeCsvData(csvString);
	const mailer = mailSender({
		recipients: [
			"bkormylo@whisha.com",
			// "wsinks@whisha.com",
			// "dlindstrom@whisha.com",
		],
		attachmentName: filePath.split("/").at(-1),
		attachmentPath: filePath,
		subject: "Stock Take",
		bodyText: "",
	});
	await mailer.run();
}

async function getStockTakeData() {
	const stockTakeSheetExtractor = sheetExtractor({
		functionName: "Get Stock Take Data",
		inSheetID: "1OGh84s-60hETGZJYWK6HkGVUB_vuXWHV8vljzYesNi8",
		inSheetName: "RYAN BALGA",
		inSheetRange: "A1:F",
	});

	const stockTakeData = await stockTakeSheetExtractor.run();
	return stockTakeData;
}

async function writeCsvData(csvData) {
	const date = dayjs();
	const formattedDate = date.format("YYYY-MM-DD");
	const fileName = `${formattedDate}_stock_take.csv`;

	fs.writeFile("./downloads/" + fileName, csvData, (err) => {
		if (err) {
			console.error("Error writing file:", err);
			return;
		}
		console.log("File written successfully!");
	});

	return `./downloads/${fileName}`;
}
