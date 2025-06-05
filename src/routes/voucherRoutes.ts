import express from "express";
import {
  createVoucher,
  getEventVouchers,
  updateVoucher,
  deleteVoucher,
  getAllVouchers,
} from "../controllers/voucherController";
import { authenticate } from "../middlewares/auth";
import { verifyOrganizer } from "../middlewares/verifyOrganizer";

const router = express.Router();

router.use(authenticate, verifyOrganizer);

// Get all vouchers
router.get("/", getAllVouchers);

// Create a new voucher
router.post("/", createVoucher);

// Get vouchers for a specific event
router.get("/event/:eventId", getEventVouchers);

// Update a voucher
router.put("/:id", updateVoucher);

// Delete a voucher (soft delete)
router.delete("/:id", deleteVoucher);

export default router;
