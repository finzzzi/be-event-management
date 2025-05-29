import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import { verifyOrganizer } from "../middlewares/verifyOrganizer";
import { 
  createEvent,
  deleteEvent,
  getEventById,
  getEventsByOrganizer, 
  updateEvent
} from "../controllers/eventController";

const router = Router();

router.use(authenticate, verifyOrganizer);

router.post('/', createEvent);
router.get('/', getEventsByOrganizer);
router.get('/:id', getEventById);
router.put('/:id', updateEvent);
router.delete('/:id', deleteEvent);

export default router;