const express = require("express");
const app = express();
const sync_optimo_notes = require("./scripts/sync_optimo_notes"); // Import the script
require("dotenv").config();

const PORT = process.env.PORT || 8080;

// The API endpoint that triggers the script
app.get("/sync_optimo_notes", (req, res) => {
	console.log("Sync Optimo Notes");
	sync_optimo_notes.run(req, res); // Call the exported function
});

// ... other routes and server setup
app.listen(PORT, () => {
	console.log(`Server listening on port ${PORT}`);
});
