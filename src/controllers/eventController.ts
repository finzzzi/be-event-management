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

export const getEventAttendees = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const eventId = parseInt(req.params.id);
    const userId = req.user?.id;

    // Verify event belongs to user
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event || event.userId !== userId) {
      res.status(403).json({ error: "Unauthorized for this event" });
      return;
    }

    // Get attendees (successful transactions)
    const attendees = await prisma.transaction.findMany({
      where: {
        eventId,
        transactionStatusId: 3, // Accepted status
      },
      select: {
        id: true,
        quantity: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Transform to match frontend structure
    const result = attendees.map((tx) => ({
      id: tx.id,
      user: tx.user,
      quantity: tx.quantity,
      transactionDate: tx.createdAt.toISOString(),
    }));

    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getEventReports = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Get events for this organizer
    const events = await prisma.event.findMany({
      where: { userId },
      include: {
        transactions: {
          where: { transactionStatusId: 3 }, // Accepted status
        },
      },
    });

    // Calculate daily, monthly, yearly reports
    const now = new Date();
    const dailyData = calculateDailyReport(events, now);
    const monthlyData = calculateMonthlyReport(events, now);
    const yearlyData = calculateYearlyReport(events);
    const eventDistribution = calculateEventDistribution(events);
    const topEvents = calculateTopEvents(events);

    res.json({
      daily: dailyData,
      monthly: monthlyData,
      yearly: yearlyData,
      eventDistribution,
      topEvents,
    });
  } catch (error) {
    next(error);
  }
};

// Helper functions
function calculateDailyReport(events: any[], now: Date) {
  const dailyData: { date: string; count: number }[] = [];

  // Get last 7 days
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];

    let count = 0;
    events.forEach((event) => {
      event.transactions.forEach((tx: any) => {
        const txDate = tx.createdAt.toISOString().split("T")[0];
        if (txDate === dateStr) {
          count += tx.quantity;
        }
      });
    });

    dailyData.push({
      date: date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      count,
    });
  }

  return dailyData;
}

function calculateMonthlyReport(events: any[], now: Date) {
  const monthlyData: { month: string; count: number }[] = [];

  // Get last 6 months
  for (let i = 5; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = monthDate.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });

    let count = 0;
    events.forEach((event) => {
      event.transactions.forEach((tx: any) => {
        const txMonth = new Date(tx.createdAt).getMonth();
        const txYear = new Date(tx.createdAt).getFullYear();

        if (
          txMonth === monthDate.getMonth() &&
          txYear === monthDate.getFullYear()
        ) {
          count += tx.quantity;
        }
      });
    });

    monthlyData.push({
      month: monthStr,
      count,
    });
  }

  return monthlyData;
}

function calculateYearlyReport(events: any[]) {
  const yearlyData: { year: string; count: number }[] = [];

  // Get current year and previous 2 years
  const currentYear = new Date().getFullYear();
  for (let year = currentYear - 2; year <= currentYear; year++) {
    let count = 0;
    events.forEach((event) => {
      event.transactions.forEach((tx: any) => {
        const txYear = new Date(tx.createdAt).getFullYear();
        if (txYear === year) {
          count += tx.quantity;
        }
      });
    });

    yearlyData.push({
      year: year.toString(),
      count,
    });
  }

  return yearlyData;
}

function calculateEventDistribution(events: any[]) {
  return events.map((event) => ({
    eventName: event.name,
    count: event.transactions.reduce(
      (sum: number, tx: any) => sum + tx.quantity,
      0
    ),
  }));
}

function calculateTopEvents(events: any[], count = 5) {
  return events
    .map((event) => ({
      eventName: event.name,
      attendees: event.transactions.reduce(
        (sum: number, tx: any) => sum + tx.quantity,
        0
      ),
    }))
    .sort((a, b) => b.attendees - a.attendees)
    .slice(0, count);
}

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

export const getEventsWithPagination = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 6;
  const categories = req.query.categories as string | undefined;

  // menghitung offset berdasarkan page
  const offset = (page - 1) * limit;

  // parse categories untuk multiple filter
  let categoryNames: string[] = [];
  if (categories) {
    categoryNames = categories.split(",").map((cat) => cat.trim());
  }

  try {
    const events = await prisma.event.findMany({
      where: {
        startDate: {
          gte: new Date(),
        },
        ...(categoryNames.length > 0
          ? {
              category: {
                name: {
                  in: categoryNames,
                },
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
      skip: offset,
      take: limit,
    });

    // mendapatkan total count untuk pagination info
    const totalEvents = await prisma.event.count({
      where: {
        startDate: {
          gte: new Date(),
        },
        ...(categoryNames.length > 0
          ? {
              category: {
                name: {
                  in: categoryNames,
                },
              },
            }
          : {}),
      },
    });

    const totalPages = Math.ceil(totalEvents / limit);

    res.status(200).json({
      data: events,
      pagination: {
        currentPage: page,
        totalPages,
        totalEvents,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    next(error);
  }
};
