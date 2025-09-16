const express = require("express");
const app = express();
const scriptA = require("./run-script-a"); // Import the script

const PORT = process.env.PORT || 8080;

// The API endpoint that triggers the script
app.get("/run-script-a", (req, res) => {
	scriptA.run(req, res); // Call the exported function
});

// ... other routes and server setup
app.listen(PORT, () => {
	console.log(`Server listening on port ${PORT}`);
});
