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
} from "../controllers/transactionController";
import { verifyOrganizer } from "../middlewares/verifyOrganizer";

const router = Router();

// all transaction endpoints require authentication
router.use(authenticate);

// get user's transactions list
router.get("/user", getUserTransactions);

router.post("/", createTransaction);

// upload payment proof
router.patch(
  "/:id/payment-proof",
  uploadMiddleware,
  handleUploadError,
  uploadPaymentProof
);

// EO Side
router.get("/eo", authenticate, verifyOrganizer, getEOTransactions);
router.get(
  "/payment-proof/:id",
  authenticate,
  verifyOrganizer,
  getPaymentProof
);

export default router;
