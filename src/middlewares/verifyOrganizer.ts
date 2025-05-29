import { Request, Response, NextFunction } from "express";

export const verifyOrganizer = (req: Request, res: Response, next: NextFunction) => {
  // Only Event Organizer should be able to pass here
  if (req.user?.role !== "EventOrganizer") {
    throw res.status(403).json({ message: "Access denied: organizers only" });
  }
  next();
};
