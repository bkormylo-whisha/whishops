import express from "express";
import "dotenv/config";
import * as bq_sync_optimo_notes from "./scripts/bq_sync_optimo_notes.js";
import * as sync_norcal_direct_order_log from "./scripts/sync_norcal_direct_order_log.js";
import * as sync_eoq_rtg_crossdock_schedule from "./scripts/sync_eoq_rtg_crossdock_schedule.js";
import * as sync_eoq_rtg_weekly_coverage from "./scripts/sync_eoq_rtg_weekly_coverage.js";
import * as sync_routing_kpi_data from "./scripts/sync_routing_kpi_data.js";
import * as upload_routes_to_optimo from "./scripts/upload_routes_to_optimo.js";
import * as bq_sync_master_store_list from "./scripts/bq_sync_master_store_list.js";
import * as bq_sync_optimo_visit_duration from "./scripts/bq_sync_optimo_visit_duration.js";
import * as cin7_status_update from "./scripts/cin7_status_update.js";
import * as run_whole_foods_upload from "./sps/whole_foods.js";

const app = express();
const PORT = process.env.PORT || 8080;

app.get("/bq_sync_optimo_notes", (req, res) => {
	bq_sync_optimo_notes.run(req, res);
});

app.get("/bq_sync_master_store_list", (req, res) => {
	bq_sync_master_store_list.run(req, res);
});

app.get("/bq_sync_optimo_visit_duration", (req, res) => {
	bq_sync_optimo_visit_duration.run(req, res);
});

app.get("/upload_routes_to_optimo", (req, res) => {
	upload_routes_to_optimo.run(req, res);
});

app.get("/sync_norcal_direct_order_log", (req, res) => {
	sync_norcal_direct_order_log.run(req, res);
});

app.get("/sync_eoq_rtg_crossdock_schedule", (req, res) => {
	sync_eoq_rtg_crossdock_schedule.run(req, res);
});

app.get("/sync_eoq_rtg_weekly_coverage", (req, res) => {
	sync_eoq_rtg_weekly_coverage.run(req, res);
});

app.get("/sync_routing_kpi_data", (req, res) => {
	sync_routing_kpi_data.run(req, res);
});

app.get("/cin7_status_update", (req, res) => {
	cin7_status_update.run(req, res);
});

app.get("/run_whole_foods_upload", (req, res) => {
	run_whole_foods_upload.run(req, res);
});

app.listen(PORT, () => {
	console.log(`Server listening on port ${PORT}`);
});
