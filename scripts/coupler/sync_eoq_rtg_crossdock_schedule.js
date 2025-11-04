import { SHEET_SCHEMAS } from "../../util/sheet_schemas.js";
import { sheetCoordinator } from "../../util/sheet_coordinator.js";

export const run = async (req, res) => {
	try {
		await syncEoqRtgCrossdockSchedule();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function syncEoqRtgCrossdockSchedule() {
	const eoqRtgCrossdockScheduleSheetCoordinator = sheetCoordinator({
		functionName: "Sync EOQ RTG Crossdock Schedule",

		inSheetID: SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.prod_id,
		inSheetName:
			SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.pages.rtg_cross_dock_schedule,
		inSheetRange: "A2:AY176",

		outSheetID: SHEET_SCHEMAS.EOQ_TRANSFORMATION_FILE.prod_id,
		outSheetName: SHEET_SCHEMAS.EOQ_TRANSFORMATION_FILE.pages.crossdock_matrix,
		outSheetRange: "A2:AY176",

		insertTimestamp: true,
	});

	await eoqRtgCrossdockScheduleSheetCoordinator.run();
}
