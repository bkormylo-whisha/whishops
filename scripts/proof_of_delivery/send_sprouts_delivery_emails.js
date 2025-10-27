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
	const templatePath = path.join(baseDir, "email_template_delivery.html");
	let emailTemplate;
	try {
		emailTemplate = fs.readFileSync(templatePath, "utf8");
	} catch (e) {
		console.error(`Couldn't read file: ${e}`);
		return;
	}

	const mailer = await mailSender({ fromFinance: true });

	for (const row of sproutsData) {
		const invoiceNumber = row.at(5);
		const storeName = row.at(2);
		const amountDue = `$${Number(row.at(3)).toFixed(2)}`;
		const recipient = `st${storeName.split(" ").at(-1).replaceAll("#", "")}receiver@sprouts.com`;
		let trackingNotes = row.at(6);
		const hasPoNumber = Number(trackingNotes.at(-1));
		if (!hasPoNumber) {
			trackingNotes = trackingNotes.split(";").at(0);
		}

		const emailHTML = emailTemplate
			.replace("{{tracking_notes}}", trackingNotes)
			.replaceAll("{{invoice_number}}", invoiceNumber)
			.replace("{{amount_due}}", amountDue);

		await mailer.send({
			recipients: [recipient],
			// cc: ["finance@whisha.com"],
			// recipients: ["bkormylo@whisha.com", "vvaviya@whisha.com"],
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
		inSheetName: SHEET_SCHEMAS.INVOICE_MAILER.pages.sprouts_by_mail,
		inSheetRange: "A2:G",
	});

	const sproutsData = await sproutsEmailListExtractor.run();
	return sproutsData;
}
