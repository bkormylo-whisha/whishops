export default function excelDateToTimestamp(excelDate) {
	if (typeof excelDate !== "number" || excelDate <= 0) {
		return NaN;
	}

	const EXCEL_EPOCH_DIFF_DAYS = 25569;
	const MS_PER_DAY = 24 * 60 * 60 * 1000;
	const daysSinceEpoch = excelDate - EXCEL_EPOCH_DIFF_DAYS;
	const timestampMs = daysSinceEpoch * MS_PER_DAY;

	if (isNaN(timestampMs)) {
		return "Invalid Date";
	}
	return new Date(timestampMs).toISOString();
}
