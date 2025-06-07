import { Router } from "express";
import {
  getEventOrganizerProfile,
  getUserProfile,
  updateUserProfile,
} from "../controllers/userController";
import { authenticate } from "../middlewares/auth";

const router = Router();

router.get("/organizer/:id", getEventOrganizerProfile);

router.use(authenticate);

router.get("/profile", getUserProfile);
router.patch("/profile", updateUserProfile);

export default router;
