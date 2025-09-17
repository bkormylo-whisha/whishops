import express from "express";
import * as sync_optimo_notes from "./scripts/sync_optimo_notes.js";
import * as sync_norcal_direct_order_log from "./scripts/sync_norcal_direct_order_log.js";
import * as sync_routing_kpi_data from "./scripts/sync_routing_kpi_data.js";
import "dotenv/config";

const app = express();

const PORT = process.env.PORT || 8080;

app.get("/sync_optimo_notes", (req, res) => {
	console.log("Sync Optimo Notes");
	sync_optimo_notes.run(req, res);
});

app.get("/sync_routing_kpi_data", (req, res) => {
	console.log("Sync Routing KPI Data");
	sync_routing_kpi_data.run(req, res);
});

app.get("/sync_norcal_direct_order_log", (req, res) => {
	console.log("Sync Norcal Direct Order Log");
	sync_norcal_direct_order_log.run(req, res);
});

app.listen(PORT, () => {
	console.log(`Server listening on port ${PORT}`);
});
