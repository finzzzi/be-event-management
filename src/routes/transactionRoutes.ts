import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import {
  initiateTransaction,
  getTransactionDetails,
  applyDiscounts,
  confirmTransaction,
} from "../controllers/transactionController";

const router = Router();

// all transaction endpoints require authentication
router.use(authenticate);

// tnitiate transaction (from event detail page)
router.post("/initiate", initiateTransaction);
router.get("/:transactionId", getTransactionDetails);
router.put("/:transactionId/apply-discounts", applyDiscounts);
router.post("/:transactionId/confirm", confirmTransaction);

export default router;
