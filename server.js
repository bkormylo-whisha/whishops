import express from "express";
import "dotenv/config";

// Active Sheets Scripts
import * as sync_norcal_direct_order_log from "./scripts/coupler/sync_norcal_direct_order_log.js";
import * as sync_eoq_rtg_crossdock_schedule from "./scripts/coupler/sync_eoq_rtg_crossdock_schedule.js";
import * as sync_eoq_rtg_weekly_coverage from "./scripts/coupler/sync_eoq_rtg_weekly_coverage.js";
import * as sync_optimo_notes from "./scripts/sheet_director/sync_optimo_notes.js";
import * as get_optimo_completion_dates from "./scripts/invoice_date/get_optimo_completion_dates.js";
import * as cin7_get_orders from "./scripts/sheet_director/cin7_get_orders.js";
import * as run_geotab from "./scripts/geotab/run_geotab.js";

// Cin7 Automation
import * as flip_drafts_cin7 from "./scripts/flip_drafts/flip_drafts_cin7.js";
import * as audit_duplicates_cin7 from "./scripts/flip_drafts/audit_duplicates_cin7.js";
import * as audit_missing_po_whole_foods_cin7 from "./scripts/flip_drafts/audit_missing_po_whole_foods_cin7.js";
import * as audit_missing_po_target_cin7 from "./scripts/flip_drafts/audit_missing_po_target_cin7.js";

// SPS
import * as send_purchase_orders from "./sps/peets/send_purchase_orders.js";
import * as run_whole_foods_upload from "./sps/whole_foods/run_whole_foods_upload.js";

// Future Projects
import * as upload_routes_to_optimo from "./scripts/upload_routes_to_optimo.js";
import * as generate_print_log from "./scripts/print_log/generate_print_log.js";
import * as backup_and_clear_dol from "./scripts/backup/backup_and_clear_dol.js";
import * as backup_dol from "./scripts/backup/backup_dol.js";

// Finance Helpers
import * as get_pod_optimo from "./scripts/proof_of_delivery/get_pod_optimo.js";
import * as get_pod_cin7 from "./scripts/proof_of_delivery/get_pod_cin7.js";
import * as get_unpaid_invoices from "./scripts/proof_of_delivery/get_unpaid_invoices.js";
import * as send_sprouts_emails from "./scripts/proof_of_delivery/send_sprouts_emails.js";
import * as send_sprouts_delivery_emails from "./scripts/proof_of_delivery/send_sprouts_delivery_emails.js";
import * as stage_bulk_voids_cin7 from "./scripts/proof_of_delivery/stage_bulk_voids_cin7.js";
import * as get_bulk_ids_cin7 from "./scripts/proof_of_delivery/get_bulk_ids_cin7.js";

// PSQL Setup
import * as sync_master_store_list from "./scripts/psql/sync_master_store_list.js";
import * as sync_master_visit_log_optimo from "./scripts/psql/sync_master_visit_log_optimo.js";
import * as update_visit_log_sheet from "./scripts/psql/update_visit_log_sheet.js";
import * as get_orders_cin7 from "./scripts/psql/get_orders_cin7.js";

// Inactive BQ
import * as bq_sync_master_store_list from "./scripts/bq/bq_sync_master_store_list.js";
import * as bq_sync_optimo_visit_duration from "./scripts/bq/bq_sync_optimo_visit_duration.js";
import * as bq_sync_optimo_notes from "./scripts/bq/bq_sync_optimo_notes.js";

const app = express();
const PORT = process.env.PORT || 8080;

// Active Sheets Scripts

app.get("/sync_norcal_direct_order_log", (req, res) => {
	sync_norcal_direct_order_log.run(req, res);
});

app.get("/sync_eoq_rtg_crossdock_schedule", (req, res) => {
	sync_eoq_rtg_crossdock_schedule.run(req, res);
});

app.get("/sync_eoq_rtg_weekly_coverage", (req, res) => {
	sync_eoq_rtg_weekly_coverage.run(req, res);
});

app.get("/sync_optimo_notes", (req, res) => {
	sync_optimo_notes.run(req, res);
});

app.get("/get_optimo_completion_dates", (req, res) => {
	get_optimo_completion_dates.run(req, res);
});

// FUTURE replace sheet director
app.get("/cin7_get_orders", (req, res) => {
	cin7_get_orders.run(req, res);
});

// Geotab testing + Tanner Geotab checker script
app.get("/run_geotab", (req, res) => {
	run_geotab.run(req, res);
});

// SPS

app.get("/run_whole_foods_upload", (req, res) => {
	run_whole_foods_upload.run(req, res);
});

// Peets
app.get("/send_purchase_orders_peets", (req, res) => {
	send_purchase_orders.run(req, res);
});

// Cin7 Automations

app.get("/flip_drafts_cin7", (req, res) => {
	flip_drafts_cin7.run(req, res);
});

app.get("/audit_duplicates_cin7", (req, res) => {
	audit_duplicates_cin7.run(req, res);
});

app.get("/audit_missing_po_whole_foods_cin7", (req, res) => {
	audit_missing_po_whole_foods_cin7.run(req, res);
});

app.get("/audit_missing_po_target_cin7", (req, res) => {
	audit_missing_po_target_cin7.run(req, res);
});

// Finance

app.get("/get_pod_optimo", (req, res) => {
	get_pod_optimo.run(req, res);
});

app.get("/get_pod_cin7", (req, res) => {
	get_pod_cin7.run(req, res);
});

app.get("/get_unpaid_invoices", (req, res) => {
	get_unpaid_invoices.run(req, res);
});

app.get("/send_sprouts_emails", (req, res) => {
	send_sprouts_emails.run(req, res);
});

app.get("/send_sprouts_delivery_emails", (req, res) => {
	send_sprouts_delivery_emails.run(req, res);
});

app.get("/stage_bulk_voids_cin7", (req, res) => {
	stage_bulk_voids_cin7.run(req, res);
});

app.get("/get_bulk_ids_cin7", (req, res) => {
	get_bulk_ids_cin7.run(req, res);
});

// SQL Rewrites

app.get("/sync_master_store_list", (req, res) => {
	sync_master_store_list.run(req, res);
});

app.get("/get_orders_cin7", (req, res) => {
	get_orders_cin7.run(req, res);
});

app.get("/sync_master_visit_log_optimo", (req, res) => {
	sync_master_visit_log_optimo.run(req, res);
});

app.get("/update_visit_log_sheet", (req, res) => {
	update_visit_log_sheet.run(req, res);
});

// BQ (Deprecate)

app.get("/bq_sync_optimo_notes", (req, res) => {
	bq_sync_optimo_notes.run(req, res);
});

app.get("/bq_sync_master_store_list", (req, res) => {
	bq_sync_master_store_list.run(req, res);
});

app.get("/bq_sync_optimo_visit_duration", (req, res) => {
	bq_sync_optimo_visit_duration.run(req, res);
});

// Future
// app.get("/generate_print_log", (req, res) => {
// 	generate_print_log.run(req, res);
// });

// app.get("/upload_routes_to_optimo", (req, res) => {
// 	upload_routes_to_optimo.run(req, res);
// });

// app.get("/backup_and_clear_dol", (req, res) => {
// 	backup_and_clear_dol.run(req, res);
// });

// app.get("/backup_dol", (req, res) => {
// 	backup_dol.run(req, res);
// });

app.listen(PORT, () => {
	console.log(`Server listening on port ${PORT}`);
});
