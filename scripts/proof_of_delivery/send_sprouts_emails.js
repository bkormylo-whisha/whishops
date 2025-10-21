import { SHEET_SCHEMAS } from "../../util/sheet_schemas.js";
import { sheetExtractor } from "../../util/sheet_extractor.js";
import mailSender from "../../util/mail_sender.js";
import path from "path";
import * as fs from "fs";

export const run = async (req, res) => {
	try {
		await sendSproutsInvoiceEmails();
		res.status(200).json({ status: "success" });
	} catch (error) {
		console.error("Error during API call:", error);
		res.status(500).send("An error occurred.");
	}
};

async function sendSproutsInvoiceEmails() {
	const sproutsData = await getDataFromInvoiceMailer();
	const baseDir = path.resolve("./scripts/proof_of_delivery/");
	const templatePath = path.join(baseDir, "email_template.html");
	let emailTemplate;
	try {
		emailTemplate = fs.readFileSync(templatePath, "utf8");
	} catch (e) {
		console.error(`Couldn't read file: ${e}`);
		return;
	}

	const mailer = await mailSender({ fromFinance: true });

	for (const row of sproutsData) {
		const invoiceNumber = row.at(0);
		const recipient = row.at(2);
		const amountDue = `$${Number(row.at(3)).toFixed(2)}`;
		const storeName = row.at(4);
		let pod = row.at(6);
		console.log(`Pod: ${pod}`);
		if (pod !== undefined && pod.includes(",")) {
			pod = pod.split(",").at(0);
		}
		if (!pod || pod === "") {
			continue;
		}
		const emailHTML = emailTemplate
			.replace("{{PodURL}}", pod)
			.replaceAll("{{invoice_number}}", invoiceNumber)
			.replace("{{amount_due}}", amountDue);

		await mailer.send({
			recipients: [recipient],
			// cc: ["finance@whisha.com"],
			// recipients: ["bkormylo@whisha.com"],
			// recipients: ["bkormylo@whisha.com", "kgada@whisha.com"],
			subject: `WHISHA COFFEE - UNPAID INVOICE ${storeName}`,
			html: emailHTML,
		});
	}
}

async function getDataFromInvoiceMailer() {
	const sproutsEmailListExtractor = sheetExtractor({
		functionName: "Get Sprouts Emails",
		inSheetID: SHEET_SCHEMAS.INVOICE_MAILER.prod_id,
		inSheetName: SHEET_SCHEMAS.INVOICE_MAILER.pages.sprouts,
		inSheetRange: "A2:H",
	});

	const sproutsData = await sproutsEmailListExtractor.run();
	return sproutsData;
}
