export default function convertJsonToCsv(jsonData) {
	if (!Array.isArray(jsonData) || jsonData.length === 0) {
		return "";
	}
	const headers = Object.keys(jsonData[0]);
	const csvHeader = headers.join(",");

	const csvRows = jsonData.map((obj) => {
		return headers
			.map((header) => {
				let value = obj[header];
				if (
					typeof value === "string" &&
					(value.includes(",") || value.includes('"') || value.includes("\n"))
				) {
					value = `"${value.replace(/"/g, '""')}"`;
				}
				return value;
			})
			.join(",");
	});

	return [csvHeader, ...csvRows].join("\n");
}
