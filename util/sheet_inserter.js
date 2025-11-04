import { google } from "googleapis";
import getAuthenticatedClient from "./google_auth.js";
import dayjs from "dayjs";

export function sheetInserter(params) {
	const silent = params.silent ?? false;

	async function run(dataToInsert) {
		const auth = await getAuthenticatedClient();
		const sheets = google.sheets({ version: "v4", auth });

		if (params.functionName && !silent) {
			console.log(`Running script: ${params.functionName}`);
		}

		const outSheetID = params.outSheetID;
		const outSheetName = params.outSheetName;
		const outSheetRange = params.outSheetRange;

		const insertTimestamp = params.insertTimestamp ?? false;
		const timestampRow = params.timestampRow ?? 0;
		const timestampCol = params.timestampCol ?? 0;

		const wipePreviousData = params.wipePreviousData ?? false;
		const append = params.append ?? false;

		const inSheetData = dataToInsert;

		try {
			if (insertTimestamp) {
				const today = dayjs().format("HH:mm MM/DD");
				if (!inSheetData[timestampRow]) {
					inSheetData[timestampRow] = [];
				}
				inSheetData[timestampRow][timestampCol] = `Last Update: ${today}`;
			}

			if (wipePreviousData) {
				!silent && console.log("Wiping previous data from output sheet...");
				const clearResponse = await sheets.spreadsheets.values.clear({
					spreadsheetId: outSheetID,
					range: `${outSheetName}!${outSheetRange}`,
				});
				!silent &&
					console.log(`Cleared range: ${clearResponse.data.clearedRange}`);
			}

			if (inSheetData.length > 0) {
				if (append) {
					const appendRequest = {
						spreadsheetId: outSheetID,
						range: `${outSheetName}!${outSheetRange}`,
						valueInputOption: "USER_ENTERED",
						insertDataOption: "INSERT_ROWS",
						resource: {
							values: dataToInsert,
						},
					};

					const appendResponse =
						await sheets.spreadsheets.values.append(appendRequest);
					!silent &&
						console.log(
							`Appended cells: ${appendResponse.data.updates.updatedCells}`,
						);
				} else {
					const outRequest = {
						spreadsheetId: outSheetID,
						resource: {
							valueInputOption: "USER_ENTERED",
							data: [
								{
									range: `${outSheetName}!${outSheetRange}`,
									majorDimension: "ROWS",
									values: dataToInsert,
								},
							],
						},
					};

					const updateResponse =
						await sheets.spreadsheets.values.batchUpdate(outRequest);
					!silent &&
						console.log(
							`Updated cells: ${updateResponse.data.totalUpdatedCells}`,
						);
				}
			}
		} catch (e) {
			console.error("Error during sheet operation:", e);
			throw e;
		}

		!silent && console.log("Sheet insertion complete");
	}

	return Object.freeze({
		run: run,
	});
}
