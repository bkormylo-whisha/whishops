import { SHEET_SCHEMAS } from "../../util/sheet_schemas.js";
import { sheetExtractor } from "../../util/sheet_extractor.js";
import mailSender from "../../util/mail_sender.js";
import mailSenderRework from "../../util/mail_sender_rework.js";
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
	const sproutsData = await getDataFromDOL();
	const baseDir = path.resolve("./scripts/proof_of_delivery/");
	const templatePath = path.join(baseDir, "email_template.html");
	let emailTemplate;
	try {
		emailTemplate = fs.readFileSync(templatePath, "utf8");
	} catch (e) {
		console.error(`Couldn't read file: ${e}`);
		return;
	}

	const mailer = mailSenderRework({ fromFinance: true });
	mailer.init();

	for (const row of sproutsData) {
		const invoiceNumber = row.at(0);
		const recipient = row.at(1);
		const amountDue = `$${Number(row.at(2)).toFixed(2)}`;
		const storeName = row.at(3);
		const pod = row.at(4).split(",").at(0);
		if (!pod || pod === "") {
			continue;
		}
		const emailHTML = emailTemplate
			.replace("{{PodURL}}", pod)
			.replaceAll("{{invoice_number}}", invoiceNumber)
			.replace("{{amount_due}}", amountDue);

		mailer.send({
			recipients: [recipient],
			// cc: ["finance@whisha.com"],
			// recipients: ["bkormylo@whisha.com"],
			// recipients: ["bkormylo@whisha.com", "kgada@whisha.com"],
			subject: `WHISHA COFFEE - UNPAID INVOICE ${storeName}`,
			html: emailHTML,
		});
	}
}

async function getDataFromDOL() {
	const sproutsEmails = sheetExtractor({
		functionName: "Get Sprouts Emails",
		inSheetID: SHEET_SCHEMAS.INVOICE_MAILER.prod_id,
		inSheetName: SHEET_SCHEMAS.INVOICE_MAILER.pages.sprouts,
		inSheetRange: "A1:E",
	});

	const sproutsData = await sproutsEmails.run();

	return sproutsData;
}
