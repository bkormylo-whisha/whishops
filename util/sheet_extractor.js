import { google } from "googleapis";
import getAuthenticatedClient from "./google_auth.js";

export function sheetExtractor(params) {
	async function run() {
		const auth = await getAuthenticatedClient();
		const sheets = google.sheets({ version: "v4", auth });

		console.log(`Running script: ${params.functionName}`);

		const inSheetID = params.inSheetID;
		const inSheetName = params.inSheetName;
		const inSheetRange = params.inSheetRange;

		console.log("Getting initial data from input sheet");
		let inSheetData;

		try {
			const getResponse = await sheets.spreadsheets.values.get({
				spreadsheetId: inSheetID,
				range: `${inSheetName}!${inSheetRange}`,
				valueRenderOption: "UNFORMATTED_VALUE",
			});

			inSheetData = getResponse.data.values;
			if (!inSheetData) {
				inSheetData = [[]];
			}

			console.log("Retrieved data successfully");
		} catch (e) {
			console.error("Error during sheet operation:", e);
			throw e;
		}

		return inSheetData;
	}

	return Object.freeze({
		run: run,
	});
}
