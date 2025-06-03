import { NextFunction, Request, Response } from "express";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

export const createEvent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
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
      },
    });

    res.status(201).json(newEvent);
  } catch (error) {
    next(error);
  }
};

export const getEventsByOrganizer = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const events = await prisma.event.findMany({
      where: { userId: req.user.id },
      include: { category: true },
    });

    res.json(events);
  } catch (error) {
    next(error);
  }
};

export const getEventById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
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
};

export const updateEvent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
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

    console.log("Incoming update:", {
      id: eventId,
      body: req.body,
    });

    // Updates event based on given field
    const updatedEvent = await prisma.event.update({
      where: { id: eventId },
      data: {
        ...req.body,
        startDate: req.body.startDate
          ? new Date(req.body.startDate)
          : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
        updatedAt: new Date(),
      },
    });

    res.json(updatedEvent);
  } catch (error) {
    next(error);
  }
};

export const deleteEvent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
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

    await prisma.event.delete({
      where: {
        id: eventId,
      },
    });

    res.status(204).send("Event deleted succesfully!");
  } catch (error) {
    next(error);
  }
};

// endpoint untuk sisi customer
export const getAllEvents = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // const limit = parseInt(req.query.limit as string) || 3;
  // const offset = parseInt(req.query.offset as string) || 0;
  const category = req.query.category as string | undefined;
  const q = req.query.q as string | undefined;

  try {
    const events = await prisma.event.findMany({
      where: {
        startDate: {
          gte: new Date(),
        },
        ...(category ? { category: { name: category } } : {}),

        ...(q
          ? {
              name: {
                contains: q,
                mode: "insensitive",
              },
            }
          : {}),
      },
      include: {
        category: {
          select: {
            name: true,
          },
        },
        organizer: {
          select: {
            name: true,
          },
        },
        vouchers: {
          where: {
            startDate: {
              lte: new Date(),
            },
            endDate: {
              gte: new Date(),
            },
            quota: {
              gt: 0,
            },
            deletedAt: null,
          },
          select: {
            id: true,
            name: true,
            nominal: true,
            quota: true,
            startDate: true,
            endDate: true,
          },
        },
      },
      orderBy: {
        startDate: "asc",
      },
      // skip: offset,
      // take: limit,
    });

    res.status(200).json(events);
  } catch (error) {
    next(error);
  }
};

// endpoint untuk sisi customer
export const getDetailEventById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const eventId = parseInt(req.params.id);

  try {
    const event = await prisma.event.findFirst({
      where: {
        id: eventId,
      },
      include: {
        category: {
          select: {
            name: true,
          },
        },
        organizer: {
          select: {
            name: true,
          },
        },
        vouchers: {
          where: {
            startDate: {
              lte: new Date(),
            },
            endDate: {
              gte: new Date(),
            },
            quota: {
              gt: 0,
            },
            deletedAt: null,
          },
          select: {
            id: true,
            name: true,
            nominal: true,
            quota: true,
            startDate: true,
            endDate: true,
          },
        },
      },
    });

    if (!event) {
      throw res.status(404).json({ message: "Event not found" });
    }

    res.status(200).json(event);
  } catch (error) {
    next(error);
  }
};

// endpoint untuk ambil nama kategori
export const getAllCategory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const categories = await prisma.category.findMany({
      select: {
        id: true,
        name: true,
      },
    });

    res.status(200).json(categories);
  } catch (error) {
    next(error);
  }
};
