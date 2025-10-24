import { SHEET_SCHEMAS } from "../../util/sheet_schemas.js";
import { logRuntimeFor } from "../../util/log_runtime_for.js";
import psqlHelper from "../../util/psql_helper.js";
import { sheetExtractor } from "../../util/sheet_extractor.js";
import dayjs from "dayjs";
import excelDateToTimestamp from "../../util/excel_date_to_timestamp.js";

export const run = async (req, res) => {
	console.log("Running Sync Master Store List PSQL");
	try {
		await logRuntimeFor(syncMasterStoreListPsql);
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function syncMasterStoreListPsql() {
	const masterStoreListData = await getMasterStoreList();

	await uploadToDB(masterStoreListData);
	console.log("Script run complete");
}

async function getMasterStoreList() {
	const mslExtractor = sheetExtractor({
		functionName: "Sync Master Store List",
		inSheetID: SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.prod_id,
		inSheetName:
			SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.pages.master_store_list,
		inSheetRange: "A5:AC",
	});

	console.log("Getting initial data from Master Store List");
	let masterStoreListData = [[]];
	masterStoreListData = await mslExtractor.run();

	return masterStoreListData;
}

async function uploadToDB(data) {
	const psql = await psqlHelper();
	await psql.establishConnection();
	const table = "master_store_list";
	const sqlheaders = [
		"stop_id",
		"store",
		"address",
		"city",
		"state",
		"zip",
		"start_time",
		"lunch_start",
		"lunch_end",
		"end_time",
		"saturday_hours_and_notes",
		"action_flag",
		"store_abbr",
		"banner",
		"region",
		"do_not_sell_list",
		"sold_here",
		"full_stop",
		"direct",
		"sprint",
		"supply",
		"cin7_name",
		"last_visit",
		"on_gs",
		"on_fss",
		"address_full",
		"ship_eligible",
	];

	const batchSize = 100;
	const totalColumns = sqlheaders.length;

	const paddedData = data.map((row) => {
		while (row.length < totalColumns) {
			row.push(null);
		}
		return row;
	});

	const dataToProcess = paddedData;
	const updateAssignments = sqlheaders
		.filter((header) => header !== "stop_id")
		.map((header) => `${header} = EXCLUDED.${header}`)
		.join(", \n");

	for (let i = 0; i < dataToProcess.length; i += batchSize) {
		const rawBatch = dataToProcess.slice(i, i + batchSize);

		const allValues = [];
		const rowPlaceholders = [];
		let localValueIndex = 0;

		for (const storeData of rawBatch) {
			if (
				!storeData.at(0) ||
				storeData.at(0) === "" ||
				storeData.at(0) === "NA"
			) {
				continue;
			}

			if (storeData.at(23) === "" || storeData.at(23) === "Not in Cin7") {
				continue;
			}

			const cleanedRow = [
				`${storeData.at(0)}`,
				...storeData.slice(1, 6),
				...storeData.slice(7, 11).map((element) => {
					const numericValue = Number(element);
					const result =
						!Number.isNaN(numericValue) && numericValue !== 0
							? convertDecimalToTime(element)
							: null;
					return result;
				}),
				...storeData.slice(11, 15),
				...storeData.slice(16, 19),
				...storeData.slice(19, 23).map((element) => {
					const numericValue = Number(element); // Try to convert it
					return Number.isNaN(numericValue) ? 0 : numericValue;
				}),
				storeData.at(23),
				(() => {
					const rawValue = `${storeData.at(24)}`;
					if (
						!rawValue ||
						rawValue === "" ||
						rawValue === "NA" ||
						rawValue.toLowerCase() === "null"
					) {
						return null;
					}

					const dateObj = dayjs(
						excelDateToTimestamp(Number(rawValue)),
					).toDate();
					if (Number.isNaN(dateObj.getTime())) {
						console.warn(
							`Invalid date value found: ${rawValue}. Inserting NULL.`,
						);
						return null;
					}

					return dateObj;
				})(),
				...storeData.slice(25, 27).map((element) => element === "Yes"),
				storeData.at(27),
				storeData.at(28) ? storeData.at(28) : null,
			];

			const placeholders = [];
			for (let j = 0; j < totalColumns; j++) {
				localValueIndex++;
				placeholders.push(`$${localValueIndex}`);
			}
			if (cleanedRow.length !== totalColumns) {
				console.log(storeData);
				console.error(
					`Row data is incomplete! Expected ${totalColumns}, got ${cleanedRow.length}`,
				);
			}

			rowPlaceholders.push(`(${placeholders.join(", ")})`);
			allValues.push(...cleanedRow);
		}

		if (rowPlaceholders.length === 0) {
			console.log(`Skipping batch at index ${i}: No valid rows found.`);
			continue;
		}

		let insertQuery = `INSERT INTO ${table} (${sqlheaders.join(", ")}) 
            VALUES ${rowPlaceholders.join(", ")} 
            ON CONFLICT (stop_id) 
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
}

function convertDecimalToTime(decimalTime) {
	const totalSeconds = decimalTime * 24 * 60 * 60;
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = Math.round(totalSeconds % 60);
	const formattedHours = String(hours).padStart(2, "0");
	const formattedMinutes = String(minutes).padStart(2, "0");
	const formattedSeconds = String(seconds).padStart(2, "0");

	return `${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
}

// Duplicates in MSL
// Vons - 2049
// Safeway - 1826
