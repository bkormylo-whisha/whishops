// SCRIPT NOTES:
// Replacement for Coupler Module: (Routing) KPI Data

// The sheet breaks, I doubt this will run without improving the sheet itself

import { SHEET_SCHEMAS } from "../util/sheet_schemas.js";
import { sheetCoordinator } from "../util/sheet_coordinator.js";

export const run = async (req, res) => {
	console.log("Running Sync Routing KPI Data");
	try {
		await syncRoutingKpiData();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function syncRoutingKpiData() {
	const routingKpiDataSheetCoordinator = sheetCoordinator({
		functionName: "Sync Routing KPI Data",

		inSheetID: SHEET_SCHEMAS.ROUTING_AND_DISPATCH_KPI_BREAKOUT_DATA.id,
		inSheetName:
			SHEET_SCHEMAS.ROUTING_AND_DISPATCH_KPI_BREAKOUT_DATA.pages
				.no_order_summary_data,
		inSheetRange: "D:BP",

		outSheetID: SHEET_SCHEMAS.ROUTING_AND_DISPATCH_KPI_TRACKER.id,
		outSheetName:
			SHEET_SCHEMAS.ROUTING_AND_DISPATCH_KPI_TRACKER.pages.no_order_summary,
		outSheetRange: "T1",

		insertTimestamp: false,
	});

	await routingKpiDataSheetCoordinator.run();
}
