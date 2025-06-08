import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendTransactionEmail = async (
  email: string,
  eventName: string,
  status: "accepted" | "rejected"
) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error("Email credentials not configured");
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  try {
    await transporter.verify();
    console.log("Server is ready to take our messages");
  } catch (error) {
    console.error("SMTP connection failed:", error);
    throw new Error("SMTP connection failed");
  }

  const subject =
    status === "accepted" ? "Transaction Accepted" : "Transaction Rejected";

  const text =
    status === "accepted"
      ? `Your transaction for "${eventName}" has been accepted!`
      : `Your transaction for "${eventName}" has been rejected. Please contact support.`;

  try {
    const info = await transporter.sendMail({
      from: `"Event Management" <${process.env.EMAIL_USER}>`,
      to: email,
      subject,
      text,
    });

    console.log("Message sent: %s", info.messageId);
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    throw new Error("Failed to send email");
  }
};
