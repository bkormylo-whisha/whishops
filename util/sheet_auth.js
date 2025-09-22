import { GoogleAuth } from "google-auth-library";

export default async function getAuthenticatedClient() {
	const base64String = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64;
	const jsonString = Buffer.from(base64String, "base64").toString("utf-8");
	const credentials = JSON.parse(jsonString);

	const auth = new GoogleAuth({
		credentials: {
			client_email: credentials.client_email,
			private_key: credentials.private_key,
		},
		scopes: ["https://www.googleapis.com/auth/spreadsheets"], // And other scopes
	});

	return await auth.getClient();
}
