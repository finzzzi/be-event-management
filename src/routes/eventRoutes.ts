import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import { verifyOrganizer } from "../middlewares/verifyOrganizer";
import { 
  createEvent,
  getEventsByOrganizer 
} from "../controllers/eventController";

const router = Router();

router.use(authenticate, verifyOrganizer);

router.post('/', createEvent);
router.get('/', getEventsByOrganizer)

export default router;