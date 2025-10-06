import nodemailer from "nodemailer";

export default function mailSender(params) {
	async function run() {
		const recipients = params.recipients;
		const attachmentName = params.attachmentName ?? "file.csv";
		const attachmentPath = params.attachmentPath ?? "";
		const subject = params.subject ?? "Nodemailer Email";
		const bodyText = params.bodyText ?? "";
		const user = process.env.EMAIL_USERNAME;
		const password = process.env.EMAIL_APP_PASSWORD;

		const transporter = nodemailer.createTransport({
			service: "Gmail",
			host: "smtp.gmail.com",
			port: 465,
			secure: true,
			auth: {
				user: user,
				pass: password,
			},
		});

		const mailOptions = {
			from: user,
			to: recipients,
			subject: subject,
			text: bodyText,
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
