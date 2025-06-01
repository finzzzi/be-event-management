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
router.post("/", initiateTransaction);
router.get("/:id", getTransactionDetails);
router.patch("/:id", applyDiscounts);
router.post("/:id/confirm", confirmTransaction);

export default router;
