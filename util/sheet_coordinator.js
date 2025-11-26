import { google } from "googleapis";
import mailSender from "./mail_sender.js";
import getAuthenticatedClient from "./google_auth.js";

export function sheetCoordinator(params) {
	const silent = params.silent ?? false;
	async function run() {
		const auth = await getAuthenticatedClient();
		const sheets = google.sheets({ version: "v4", auth });

		!silent && console.log(`Running script: ${params.functionName}`);

		const inSheetID = params.inSheetID;
		const inSheetName = params.inSheetName;
		const inSheetRange = params.inSheetRange;

		const outSheetID = params.outSheetID;
		const outSheetName = params.outSheetName;
		const outSheetRange = params.outSheetRange;

		const insertTimestamp = params.insertTimestamp ?? false;
		const timestampRow = params.timestampRow ?? 0;
		const timestampCol = params.timestampCol ?? 0;

		const sendErrorReport = params.sendErrorReport ?? false;
		const errorReportRecipients = params.errorReportRecipients ?? [];

		const wipePreviousData = params.wipePreviousData ?? false;

		!silent && console.log("Getting initial data from input sheet");

		try {
			const getResponse = await sheets.spreadsheets.values.get({
				spreadsheetId: inSheetID,
				range: `${inSheetName}!${inSheetRange}`,
				valueRenderOption: "UNFORMATTED_VALUE",
			});

			let inSheetData = getResponse.data.values;
			if (!inSheetData) {
				inSheetData = [[]];
			}

			!silent && console.log("Retrieved data successfully");

			if (insertTimestamp) {
				const today = new Date();
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

			const outRequest = {
				spreadsheetId: outSheetID,
				resource: {
					valueInputOption: "USER_ENTERED",
					data: [
						{
							range: `${outSheetName}!${outSheetRange}`,
							majorDimension: "ROWS",
							values: inSheetData,
						},
					],
				},
			};

			const updateResponse =
				await sheets.spreadsheets.values.batchUpdate(outRequest);
			!silent &&
				console.log(`Updated cells: ${updateResponse.data.totalUpdatedCells}`);
		} catch (e) {
			console.error("Error during sheet operation:", e);
			if (sendErrorReport) {
				const mailer = await mailSender();

				await mailer.send({
					recipients: errorReportRecipients,
					subject: `Apps Script Failure: ${params.functionName ?? ""}`,
					bodyText: `${params.functionName ?? ""} just failed`,
				});
			}
		}

		!silent && console.log("Script run complete");
	}

	return Object.freeze({
		run: run,
	});
}
