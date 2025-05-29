import { NextFunction, Request, Response } from "express";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

export const createEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      name,
      categoryId,
      price,
      quota,
      startDate,
      endDate,
      location,
      description,
    } = req.body;

    const userId = req.user?.id;

    // Check for missing fields
    if (
      !name ||
      !categoryId ||
      !price ||
      !quota ||
      !startDate ||
      !endDate ||
      !location ||
      !description
    ) {
      throw res.status(400).json({ message: "All fields are required" });
    }

    const newEvent = await prisma.event.create({
      data: {
        name,
        categoryId,
        price,
        quota,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        location,
        description,
        userId: userId!,
      }
    });

    res.status(201).json(newEvent);
  } catch (error) {
    next(error);
  }
}

export const getEventsByOrganizer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const events = await prisma.event.findMany({
      where: { userId: req.user.id },
      include: { category: true },
    });

    res.json(events);
  } catch (error) {
    next(error);
  }
}

export const getEventById = async (req: Request, res: Response, next: NextFunction) => {
  const eventId = parseInt(req.params.id);

  try {
    const event = await prisma.event.findFirst({
      where: {
        id: eventId,
        userId: req.user.id,
      },
      include: { category: true },
    });

    if (!event) {
      throw res.status(404).json({ message: "Event not found" });
    }

    res.json(event);
  } catch (error) {
    next(error);
  }
}

export const updateEvent = async (req: Request, res: Response, next: NextFunction) => {
  const eventId = parseInt(req.params.id);

  try {
    // Check if event exist or not
    const existingEvent = await prisma.event.findFirst({
      where: {
        id: eventId,
        userId: req.user.id,
      },
    });

    if (!existingEvent) {
      throw res.status(404).json({ message: "Event not found" });
    }

    // Updates event based on given field
    const updatedEvent = await prisma.event.update({
      where: { id: eventId },
      data: {
        ...req.body,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
        updatedAt: new Date(),
      },
    });

    res.json(updatedEvent);
  } catch (error) {
    next(error);
  }
}