import { SHEET_SCHEMAS } from "../util/sheet_schemas.js";
import { sheetCoordinator } from "../util/sheet_coordinator.js";
import getAuthenticatedClient from "../util/sheet_auth.js";
import { google } from "googleapis";

export const run = async (req, res) => {
	try {
		await cin7StatusUpdate();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function cin7StatusUpdate() {
	// Several things have to happen here, starting with a data pull from the WADC DOL
}

async function getDataFromDOL() {
	const auth = await getAuthenticatedClient();
	const sheets = google.sheets({ version: "v4", auth });

	const inSheetID = SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.id;
	const inSheetName =
		SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.pages.rtg_direct_order_log;
	const inSheetRange = "A1:AE";

	console.log("Getting initial data from input sheet");

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

		console.log("Retrieved data successfully");
	} catch (e) {
		console.error("Error during sheet operation:", e);
		throw e;
	}
}
