const express = require("express");
const app = express();
const sync_optimo_notes = require("./scripts/sync_optimo_notes");
require("dotenv").config();

const PORT = process.env.PORT || 8080;

app.get("/sync_optimo_notes", (req, res) => {
	console.log("Sync Optimo Notes");
	sync_optimo_notes.run(req, res);
});

app.listen(PORT, () => {
	console.log(`Server listening on port ${PORT}`);
});
