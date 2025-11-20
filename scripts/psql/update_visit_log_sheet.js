import psqlHelper from "../../util/psql_helper.js";
import { logRuntimeFor } from "../../util/log_runtime_for.js";
import { sheetExtractor } from "../../util/sheet_extractor.js";
import { SHEET_SCHEMAS } from "../../util/sheet_schemas.js";
import dayjs from "dayjs";
import { sheetInserter } from "../../util/sheet_inserter.js";

export const run = async (req, res) => {
	console.log("Running Sync Optimo Data PSQL");
	try {
		await logRuntimeFor(updateVisitLogSheet);
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function updateVisitLogSheet() {
	const visitLogData = await fetchVisitLogData();
	await insertToSheet(visitLogData);
	console.log("Script run complete");
}

async function fetchVisitLogData() {
	const psql = await psqlHelper();
	await psql.establishConnection();
	const table = "master_visit_log";

	// const extractQuery = `SELECT * FROM ${table} WHERE stop_id LIKE '%WF%'`;
	const extractQuery = `SELECT * FROM ${table}`;
	let result = await psql.runQuery(extractQuery);
	console.log(result.rows.length);

	await psql.closeConnection();
	return result.rows;
}

async function insertToSheet(visitLogData) {
	const visitLogSheetInserter = sheetInserter({
		outSheetID: "1B7uHHoQ6su0mnmeD_sjzrdEksvliG7HX4RFcyV834GM",
		outSheetName: "Visit Log",
		outSheetRange: "A2:AA",
		wipePreviousData: true,
	});

	const sheetReadyData = [];

	for (const visit of visitLogData) {
		sheetReadyData.push(Object.values(visit));
	}

	await visitLogSheetInserter.run(sheetReadyData);
}
