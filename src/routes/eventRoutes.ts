import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import { verifyOrganizer } from "../middlewares/verifyOrganizer";
import { createEvent } from "../controllers/eventController";

const router = Router();

router.post('/', authenticate, verifyOrganizer, createEvent);

export default router;