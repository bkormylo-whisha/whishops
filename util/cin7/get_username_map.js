import delay from "../delay.js";

export default async function getUsernameMapFromCin7() {
	const url = "https://api.cin7.com/api/";
	const username = process.env.CIN7_USERNAME;
	const password = process.env.CIN7_PASSWORD;

	let options = {};
	options.headers = {
		Authorization: "Basic " + btoa(username + ":" + password),
	};

	let result = [];
	const user_endpoint = `v1/Users?fields=id,firstName,lastName,isActive&where=isActive='true'`;

	try {
		const response = await fetch(`${url}${user_endpoint}`, options);
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const data = await response.json();
		await delay(200);

		for (let i = 0; i < data.length; i++) {
			const row = data[i];
			result.push(row);
		}
	} catch (error) {
		console.error("Failed to fetch data:", error);
	}

	const nameMap = new Map();
	for (const user of result) {
		const fullName = `${user.firstName?.trim()} ${user.lastName?.trim()}`;
		nameMap.set(user.id, fullName);
	}

	return nameMap;
}
