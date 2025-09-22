export default function convertSheetDataToJson(sheetData) {
	if (!sheetData || sheetData.length < 2) {
		console.error(
			"Input data must be a 2D array with at least a header row and one data row.",
		);
		return [];
	}

	const headers = sheetData[0];
	const dataRows = sheetData.slice(1);

	const jsonData = dataRows.map((row) => {
		const obj = {};
		headers.forEach((header, index) => {
			obj[`${header}`.trim()] = row[index] !== undefined ? row[index] : null;
		});
		return obj;
	});

	return jsonData;
}
