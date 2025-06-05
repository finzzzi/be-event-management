import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../generated/prisma";

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
      point: { gt: 0 }, // Only fetch positive points
      expiredAt: { gt: new Date() },
      deletedAt: null,
    },
    orderBy: { expiredAt: "asc" },
  });

  const userPointsNoExpiry = await prisma.point.findMany({
    where: {
      userId,
      point: { gt: 0 }, // Only fetch positive points
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
          usedCouponId: use_coupon && userCoupon ? userCoupon.id : null,
          usedVoucherId:
            use_voucher && event.vouchers ? event.vouchers.id : null,
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
        const userAvailablePositivePoints = await getOrderedUserPoints(userId);

        let remainingPointsToDeduct = points_amount;
        for (const pointRecord of userAvailablePositivePoints) {
          if (remainingPointsToDeduct <= 0) break;

          // calculate how much of this specific pointRecord has already been used
          const sumOfPreviousUsages = await prisma.point.aggregate({
            where: {
              originalPointId: pointRecord.id, // link to the specific source record
              point: { lt: 0 },
              deletedAt: null,
            },
            _sum: {
              point: true,
            },
          });
          // access _sum.point, defaulting to 0 if null/undefined
          const totalUsedFromThisRecord = Math.abs(
            sumOfPreviousUsages._sum?.point || 0
          );
          const currentBalanceOfThisRecord =
            pointRecord.point - totalUsedFromThisRecord;

          if (currentBalanceOfThisRecord <= 0) {
            continue; // this source point record is already fully depleted
          }

          const pointsToDeductFromThisRecord = Math.min(
            currentBalanceOfThisRecord,
            remainingPointsToDeduct
          );

          if (pointsToDeductFromThisRecord > 0) {
            await prisma.point.create({
              data: {
                userId,
                point: -pointsToDeductFromThisRecord,
                transactionId: transaction.id,
                originalPointId: pointRecord.id,
                expiredAt: null,
              },
            });
            remainingPointsToDeduct -= pointsToDeductFromThisRecord;
          }
        }

        if (remainingPointsToDeduct > 0) {
          throw new Error(
            `Failed to deduct the full points_amount. Remaining points to deduct: ${remainingPointsToDeduct}.`
          );
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

export const createReview = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { eventId, rating, comment, transactionId } = req.body;
    const userId = (req as any).user.id;

    if (!transactionId) {
      res.status(400).json({ message: "Transaction ID is required" });
      return;
    }

    // check if event exists
    const event = await prisma.event.findUnique({
      where: { id: parseInt(eventId) },
    });

    if (!event) {
      res.status(404).json({ message: "Event not found" });
      return;
    }

    // check if the event has passed
    if (event.endDate >= new Date()) {
      res
        .status(400)
        .json({ message: "You can only review events that have passed" });
      return;
    }

    // fetch and validate the specific transaction
    const transactionToReview = await prisma.transaction.findUnique({
      where: { id: parseInt(transactionId) },
    });

    if (!transactionToReview) {
      res.status(404).json({ message: "Transaction not found" });
      return;
    }

    if (transactionToReview.userId !== userId) {
      res
        .status(403)
        .json({ message: "This transaction does not belong to you" });
      return;
    }

    if (transactionToReview.eventId !== parseInt(eventId)) {
      res.status(400).json({
        message: "This transaction does not match the provided event",
      });
      return;
    }

    if (transactionToReview.transactionStatusId !== 3) {
      res
        .status(403)
        .json({ message: "You can only review completed transactions" });
      return;
    }

    // check if this specific transaction has already been reviewed
    const existingReview = await prisma.eventReview.findUnique({
      where: { transactionId: parseInt(transactionId) },
    });

    if (existingReview) {
      res
        .status(400)
        .json({ message: "This transaction has already been reviewed" });
      return;
    }

    // create review
    const review = await prisma.eventReview.create({
      data: {
        eventId: parseInt(eventId),
        userId,
        rating,
        comment,
        transactionId: parseInt(transactionId),
      },
    });

    res
      .status(201)
      .json({ message: "Review created successfully", data: review });
  } catch (error) {
    next(error);
  }
};

export const getReviewsByTransactionId = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const transactionId = req.query.transactionId as string;
    const reviews = await prisma.eventReview.findUnique({
      where: { transactionId: parseInt(transactionId) },
    });

    res
      .status(200)
      .json({ message: "Reviews retrieved successfully", data: reviews });
  } catch (error) {
    next(error);
  }
};
