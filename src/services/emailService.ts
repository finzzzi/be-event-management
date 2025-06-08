import nodemailer from "nodemailer";
import handlebars from "handlebars";
import fs from "fs";
import path from "path";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "miftup@gmail.com",
    pass: "koxc pume dtba zrdb",
  },
});

export const sendResetPasswordEmail = async (
  email: string,
  resetToken: string
) => {
  try {
    const templatePath = path.join(
      __dirname,
      "../templates/resetPasswordEmail.hbs"
    );
    const templateSource = fs.readFileSync(templatePath, "utf-8");
    const template = handlebars.compile(templateSource);

    const resetUrl = `http://localhost:3000/reset?token=${resetToken}`;

    const htmlContent = template({
      email,
      resetUrl,
      resetToken,
    });

    const mailOptions = {
      from: "miftup@gmail.com",
      to: email,
      subject: "Reset Password - EVENTIO",
      html: htmlContent,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending reset password email:", error);
    throw new Error("Failed to send reset password email");
  }
};
