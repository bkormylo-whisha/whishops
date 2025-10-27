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
import * as cin7_status_update from "./scripts/print_log/cin7_status_update.js";
import * as cin7_get_printed_orders from "./scripts/print_log/cin7_get_printed_orders.js";
import * as run_whole_foods_upload from "./sps/run_whole_foods_upload.js";
import * as backup_and_clear_dol from "./scripts/backup_and_clear_dol.js";
import * as backup_dol from "./scripts/backup_dol.js";
import * as stocktake_sync from "./scripts/stocktake_sync.js";
import * as get_pod_optimo from "./scripts/proof_of_delivery/get_pod_optimo.js";
import * as get_unpaid_invoices from "./scripts/proof_of_delivery/get_unpaid_invoices.js";
import * as send_sprouts_emails from "./scripts/proof_of_delivery/send_sprouts_emails.js";
import * as send_sprouts_delivery_emails from "./scripts/proof_of_delivery/send_sprouts_delivery_emails.js";
import * as sync_invoice_date_cin7 from "./scripts/invoice_date/sync_invoice_date_cin7.js";
import * as sync_master_store_list from "./scripts/psql/sync_master_store_list.js";
import * as get_orders_cin7 from "./scripts/psql/get_orders_cin7.js";
import * as flip_drafts_cin7 from "./scripts/flip_drafts/flip_drafts_cin7.js";

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

app.get("/cin7_get_printed_orders", (req, res) => {
	cin7_get_printed_orders.run(req, res);
});

app.get("/run_whole_foods_upload", (req, res) => {
	run_whole_foods_upload.run(req, res);
});

app.get("/backup_and_clear_dol", (req, res) => {
	backup_and_clear_dol.run(req, res);
});

app.get("/backup_dol", (req, res) => {
	backup_dol.run(req, res);
});

app.get("/stocktake_sync", (req, res) => {
	stocktake_sync.run(req, res);
});

app.get("/get_pod_optimo", (req, res) => {
	get_pod_optimo.run(req, res);
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

app.get("/sync_invoice_date_cin7", (req, res) => {
	sync_invoice_date_cin7.run(req, res);
});

app.get("/sync_master_store_list", (req, res) => {
	sync_master_store_list.run(req, res);
});

app.get("/get_orders_cin7", (req, res) => {
	get_orders_cin7.run(req, res);
});

app.get("/flip_drafts_cin7", (req, res) => {
	flip_drafts_cin7.run(req, res);
});

app.listen(PORT, () => {
	console.log(`Server listening on port ${PORT}`);
});
