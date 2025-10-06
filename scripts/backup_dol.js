import { SHEET_SCHEMAS } from "../util/sheet_schemas.js";
import { sheetExtractor } from "../util/sheet_extractor.js";
import { driveUploader } from "../util/drive_uploader.js";
import * as fs from "fs";
import dayjs from "dayjs";

export const run = async (req, res) => {
	try {
		await backupDol();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function backupDol() {
	const dolData = await getDataFromDOL();

	const csvString = dolData.map((row) => row.join(",")).join("\n");
	const filePath = await writeCsvData(csvString);

	const dolDriveUploader = driveUploader({
		filePath: filePath,
		folderId: "1mGRQ9IpV9Cr1L6oQtdyRyKvFdypZ1qFu",
	});
	await dolDriveUploader.run();
}

async function getDataFromDOL() {
	const dolSheetExtractor = sheetExtractor({
		functionName: "Backup DOL",
		inSheetID: SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.prod_id,
		inSheetName:
			SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.pages.rtg_direct_order_log,
		inSheetRange: "A1:AE",
	});

	const directOrderLogData = await dolSheetExtractor.run();
	return directOrderLogData;
}

async function writeCsvData(csvData) {
	const date = dayjs();
	const formattedDate = date.format("YYYY-MM-DD");
	const fileName = `${formattedDate}_dol_backup.csv`;

	fs.writeFile("./downloads/" + fileName, csvData, (err) => {
		if (err) {
			console.error("Error writing file:", err);
			return;
		}
		console.log("File written successfully!");
	});

	return `./downloads/${fileName}`;
}
