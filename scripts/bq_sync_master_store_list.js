import { google } from "googleapis";
import getAuthenticatedClient from "../util/sheet_auth.js";
import { BigQuery } from "@google-cloud/bigquery";
import { SHEET_SCHEMAS } from "../util/sheet_schemas.js";
import { logRuntimeFor } from "../util/log_runtime_for.js";

export const run = async (req, res) => {
	console.log("Running Sync Master Store List BQ");
	try {
		await logRuntimeFor(syncMasterStoreListBQ);
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

// The goal will be to take past order completion at each store,
// then average the time it has taken for the last 10 stops at that store
// Get Order Completion to update the master store list
// Get Orders using the orderID from Order completion,
// Create an order completion log in BQ for the last month or so
// Pull from that order completion log to get average stop lengths

async function syncMasterStoreListBQ() {
	const masterStoreListData = await getMasterStoreList();

	console.log(masterStoreListData.slice(0, 4));

	await uploadToBigQuery(masterStoreListData);
	console.log("Script run complete");
}

async function getMasterStoreList() {
	const auth = await getAuthenticatedClient();
	const sheets = google.sheets({ version: "v4", auth });

	const masterStoreListID = SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.prod_id;
	const masterStoreListName =
		SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.pages.master_store_list;
	const masterStoreListRange = "A5:AC";

	console.log("Getting initial data from Master Store List");
	let masterStoreListData = [[]];

	try {
		const getResponse = await sheets.spreadsheets.values.get({
			spreadsheetId: masterStoreListID,
			range: `${masterStoreListName}!${masterStoreListRange}`,
			valueRenderOption: "FORMATTED_VALUE",
		});

		masterStoreListData = getResponse.data.values;
		if (!masterStoreListData) {
			masterStoreListData = [[]];
		}

		console.log("Retrieved data successfully");
	} catch (e) {
		console.error("Error during sheet operation:", e);
		throw e;
	}

	return masterStoreListData;
}

async function uploadToBigQuery(data) {
	const bigquery = new BigQuery();
	const projectId = "whishops";
	const datasetId = "order_management";
	const tableId = "master-store-list";

	const fullTableName = `${projectId}.${datasetId}.${tableId}`;
	const query = `TRUNCATE TABLE \`${fullTableName}\``;
	const options = {
		query: query,
		location: "us-west1",
	};

	try {
		const [job] = await bigquery.createQueryJob(options);
		console.log(`Table ${fullTableName} successfully truncated.`);
		await job.getQueryResults();
	} catch (e) {
		console.error(`Error truncating table ${fullTableName}:`, e);
		throw e;
	}

	var sqlheaders = [
		"stop_id",
		"store",
		"address",
		"city",
		"state",
		"zip",
		"stop_id_2",
		"start",
		"lunch_start",
		"lunch_end",
		"end",
		"saturday_hours_and_notes",
		"action_flag",
		"id",
		"banner",
		"stop_id_3",
		"region",
		"do_not_sell_list",
		"sold_here",
		"full",
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

	const batchSize = 8000;
	for (let i = 0; i < data.length; i += batchSize) {
		const rawBatch = data.slice(i, i + batchSize);

		const processedBatch = rawBatch.map((row) => {
			const obj = {};
			sqlheaders.forEach((header, j) => {
				obj[header] = `${row[j] ?? ""}`;
			});
			return obj;
		});

		try {
			await bigquery.dataset(datasetId).table(tableId).insert(processedBatch);
			console.log(
				`Successfully inserted a batch of ${processedBatch.length} rows.`,
			);
		} catch (e) {
			console.error(`Error inserting batch at index ${i}:`, e);
		}
	}
}
