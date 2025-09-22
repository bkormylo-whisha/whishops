export async function logRuntimeFor(functionToTime) {
	const startTime = new Date();
	await functionToTime();
	const elapsedTimeMS = Date.now() - startTime.getTime();
	console.log(`Total runtime: ${elapsedTimeMS / 1000} seconds`);
}
