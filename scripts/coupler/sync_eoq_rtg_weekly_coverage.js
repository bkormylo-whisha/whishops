import { SHEET_SCHEMAS } from "../../util/sheet_schemas.js";
import { sheetCoordinator } from "../../util/sheet_coordinator.js";

// SCOTT NEEDS THIS
export const run = async (req, res) => {
	try {
		await syncEoqRtgWeeklyCoverage();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function syncEoqRtgWeeklyCoverage() {
	const eoqRtgWeeklyCoverageSheetCoordinator = sheetCoordinator({
		functionName: "Sync EOQ RTG Weekly Coverage",

		inSheetID: SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.prod_id,
		inSheetName:
			SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.pages.rtg_weekly_coverage,
		inSheetRange: "E1:ID3000",

		outSheetID: SHEET_SCHEMAS.EOQ_TRANSFORMATION_FILE.prod_id,
		outSheetName:
			SHEET_SCHEMAS.EOQ_TRANSFORMATION_FILE.pages.rtg_weekly_coverage,
		outSheetRange: "O2",

		insertTimestamp: true,
		timestampRow: 1,
	});

	await eoqRtgWeeklyCoverageSheetCoordinator.run();
}
