// SCRIPT NOTES:
// Replacement for Coupler Module: (Routing) KPI Data

function syncRoutingKpiData() {
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

		insertTimestamp: true,
	});

	routingKpiDataSheetCoordinator.run();
}
