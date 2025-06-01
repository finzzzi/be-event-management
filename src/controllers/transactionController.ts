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

// initiate transaction (calculate total price)
export const initiateTransaction = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { eventId, quantity } = req.body;
    const userId = (req as any).user.id;

    // validate input
    if (!eventId || !quantity || quantity <= 0) {
      res.status(400).json({ message: "Event id and quantity are required" });
      return;
    }

    // get event details
    const event = await prisma.event.findUnique({
      where: { id: parseInt(eventId) },
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

    // calculate total price
    const totalPrice = event.price * quantity;

    // create temporary transaction (status: 1 = WaitingForPayment)
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        eventId: parseInt(eventId),
        quantity,
        totalDiscount: 0,
        totalPrice,
        transactionStatusId: 1, // WaitingForPayment status
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

    res.status(201).json({
      message: "Transaction initiated successfully",
      data: {
        id: transaction.id,
        event: transaction.event,
        quantity: transaction.quantity,
        basePrice: event.price,
        totalPrice: transaction.totalPrice,
        totalDiscount: transaction.totalDiscount,
      },
    });
  } catch (error) {
    next(error);
  }
};

// get transaction details with user discounts
export const getTransactionDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    // get transaction details
    const transaction = await prisma.transaction.findFirst({
      where: {
        id: parseInt(id),
        userId,
      },
      include: {
        event: {
          select: {
            name: true,
            price: true,
            quota: true,
            vouchers: true,
          },
        },
        transactionStatus: true,
      },
    });

    if (!transaction) {
      res.status(404).json({ message: "Transaction not found" });
      return;
    }

    // get user's available points
    const userPoints = await prisma.point.aggregate({
      where: getValidPointsCondition(userId),
      _sum: {
        point: true,
      },
    });

    // get user's available coupon
    const userCoupon = await prisma.coupon.findFirst({
      where: getValidCouponCondition(userId),
    });

    // get event voucher (if available and still valid)
    let eventVoucher = null;
    if (
      transaction.event.vouchers &&
      isVoucherValid(transaction.event.vouchers)
    ) {
      eventVoucher = transaction.event.vouchers;
    }

    res.status(200).json({
      success: true,
      data: {
        transaction: {
          id: transaction.id,
          quantity: transaction.quantity,
          totalPrice: transaction.totalPrice,
          totalDiscount: transaction.totalDiscount,
          status: transaction.transactionStatus.name,
        },
        event: transaction.event,
        availableDiscounts: {
          points: {
            available: userPoints._sum.point || 0,
            maxUsage: Math.min(
              userPoints._sum.point || 0,
              transaction.totalPrice
            ),
          },
          coupon: userCoupon
            ? {
                id: userCoupon.id,
                nominal: userCoupon.nominal,
                expiredAt: userCoupon.expiredAt,
              }
            : null,
          voucher: eventVoucher
            ? {
                id: eventVoucher.id,
                name: eventVoucher.name,
                nominal: eventVoucher.nominal,
                quota: eventVoucher.quota,
              }
            : null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// apply discounts and recalculate price
export const applyDiscounts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { use_points, points_amount, use_coupon, use_voucher } = req.body;
    const userId = (req as any).user.id;

    // get transaction
    const transaction = await prisma.transaction.findFirst({
      where: {
        id: parseInt(id),
        userId,
        transactionStatusId: 1, // WaitingForPayment status
      },
      include: {
        event: {
          include: {
            vouchers: true,
          },
        },
      },
    });

    if (!transaction) {
      res.status(404).json({ message: "Transaction not found" });
      return;
    }

    let totalDiscount = 0;
    const basePrice = transaction.event.price * transaction.quantity;

    // apply points discount
    if (use_points && points_amount > 0) {
      // validate available points
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

    // apply coupon discount
    if (use_coupon) {
      const userCoupon = await prisma.coupon.findFirst({
        where: getValidCouponCondition(userId),
      });

      if (!userCoupon) {
        res.status(400).json({ message: "Coupon not available or expired" });
        return;
      }

      totalDiscount += userCoupon.nominal;
    }

    // apply voucher discount
    if (use_voucher && transaction.event.vouchers) {
      const voucher = transaction.event.vouchers;

      if (isVoucherValid(voucher)) {
        totalDiscount += voucher.nominal;
      } else {
        res.status(400).json({ message: "Voucher not available or expired" });
        return;
      }
    }

    // ensure total discount doesn't exceed base price
    totalDiscount = Math.min(totalDiscount, basePrice);
    const finalPrice = basePrice - totalDiscount;

    // update transaction
    const updatedTransaction = await prisma.transaction.update({
      where: { id: parseInt(id) },
      data: {
        totalDiscount,
        totalPrice: finalPrice,
      },
      include: {
        event: true,
      },
    });

    res.status(200).json({
      message: "Discount applied successfully",
      data: {
        transactionId: updatedTransaction.id,
        basePrice,
        totalDiscount,
        finalPrice,
        discountsApplied: {
          points: use_points ? points_amount : 0,
          coupon: use_coupon,
          voucher: use_voucher,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// confirm transaction and redirect to payment proof upload
export const confirmTransaction = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { use_points, points_amount, use_coupon, use_voucher } = req.body;
    const userId = (req as any).user.id;

    // get transaction
    const transaction = await prisma.transaction.findFirst({
      where: {
        id: parseInt(id),
        userId,
        transactionStatusId: 1, // WaitingForPayment status
      },
      include: {
        event: {
          include: {
            vouchers: true,
          },
        },
      },
    });

    if (!transaction) {
      res.status(404).json({
        message: "Transaction not found",
      });
      return;
    }

    // start database transaction
    const result = await prisma.$transaction(async (prisma) => {
      // deduct points if used
      if (use_points && points_amount > 0) {
        // get user points ordered by expiration date (closest to expiry first)
        // points with expiredAt null will be used last
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
      if (use_coupon) {
        await prisma.coupon.updateMany({
          where: getValidCouponCondition(userId),
          data: { deletedAt: new Date() },
        });
      }

      // reduce voucher quota
      if (use_voucher && transaction.event.vouchers) {
        await prisma.voucher.update({
          where: { id: transaction.event.vouchers.id },
          data: { quota: { decrement: 1 } },
        });
      }

      return transaction;
    });

    res.status(200).json({
      message: "Transaction created successfully. Waiting for payment proof.",
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
