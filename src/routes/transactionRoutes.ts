import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import {
  uploadPaymentProof as uploadMiddleware,
  handleUploadError,
} from "../middlewares/uploader";
import {
  initiateTransaction,
  getTransactionDetails,
  applyDiscounts,
  confirmTransaction,
  uploadPaymentProof,
} from "../controllers/transactionController";

const router = Router();

// all transaction endpoints require authentication
router.use(authenticate);

// initiate transaction (from event detail page)
router.post("/", initiateTransaction);
router.get("/:id", getTransactionDetails);
router.patch("/:id", applyDiscounts);
router.patch("/:id/confirm", confirmTransaction);

// upload payment proof
router.patch(
  "/:id/payment-proof",
  uploadMiddleware,
  handleUploadError,
  uploadPaymentProof
);

export default router;
