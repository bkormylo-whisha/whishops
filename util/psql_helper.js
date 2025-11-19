import { Connector } from "@google-cloud/cloud-sql-connector";
import { Pool } from "pg";

export default async function psqlHelper() {
	let connector;
	let pool;

	const establishConnection = async () => {
		connector = new Connector();
		const ipType = process.env.PRIVATE_IP === "true" ? "PRIVATE" : "PUBLIC";

		const clientOpts = await connector.getOptions({
			instanceConnectionName: process.env.INSTANCE_CONNECTION_NAME,
			ipType: ipType,
		});

		const dbConfig = {
			user: process.env.DB_USER,
			password: process.env.DB_PASS,
			database: process.env.DB_NAME,
			...clientOpts,
		};

		pool = new Pool(dbConfig);
	};

	const runQuery = async (query, values) => {
		try {
			const client = await pool.connect();
			let result;
			if (values) {
				result = await client.query(query, values);
			} else {
				result = await client.query(query);
			}

			console.log("Successfully connected to Cloud SQL PostgreSQL");
			client.release(); // Release the client back to the pool
			return result;
		} catch (err) {
			console.error("Error connecting to Cloud SQL PostgreSQL:", err);
		}
	};

	const closeConnection = async () => {
		connector.close(); // Close the connector when done
		await pool.end(); // End the connection pool
	};

	return Object.freeze({
		establishConnection: establishConnection,
		runQuery: runQuery,
		closeConnection: closeConnection,
	});
}
