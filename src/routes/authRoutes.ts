import { Router } from "express";
import {
  register,
  login,
  verify,
  getUserProfile,
} from "../controllers/authController";
import { authenticate } from "../middlewares/auth";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/verify", authenticate, verify);
router.get("/user", authenticate, getUserProfile);

export default router;
