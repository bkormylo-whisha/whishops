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

async function syncMasterStoreListPsql() {
	const masterStoreListData = await getMasterStoreList();
	const formattedData = await formatAndCleanData(masterStoreListData);

	await uploadToDB(formattedData);
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

async function formatAndCleanData(data) {
	const result = [];
	for (const row of data) {
		if (!row.at(0) || row.at(0) === "" || row.at(0) === "NA") {
			continue;
		}

		if (row.at(23) === "" || row.at(23) === "Not in Cin7") {
			continue;
		}

		const rowObj = {
			stop_id: row.at(0),
			store: row.at(1),
			address: row.at(2),
			city: row.at(3),
			state: row.at(4),
			zip: `${row.at(5)}`,
			start_time: convertDecimalToTime(row.at(7)),
			lunch_start: convertDecimalToTime(row.at(8)),
			lunch_end: convertDecimalToTime(row.at(9)),
			end_time: convertDecimalToTime(row.at(10)),
			saturday_hours_and_notes: row.at(11),
			action_flag: row.at(12),
			store_abbr: row.at(13),
			banner: row.at(14),
			region: row.at(16),
			do_not_sell_list: row.at(17),
			sold_here: row.at(18),
			full_stop: ensureNumber(row.at(19)),
			direct: ensureNumber(row.at(20)),
			sprint: ensureNumber(row.at(21)),
			supply: ensureNumber(row.at(22)),
			cin7_name: row.at(23),
			last_visit: formatExcelDate(row.at(24)),
			on_gs: row.at(25) === "Yes",
			on_fss: row.at(26) === "Yes",
			address_full: row.at(27),
			ship_eligible: row.at(28),
		};

		result.push(Object.values(rowObj));
	}

	return result;
}

async function uploadToDB(dataToProcess) {
	const psql = await psqlHelper();
	await psql.establishConnection();
	const table = "master_store_list";

	const batchSize = 100;
	const totalColumns = sqlheaders.length;

	const updateAssignments = sqlheaders
		.filter((header) => header !== "stop_id")
		.map((header) => `${header} = EXCLUDED.${header}`)
		.join(", \n");

	for (let i = 0; i < dataToProcess.length; i += batchSize) {
		const batch = dataToProcess.slice(i, i + batchSize);

		const allValues = [];
		const rowPlaceholders = [];
		let localValueIndex = 0;

		for (const cleanedRow of batch) {
			const placeholders = [];
			for (let j = 0; j < totalColumns; j++) {
				localValueIndex++;
				placeholders.push(`$${localValueIndex}`);
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
				`Successfully inserted a batch of ${batch.length} rows using ${allValues.length} parameters.`,
			);
		} catch (e) {
			console.error(`Error inserting batch at index ${i}:`, e);
			console.error("Failing Query:", insertQuery);
			console.error("Failing Values (first 10):", allValues.slice(0, 10));
		}
	}

	await psql.closeConnection();
}

function ensureNumber(inputValue) {
	const numericValue = Number(inputValue);

	if (Number.isNaN(numericValue)) {
		return 0;
	} else {
		return numericValue;
	}
}

function convertDecimalToTime(decimalTime) {
	const numericValue = Number(decimalTime);
	if (Number.isNaN(numericValue) && numericValue !== 0) {
		return null;
	}

	const totalSeconds = decimalTime * 24 * 60 * 60;
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = Math.round(totalSeconds % 60);
	const formattedHours = String(hours).padStart(2, "0");
	const formattedMinutes = String(minutes).padStart(2, "0");
	const formattedSeconds = String(seconds).padStart(2, "0");

	return `${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
}

function formatExcelDate(date) {
	const rawValue = `${date}`;
	if (
		!rawValue ||
		rawValue === "" ||
		rawValue === "NA" ||
		rawValue.toLowerCase() === "null"
	) {
		return null;
	}

	const dateObj = dayjs(excelDateToTimestamp(Number(rawValue))).toDate();
	if (Number.isNaN(dateObj.getTime())) {
		return null;
	}

	return dateObj;
}

// Duplicate Cin7 Name, separate store name
// Ann's Health Food Center & Market - Zang Blvd
// Samples - Mollie Stones (Should be Samples - Mother's Market but there are two)
// Pachamama Coffee Distributors
// Cultivar Coffee Roasting Co.

// MSL Changes
// Ann's Health Food Center & Market - Zang Blvd (DUPLICATE changed to NOT IN CIN7)
