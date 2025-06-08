import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import { verifyOrganizer } from "../middlewares/verifyOrganizer";
import {
  createEvent,
  deleteEvent,
  getEventById,
  getEventsByOrganizer,
  updateEvent,
  getAllEvents,
  getDetailEventById,
  getAllCategory,
  getEventAttendees,
  getEventReports,
  getEventsWithPagination,
} from "../controllers/eventController";

const router = Router();

//endpoint sisi customer
router.get("/all", getAllEvents);
router.get("/all-with-pagination", getEventsWithPagination);
router.get("/detail/:id", getDetailEventById);
router.get("/categories", getAllCategory);

// endpoint sisi event organizer
router.use(authenticate, verifyOrganizer);

router.post("/", createEvent);
router.get("/", getEventsByOrganizer);
router.get("/reports", getEventReports);
router.get("/:id", getEventById);
router.get("/:id/attendees", getEventAttendees);
router.put("/:id", updateEvent);
router.delete("/:id", deleteEvent);

export default router;
