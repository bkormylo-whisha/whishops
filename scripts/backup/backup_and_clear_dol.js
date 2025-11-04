// OVERVIEW

// Need to first move the entire backup table to BQ, make a table structure
// Uniquely identify each order by Invoice Number within BQ

// Pull the entire set of data from WADC
// Filter all orders that are at least two weeks old
// Insert them into the table, update Invoice Numbers that already exist

// Clear the rows from the original table
import { SHEET_SCHEMAS } from "../../util/sheet_schemas.js";
import { BigQuery } from "@google-cloud/bigquery";
import { sheetExtractor } from "../../util/sheet_extractor.js";
import { sheetInserter } from "../../util/sheet_inserter.js";
import { driveUploader } from "../../util/drive_uploader.js";
import * as fs from "fs";
import dayjs from "dayjs";

export const run = async (req, res) => {
	try {
		await backupAndClearDol();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function backupAndClearDol() {
	const splitDolData = await getDataFromDOL();
	console.log(splitDolData.backup.length);
	console.log(splitDolData.replace.length);

	let colsToInsert = {
		aToC: [],
		orderNotesH: [],
		rsrQ: [],
		deliveredZ: [],
		abToAc: [],
	};

	for (const replaceData of splitDolData.replace.slice(6)) {
		colsToInsert.aToC.push(replaceData.slice(0, 3));
		colsToInsert.orderNotesH.push([replaceData.at(7)]);
		colsToInsert.rsrQ.push([replaceData.at(16)]);
		colsToInsert.deliveredZ.push([replaceData.at(25)]);
		colsToInsert.abToAc.push(replaceData.slice(27, 29));
	}

	const csvString = splitDolData.backup.map((row) => row.join(",")).join("\n");
	const filePath = await writeCsvData(csvString);
	const dolDriveUploader = driveUploader({
		filePath: filePath,
		folderId: "1mGRQ9IpV9Cr1L6oQtdyRyKvFdypZ1qFu",
	});
	await dolDriveUploader.run();

	// await uploadToBigQuery(splitDolData.backup);
	// await insertDataToDol(colsToInsert);
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

async function getDataFromDOL() {
	const dolSheetExtractor = sheetExtractor({
		functionName: "Backup and Clear Dol",
		inSheetID: SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.id,
		inSheetName:
			SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.pages.rtg_direct_order_log,
		inSheetRange: "A1:AE",
	});

	const directOrderLogData = await dolSheetExtractor.run();
	const twoWeeksPrevExcelDate = Number(`${directOrderLogData[0][0]}`) - 14;
	let dataToBackup = [];
	let dataToReplace = [];
	for (const row of directOrderLogData) {
		if (row.at(0) === "") {
			break;
		}

		if (row.at(0) <= twoWeeksPrevExcelDate) {
			dataToBackup.push(row);
		} else {
			dataToReplace.push(row);
		}
	}

	const splitData = {
		backup: dataToBackup,
		replace: dataToReplace,
	};

	return splitData;
}

// async function insertDataToDol(newDolData) {
// 	const aToCInserter = sheetInserter({
// 		functionName: "Insert Cols A - C",
// 		outSheetID: SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.id,
// 		outSheetName:
// 			SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.pages.rtg_direct_order_log,
// 		outSheetRange: "A4:C",
// 		wipePreviousData: true,
// 	});

// 	await aToCInserter.run(newDolData.aToC);

// 	const deliveredZInserter = sheetInserter({
// 		functionName: "Insert Col Z",
// 		outSheetID: SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.id,
// 		outSheetName:
// 			SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.pages.rtg_direct_order_log,
// 		outSheetRange: "Z4:Z",
// 		wipePreviousData: true,
// 	});

// 	await deliveredZInserter.run(newDolData.deliveredZ);

// 	const abToAcInserter = sheetInserter({
// 		functionName: "Insert Cols AB & AC",
// 		outSheetID: SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.id,
// 		outSheetName:
// 			SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.pages.rtg_direct_order_log,
// 		outSheetRange: "AB4:AC",
// 		wipePreviousData: true,
// 	});

// 	await abToAcInserter.run(newDolData.abToAc);
// }

// async function uploadToBigQuery(data) {
// 	const bigquery = new BigQuery();
// 	const projectId = "whishops";
// 	const datasetId = "whishaccel_backup";
// 	const tableId = "direct-order-log";

// 	const batchSize = 4000;
// 	for (let i = 0; i < data.length; i += batchSize) {
// 		const rawBatch = data.slice(i, i + batchSize);

// 		const processedBatch = rawBatch.map((row) => {
// 			const rowObj = {
// 				order_date: `${row.at(0)}`,
// 				stop_id: `${row.at(1)}`,
// 				invoice_number: `${row.at(2)}`,
// 				business_name: `${row.at(3)}`,
// 				address: `${row.at(4)}`,
// 				city: `${row.at(5)}`,
// 				default_region: `${row.at(6)}`,
// 				order_notes_comments: `${row.at(7)}`,
// 				order_value: `${row.at(8)}`,
// 				invoice_number_2: `${row.at(9)}`,
// 				direct_duration: `${row.at(10)}`,
// 				cin7_order_id: `${row.at(11)}`,
// 				invoice_week: `${row.at(12)}`,
// 				scheduled_week: `${row.at(13)}`,
// 				backorder: `${row.at(14)}`,
// 				duplicate: `${row.at(15)}`,
// 				rsr: `${row.at(16)}`,
// 				created_by: `${row.at(17)}`,
// 				helper: `${row.at(18)}`,
// 				invoice_link: `${row.at(19)}`,
// 				log_check: `${row.at(20)}`,
// 				dispatch_date: `${row.at(21)}`,
// 				invoice_date: `${row.at(22)}`,
// 				scheduled_invoice_date: `${row.at(23)}`,
// 				cin7_status: `${row.at(24)}`,
// 				delivered_or_complete_manual: `${row.at(25)}`,
// 				delivered_or_complete_formula: `${row.at(26)}`,
// 			};

// 			return rowObj;
// 		});

// 		try {
// 			await bigquery.dataset(datasetId).table(tableId).insert(processedBatch);
// 			console.log(
// 				`Successfully inserted a batch of ${processedBatch.length} rows.`,
// 			);
// 		} catch (e) {
// 			console.error(`Error inserting batch at index ${i}:`, e);
// 		}
// 	}
// }
