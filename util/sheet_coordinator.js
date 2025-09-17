import { GoogleAuth } from "google-auth-library";
import { google } from "googleapis";

async function getAuthenticatedClient() {
	const base64String = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64;
	const jsonString = Buffer.from(base64String, "base64").toString("utf-8");
	const credentials = JSON.parse(jsonString);

	const auth = new GoogleAuth({
		credentials: {
			client_email: credentials.client_email,
			private_key: credentials.private_key,
		},
		scopes: ["https://www.googleapis.com/auth/spreadsheets"], // And other scopes
	});

	return await auth.getClient();
}

export function sheetCoordinator(params) {
	async function run() {
		const auth = await getAuthenticatedClient();
		const sheets = google.sheets({ version: "v4", auth });

		console.log(`Running script: ${params.functionName}`);

		const inSheetID = params.inSheetID;
		const inSheetName = params.inSheetName;
		const inSheetRange = params.inSheetRange;

		const outSheetID = params.outSheetID;
		const outSheetName = params.outSheetName;
		const outSheetRange = params.outSheetRange;

		const insertTimestamp = params.insertTimestamp ?? false;
		const timestampRow = params.timestampRow ?? 0;
		const timestampCol = params.timestampCol ?? 0;

		console.log("Getting initial data from input sheet");

		try {
			const getResponse = await sheets.spreadsheets.values.get({
				spreadsheetId: inSheetID,
				range: `${inSheetName}!${inSheetRange}`,
				valueRenderOption: "FORMATTED_VALUE",
			});

			let inSheetData = getResponse.data.values;
			if (!inSheetData) {
				inSheetData = [[]]; // Ensure it's always an array to prevent errors
			}

			console.log("Retrieved data successfully");

			if (insertTimestamp) {
				const today = new Date();
				if (!inSheetData[timestampRow]) {
					inSheetData[timestampRow] = [];
				}
				inSheetData[timestampRow][timestampCol] = `Last Update: ${today}`;
			}

			console.log(`Data: ${inSheetData[0]}`);

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
			console.log(`Updated cells: ${updateResponse.data.totalUpdatedCells}`);
		} catch (e) {
			console.error("Error during sheet operation:", e);
			throw e;
		}

		console.log("Script run complete");
	}

	return Object.freeze({
		run: run,
	});
}
