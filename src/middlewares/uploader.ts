import multer from "multer";
import { Request } from "express";
import path from "path";
import fs from "fs";

// create uploads directory if it doesn't exist
const uploadDir = path.join(process.cwd(), "uploads", "payment-proofs");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// configure multer storage
const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    cb(null, uploadDir);
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    const transactionId = req.params.id;
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const filename = `payment-proof-${transactionId}-${timestamp}${ext}`;
    cb(null, filename);
  },
});

// file filter to only allow images and PDFs
const fileFilter = (req: Request, file: Express.Multer.File, cb: any) => {
  const allowedTypes = /jpeg|jpg|png|pdf/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(
      new Error("Only images (JPEG, JPG, PNG) and PDF files are allowed"),
      false
    );
  }
};

// configure multer
export const uploadPaymentProof = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: fileFilter,
}).single("payment_proof");

// error handler middleware for multer
export const handleUploadError = (
  error: any,
  _req: Request,
  res: any,
  next: any
) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ message: "File too large. Maximum size is 5MB" });
    }
    return res.status(400).json({ message: error.message });
  }

  if (error.message.includes("Only images")) {
    return res.status(400).json({ message: error.message });
  }

  next(error);
};
