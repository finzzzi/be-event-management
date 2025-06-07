import { Router } from "express";
import { getEventOrganizerProfile } from "../controllers/userController";

const router = Router();

router.get("/organizer/:id", getEventOrganizerProfile);

export default router;
