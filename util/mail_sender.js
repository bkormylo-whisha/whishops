import nodemailer from "nodemailer";

export default async function mailSender(mailerParams) {
	const fromFinance = mailerParams?.fromFinance ?? false;
	let user;
	let password;
	let transporter;

	async function init() {
		if (!fromFinance) {
			user = process.env.EMAIL_USERNAME;
			password = process.env.EMAIL_APP_PASSWORD;
		} else {
			user = process.env.FINANCE_EMAIL_USERNAME;
			password = process.env.FINANCE_EMAIL_APP_PASSWORD;
		}

		transporter = nodemailer.createTransport({
			service: "Gmail",
			host: "smtp.gmail.com",
			port: 465,
			secure: true,
			auth: {
				user: user,
				pass: password,
			},
			pool: true,
		});
	}

	async function send(params) {
		const recipients = params.recipients;
		const attachmentName = params.attachmentName ?? "file.csv";
		const attachmentPath = params.attachmentPath ?? "";
		const attachments = params.attachments ?? [];
		const subject = params.subject ?? "Nodemailer Email";
		const bodyText = params.bodyText ?? "";
		const bodyHtml = params.html ?? "";
		const bodyAmp = params.amp ?? "";
		const cc = params.cc ?? "";

		let mailOptions = {
			from: user,
			to: recipients,
			cc: cc,
			subject: subject,
			text: bodyText,
			html: bodyHtml,
			amp: bodyAmp,
		};

		if (attachmentPath !== "") {
			mailOptions.attachments = [
				{
					filename: attachmentName,
					path: attachmentPath,
				},
			];
		} else {
			mailOptions.attachments = attachments;
		}

		await transporter.sendMail(mailOptions, (error, info) => {
			if (error) {
				console.error("Error sending email: ", error);
			} else {
				console.log("Email sent: ", info.response);
			}
		});
	}

	await init();

	return Object.freeze({
		send: send,
	});
}
