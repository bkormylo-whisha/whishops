const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

// Define a route for the home page ('/')
app.get("/", (req, res) => {
	res.send("Hello, Express!");
});

// Start the server
app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});
