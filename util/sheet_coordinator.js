/* 
interface RunAndLogParams {
	functionName: string;
	inSheetID: string;
	inSheetName: string;
	inSheetRange: string;
	outSheetID: string;
	outSheetName: string;
	outSheetRange: string;
	insertTimestamp?: boolean;
	timestampRow?: number;
	timestampCol?: number;
} 
*/

/**
 * The appObject
 * @param {Object} par The main parameter object.
 * @return {Object} The appObject Object.
 */

function sheetCoordinator(params) {
	"use strict";

	function run() {
		Logger.log(`Running script: ${params.functionName}`);

		const inSheetID = params.inSheetID;
		const inSheetName = params.inSheetName;
		const inSheetRange = params.inSheetRange;

		const outSheetID = params.outSheetID;
		const outSheetName = params.outSheetName;
		const outSheetRange = params.outSheetRange;

		const insertTimestamp = params.insertTimestamp ?? false;
		const timestampRow = params.timestampRow ?? 0;
		const timestampCol = params.timestampCol ?? 0;

		Logger.log("Getting initial data from input sheet");

		const inSheetData = Sheets.Spreadsheets.Values.get(
			inSheetID,
			`${inSheetName}!${inSheetRange}`,
			{ valueRenderOption: "FORMATTED_VALUE" },
		).values;

		Logger.log("Retrieved data successfully");

		if (insertTimestamp) {
			const today = new Date();
			inSheetData[timestampRow][timestampCol] = `Last Update: ${today}`;
		}

		Logger.log(`Data: ${inSheetData[0]}`);

		const outRequest = {
			valueInputOption: "USER_ENTERED",
			data: [
				{
					range: `${outSheetName}!${outSheetRange}`,
					majorDimension: "ROWS",
					values: inSheetData,
				},
			],
		};

		try {
			const response = Sheets.Spreadsheets.Values.batchUpdate(
				outRequest,
				outSheetID,
			);
			if (response) {
				Logger.log(response);
			} else {
				Logger.log("No Response");
			}
		} catch (e) {
			console.log(e);
		}

		Logger.log("Script run complete");
	}

	return Object.freeze({
		run: run,
	});
}

// myObject = appObject({
//   someParameter: SpreadsheetApp.getActiveSpreadsheet().getId(),
// })

// myObject.run();
