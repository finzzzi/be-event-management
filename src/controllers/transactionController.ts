import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../generated/prisma";
import { sendTransactionEmail } from "../utils/emailService";

const prisma = new PrismaClient();

// utility functions to reduce redundancy
const getValidPointsCondition = (userId: number) => ({
  userId,
  OR: [
    {
      expiredAt: {
        gt: new Date(),
      },
    },
    {
      expiredAt: null,
    },
  ],
  deletedAt: null,
});

const getValidCouponCondition = (userId: number) => ({
  userId,
  expiredAt: {
    gt: new Date(),
  },
  deletedAt: null,
});

const isVoucherValid = (voucher: any) => {
  const now = new Date();
  return (
    voucher.startDate <= now &&
    voucher.endDate >= now &&
    voucher.quota > 0 &&
    !voucher.deletedAt
  );
};

const getOrderedUserPoints = async (userId: number) => {
  // get points ordered by expiration (closest to expiry first, then non-expiring)
  const userPointsWithExpiry = await prisma.point.findMany({
    where: {
      userId,
      expiredAt: { gt: new Date() },
      deletedAt: null,
    },
    orderBy: { expiredAt: "asc" },
  });

  const userPointsNoExpiry = await prisma.point.findMany({
    where: {
      userId,
      expiredAt: null,
      deletedAt: null,
    },
    orderBy: { createdAt: "asc" },
  });

  return [...userPointsWithExpiry, ...userPointsNoExpiry];
};

// create transaction with all data in one request (except payment proof)
export const createTransaction = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const {
      eventId,
      quantity,
      use_points,
      points_amount,
      use_coupon,
      use_voucher,
    } = req.body;
    const userId = (req as any).user.id;

    // validate input
    if (!eventId || !quantity || quantity <= 0) {
      res.status(400).json({ message: "Event id and quantity are required" });
      return;
    }

    // get event details
    const event = await prisma.event.findUnique({
      where: { id: parseInt(eventId) },
      include: {
        vouchers: true,
      },
    });

    if (!event) {
      res.status(404).json({ message: "Event not found" });
      return;
    }

    // check stock availability
    const existingTickets = await prisma.transaction.aggregate({
      where: {
        eventId: parseInt(eventId),
        transactionStatusId: { in: [2, 3] }, // WaitingForAdminConfirmation and Done
      },
      _sum: {
        quantity: true,
      },
    });

    const soldTickets = existingTickets._sum.quantity || 0;
    const availableTickets = event.quota - soldTickets;

    if (quantity > availableTickets) {
      res.status(400).json({
        message: `Stock is not enough. There are ${availableTickets} tickets available`,
      });
      return;
    }

    // calculate base price and discount
    const basePrice = event.price * quantity;
    let totalDiscount = 0;

    // validate and calculate points discount
    if (use_points && points_amount > 0) {
      const userPointsTotal = await prisma.point.aggregate({
        where: getValidPointsCondition(userId),
        _sum: { point: true },
      });

      const availablePoints = userPointsTotal._sum.point || 0;
      if (points_amount > availablePoints) {
        res.status(400).json({ message: "Not enough points" });
        return;
      }

      totalDiscount += Math.min(points_amount, basePrice);
    }

    // validate and calculate coupon discount
    let userCoupon = null;
    if (use_coupon) {
      userCoupon = await prisma.coupon.findFirst({
        where: getValidCouponCondition(userId),
      });

      if (!userCoupon) {
        res.status(400).json({ message: "Coupon not available or expired" });
        return;
      }

      totalDiscount += userCoupon.nominal;
    }

    // validate and calculate voucher discount
    if (use_voucher && event.vouchers) {
      if (!isVoucherValid(event.vouchers)) {
        res.status(400).json({ message: "Voucher not available or expired" });
        return;
      }

      totalDiscount += event.vouchers.nominal;
    }

    // ensure total discount doesn't exceed base price
    totalDiscount = Math.min(totalDiscount, basePrice);
    const finalPrice = basePrice - totalDiscount;

    // start database transaction to handle all operations atomically
    const result = await prisma.$transaction(async (prisma) => {
      // create transaction record (status: 1 = WaitingForPayment)
      const transaction = await prisma.transaction.create({
        data: {
          userId,
          eventId: parseInt(eventId),
          quantity,
          totalDiscount,
          totalPrice: finalPrice,
          transactionStatusId: 1,
          couponId: use_coupon && userCoupon ? userCoupon.id : null,
          voucherId: use_voucher && event.vouchers ? event.vouchers.id : null,
        },
        include: {
          event: {
            select: {
              name: true,
              price: true,
              quota: true,
            },
          },
        },
      });

      // reduce event quota
      await prisma.event.update({
        where: { id: parseInt(eventId) },
        data: { quota: { decrement: quantity } },
      });

      // deduct points if used
      if (use_points && points_amount > 0) {
        const userPoints = await getOrderedUserPoints(userId);

        let remainingPointsToDeduct = points_amount;
        for (const pointRecord of userPoints) {
          if (remainingPointsToDeduct <= 0) break;

          if (pointRecord.point <= remainingPointsToDeduct) {
            // delete this point record completely
            await prisma.point.update({
              where: { id: pointRecord.id },
              data: { deletedAt: new Date() },
            });
            remainingPointsToDeduct -= pointRecord.point;
          } else {
            // reduce points in this record
            await prisma.point.update({
              where: { id: pointRecord.id },
              data: { point: pointRecord.point - remainingPointsToDeduct },
            });
            remainingPointsToDeduct = 0;
          }
        }
      }

      // mark coupon as used
      if (use_coupon && userCoupon) {
        await prisma.coupon.update({
          where: { id: userCoupon.id },
          data: { deletedAt: new Date() },
        });
      }

      // reduce voucher quota
      if (use_voucher && event.vouchers) {
        await prisma.voucher.update({
          where: { id: event.vouchers.id },
          data: { quota: { decrement: 1 } },
        });
      }

      return transaction;
    });

    res.status(201).json({
      message:
        "Transaction created successfully. Please upload payment proof to complete the transaction.",
      data: {
        transactionId: result.id,
        event: result.event,
        quantity: result.quantity,
        basePrice,
        totalDiscount,
        finalPrice,
        discountsApplied: {
          points: use_points ? points_amount : 0,
          coupon: use_coupon,
          voucher: use_voucher,
        },
        nextStep: `Upload payment proof to PATCH /transactions/${result.id}/payment-proof`,
      },
    });
  } catch (error) {
    next(error);
  }
};

// upload payment proof
export const uploadPaymentProof = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    // check if file was uploaded
    if (!req.file) {
      res.status(400).json({ message: "Payment proof file is required" });
      return;
    }

    // check if transaction exists and belongs to user (should be in WaitingForPayment status)
    const transaction = await prisma.transaction.findFirst({
      where: {
        id: parseInt(id),
        userId,
        transactionStatusId: 1, // WaitingForPayment status
      },
    });

    if (!transaction) {
      res.status(404).json({
        message: "Transaction not found",
      });
      return;
    }

    // relative path for database storage
    const relativePath = `\\uploads\\payment-proofs\\${req.file.filename}`;

    // update transaction with payment proof path and change status to WaitingForAdminConfirmation
    const updatedTransaction = await prisma.transaction.update({
      where: { id: parseInt(id) },
      data: {
        paymentProof: relativePath,
        transactionStatusId: 2,
      },
    });

    res.status(200).json({
      message:
        "Payment proof uploaded successfully. Waiting for admin confirmation.",
    });
  } catch (error) {
    next(error);
  }
};

// get user's transactions list
export const getUserTransactions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user.id;

    // get all transactions
    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
      },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            price: true,
            location: true,
            startDate: true,
            endDate: true,
          },
        },
        transactionStatus: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.status(200).json({
      message: "User transactions retrieved successfully",
      data: transactions,
    });
  } catch (error) {
    next(error);
  }
};

export const getEOTransactions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const eoId = req.user?.id;

    // Get events created by this EO
    const events = await prisma.event.findMany({
      where: { userId: eoId },
      select: { id: true },
    });
    const eventIds = events.map((event) => event.id);

    const transactions = await prisma.transaction.findMany({
      where: { eventId: { in: eventIds } },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        event: true,
        transactionStatus: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(transactions);
  } catch (error) {
    next(error);
  }
};

export const getPaymentProof = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const transaction = await prisma.transaction.findUnique({
      where: { id: parseInt(id) },
      select: { paymentProof: true },
    });

    if (!transaction) {
      throw res.status(404).json({ error: "Transaction not found" });
    }

    res.json({ paymentProof: transaction.paymentProof });
  } catch (error) {
    next(error);
  }
};

export const acceptTransaction = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const eoId = req.user?.id;

    // Get transaction with user and event data
    const transaction = await prisma.transaction.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: true,
        event: true,
      },
    });

    if (!transaction) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }

    // Check if event belongs to this EO
    const event = await prisma.event.findFirst({
      where: { id: transaction.eventId, userId: eoId },
    });

    if (!event) {
      res.status(403).json({ error: "Unauthorized for this event" });
      return;
    }

    // Update transaction status
    const updatedTransaction = await prisma.transaction.update({
      where: { id: parseInt(id) },
      data: { transactionStatusId: 3 }, // Accepted
    });

    // Send notification email
    await sendTransactionEmail(
      transaction.user.email,
      transaction.event.name,
      "accepted"
    );

    res.json({
      message: "Transaction accepted",
      transaction: updatedTransaction,
    });
  } catch (error) {
    next(error);
  }
};

export const rejectTransaction = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const eoId = req.user?.id;

    // Get transaction with user and event data
    const transaction = await prisma.transaction.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: true,
        event: true,
        coupon: true,
        voucher: true,
      },
    });

    if (!transaction) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }

    // Check if event belongs to this EO
    const event = await prisma.event.findFirst({
      where: { id: transaction.eventId, userId: eoId },
    });

    if (!event) {
      res.status(403).json({ error: "Unauthorized for this event" });
      return;
    }

    // Start transaction to handle all operations atomically
    await prisma.$transaction(async (prisma) => {
      // Update transaction status
      await prisma.transaction.update({
        where: { id: parseInt(id) },
        data: { transactionStatusId: 4 }, // Rejected
      });

      // Restore event quota
      await prisma.event.update({
        where: { id: transaction.eventId },
        data: { quota: { increment: transaction.quantity } },
      });

      // Restore points if used
      if (transaction.totalDiscount > 0) {
        await prisma.point.create({
          data: {
            userId: transaction.userId,
            point: transaction.totalDiscount,
            expiredAt: new Date(new Date().setMonth(new Date().getMonth() + 3)),
          },
        });
      }

      // Restore coupon if used
      if (transaction.coupon) {
        await prisma.coupon.update({
          where: { id: transaction.coupon.id },
          data: { deletedAt: null },
        });
      }

      // Restore voucher quota if used
      if (transaction.voucher) {
        await prisma.voucher.update({
          where: { id: transaction.voucher.id },
          data: { quota: { increment: 1 } },
        });
      }
    });

    // Send notification email
    await sendTransactionEmail(
      transaction.user.email,
      transaction.event.name,
      "rejected"
    );

    res.json({ message: "Transaction rejected and resources restored" });
  } catch (error) {
    next(error);
  }
};
