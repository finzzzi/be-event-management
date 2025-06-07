import { Router } from "express";
import {
  register,
  login,
  verify,
  getUserProfile,
  requestResetPassword,
  confirmResetPassword,
  validateToken,
  switchRole,
} from "../controllers/authController";
import { authenticate } from "../middlewares/auth";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/verify", authenticate, verify);
router.get("/user", authenticate, getUserProfile);
router.post("/reset-password", requestResetPassword);
router.get("/reset-password/validate", validateToken);
router.post("/reset-password/confirm", confirmResetPassword);
router.post("/switch-role", authenticate, switchRole);

export default router;
