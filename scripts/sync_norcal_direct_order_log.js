import { SHEET_SCHEMAS } from "../util/sheet_schemas.js";
import { sheetCoordinator } from "../util/sheet_coordinator.js";

export const run = async (req, res) => {
	try {
		await syncNorcalDirectOrderLog();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function syncNorcalDirectOrderLog() {
	const norcalDolSheetCoordinator = sheetCoordinator({
		functionName: "Sync Norcal Direct Order Log",

		// inSheetID: SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.copy,
		inSheetID: SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.prod_id,
		inSheetName:
			SHEET_SCHEMAS.WHISHACCEL_DAILY_COVERAGE.pages.rtg_direct_order_log,
		inSheetRange: "A1:AE",

		outSheetID: SHEET_SCHEMAS.WHISHACCEL_NORCAL_ORDER_MANAGEMENT.prod_id,
		outSheetName:
			SHEET_SCHEMAS.WHISHACCEL_NORCAL_ORDER_MANAGEMENT.pages
				.temp_rtg_direct_order_log,
		outSheetRange: "A1:AE",

		insertTimestamp: true,
		timestampCol: 4,
		wipePreviousData: true,
	});

	await norcalDolSheetCoordinator.run();
}
