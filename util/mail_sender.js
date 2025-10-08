import nodemailer from "nodemailer";

export default function mailSender(params) {
	async function run() {
		const recipients = params.recipients;
		const attachmentName = params.attachmentName ?? "file.csv";
		const attachmentPath = params.attachmentPath ?? "";
		const subject = params.subject ?? "Nodemailer Email";
		const bodyText = params.bodyText ?? "";
		const bodyHtml = params.html ?? "";
		const bodyAmp = params.amp ?? "";
		const fromFinance = params.fromFinance ?? false;
		const cc = params.cc ?? "";

		let user;
		let password;
		if (!fromFinance) {
			user = process.env.EMAIL_USERNAME;
			password = process.env.EMAIL_APP_PASSWORD;
		} else {
			user = process.env.FINANCE_EMAIL_USERNAME;
			password = process.env.FINANCE_EMAIL_APP_PASSWORD;
		}

		const transporter = nodemailer.createTransport({
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

		const mailOptions = {
			from: user,
			to: recipients,
			cc: cc,
			subject: subject,
			text: bodyText,
			html: bodyHtml,
			amp: bodyAmp,
			attachments: [
				{
					filename: attachmentName,
					path: attachmentPath,
				},
			],
		};

		transporter.sendMail(mailOptions, (error, info) => {
			if (error) {
				console.error("Error sending email: ", error);
			} else {
				console.log("Email sent: ", info.response);
			}
		});
	}

	return Object.freeze({
		run: run,
	});
}
