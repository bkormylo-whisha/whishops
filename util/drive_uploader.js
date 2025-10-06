import { google } from "googleapis";
import getAuthenticatedClient from "./google_auth.js";
import * as fs from "fs";
import * as path from "path";

export function driveUploader(params) {
	async function run() {
		const auth = await getAuthenticatedClient();
		const drive = google.drive({ version: "v3", auth });

		console.log(`Running script: CSV File Upload to Drive`);

		const filePath = params.filePath;
		const folderId = params.folderId;
		const fileName = path.basename(filePath);
		const mimeType = "text/csv";

		if (!filePath || !folderId) {
			throw new Error(
				"Missing required parameters: filePath and folderId must be provided.",
			);
		}

		const parentFolderId = folderId;
		console.log(`Target folder ID set to: ${parentFolderId}`);

		console.log(
			`Uploading file: ${fileName} with specific MIME type ${mimeType}`,
		);

		try {
			if (!fs.existsSync(filePath)) {
				throw new Error(`Local file not found at path: ${filePath}`);
			}

			const fileMetadata = {
				name: fileName,
				parents: [folderId],
			};

			const media = {
				mimeType: mimeType,
				body: fs.createReadStream(filePath),
			};

			const response = await drive.files.create({
				resource: fileMetadata,
				media: media,
				supportsAllDrives: true,
				fields: "id, name, webContentLink, webViewLink",
			});

			console.log("File uploaded successfully.");
			console.log(`File ID: ${response.data.id}`);
			console.log(`View Link: ${response.data.webViewLink}`);

			return response.data;
		} catch (e) {
			console.error("Error during Drive upload operation:", e);
			throw new Error(`Upload failed for file ${fileName}: ${e.message}`);
		}
	}

	return Object.freeze({
		run: run,
	});
}

// Example usage structure (would run in a separate execution file)
/*
const uploader = driveUploader({
    filePath: '/path/to/local/data.csv',
    folderId: '1AbC2dEfG3hIjKlM4nOpQ5rStUvW6xY7z', // Replace with a real ID
});

uploader.run().then(result => {
    console.log('Final Result:', result);
}).catch(err => {
    console.error('Upload Process Failed:', err.message);
});
*/
