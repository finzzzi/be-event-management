import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import {
  uploadPaymentProof as uploadMiddleware,
  handleUploadError,
} from "../middlewares/uploader";
import {
  createTransaction,
  uploadPaymentProof,
  getUserTransactions,
  createReview,
  getReviewsByTransactionId,
} from "../controllers/transactionController";

const router = Router();

// all transaction endpoints require authentication
router.use(authenticate);

// get user's transactions list
router.get("/user", getUserTransactions);

router.post("/", createTransaction);
router.post("/review", createReview);
router.get("/review", getReviewsByTransactionId);

// upload payment proof
router.patch(
  "/:id/payment-proof",
  uploadMiddleware,
  handleUploadError,
  uploadPaymentProof
);

export default router;
