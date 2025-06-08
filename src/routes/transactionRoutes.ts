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
  getEOTransactions,
  getPaymentProof,
  acceptTransaction,
  rejectTransaction,
  createReview,
  getReviewsByTransactionId,
} from "../controllers/transactionController";
import { verifyOrganizer } from "../middlewares/verifyOrganizer";

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

// EO Side
router.use(authenticate, verifyOrganizer);

router.get("/eo", getEOTransactions);
router.get("/payment-proof/:id", getPaymentProof);
router.patch("/:id/accept", acceptTransaction);
router.patch("/:id/reject", rejectTransaction);

export default router;
