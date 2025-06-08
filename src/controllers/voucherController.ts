import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

export const getAllVouchers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;

    // Get all events belonging to the user
    const userEvents = await prisma.event.findMany({
      where: { userId },
      select: { id: true },
    });

    const eventIds = userEvents.map((event) => event.id);

    // Get all vouchers for these events
    const vouchers = await prisma.voucher.findMany({
      where: {
        eventId: { in: eventIds },
      },
      include: {
        event: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(vouchers);
  } catch (error) {
    next(error);
  }
};

export const createVoucher = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const { eventId, name, nominal, quota, startDate, endDate } = req.body;

    // Validate input
    if (!eventId || !name || !nominal || !quota || !startDate || !endDate) {
      throw res.status(400).json({ error: "All fields are required" });
    }

    // Verify event belongs to user
    const event = await prisma.event.findUnique({
      where: { id: parseInt(eventId) },
    });

    if (!event || event.userId !== userId) {
      throw res
        .status(403)
        .json({ error: "Unauthorized to create voucher for this event" });
    }

    // Create voucher
    const voucher = await prisma.voucher.create({
      data: {
        name,
        nominal: parseInt(nominal),
        quota: parseInt(quota),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        eventId: parseInt(eventId),
      },
    });

    res.status(201).json(voucher);
  } catch (error) {
    next(error);
  }
};

export const getEventVouchers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const eventId = parseInt(req.params.eventId);

    // Verify event belongs to user
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event || event.userId !== userId) {
      throw res
        .status(403)
        .json({ error: "Unauthorized to view vouchers for this event" });
    }

    // Get vouchers for event
    const vouchers = await prisma.voucher.findMany({
      where: { eventId },
      orderBy: { createdAt: "desc" },
    });

    res.json(vouchers);
  } catch (error) {
    next(error);
  }
};

export const updateVoucher = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const voucherId = parseInt(req.params.id);
    const { name, nominal, quota, startDate, endDate } = req.body;

    // Get voucher with event relationship
    const voucher = await prisma.voucher.findUnique({
      where: { id: voucherId },
      include: { event: true },
    });

    if (!voucher) {
      throw res.status(404).json({ error: "Voucher not found" });
    }

    if (voucher.event.userId !== userId) {
      throw res
        .status(403)
        .json({ error: "Unauthorized to update this voucher" });
    }

    // Update voucher
    const updatedVoucher = await prisma.voucher.update({
      where: { id: voucherId },
      data: {
        name,
        nominal: nominal ? parseInt(nominal) : undefined,
        quota: quota ? parseInt(quota) : undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
    });

    res.json(updatedVoucher);
  } catch (error) {
    next(error);
  }
};

export const deleteVoucher = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const voucherId = parseInt(req.params.id);

    // Get voucher with event relationship
    const voucher = await prisma.voucher.findUnique({
      where: { id: voucherId },
      include: { event: true },
    });

    if (!voucher) {
      throw res.status(404).json({ error: "Voucher not found" });
    }

    if (voucher.event.userId !== userId) {
      throw res
        .status(403)
        .json({ error: "Unauthorized to delete this voucher" });
    }

    // Soft delete (set deleteAt timestamp)
    await prisma.voucher.update({
      where: { id: voucherId },
      data: { deletedAt: new Date() },
    });

    res.json({ message: "Voucher deleted successfully" });
  } catch (error) {
    next(error);
  }
};
