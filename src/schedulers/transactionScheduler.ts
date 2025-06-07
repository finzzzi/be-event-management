import cron from "node-cron";
import { PrismaClient, Transaction, Prisma } from "../generated/prisma";

const prisma = new PrismaClient();

const TWO_HOURS_IN_MS = 2 * 60 * 60 * 1000;
const THREE_DAYS_IN_MS = 3 * 24 * 60 * 60 * 1000;
// uncomment this if you want to run the scheduler every 5 minutes (development)
// const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;

interface TransactionWithDetails extends Transaction {
  event?: {
    vouchers?: { id: number } | null;
  } | null;
}

async function rollbackResources(
  transaction: TransactionWithDetails,
  prismaClient: Prisma.TransactionClient
) {
  console.log(`[Rollback] Starting for transaction ${transaction.id}`);

  await prismaClient.event.update({
    where: { id: transaction.eventId },
    data: { quota: { increment: transaction.quantity } },
  });
  console.log(
    `[Rollback] Event quota for event ${transaction.eventId} incremented by ${transaction.quantity}.`
  );

  const usedPointsRecords = await prismaClient.point.findMany({
    where: {
      transactionId: transaction.id,
      point: { lt: 0 },
      deletedAt: null,
    },
  });

  if (usedPointsRecords.length > 0) {
    console.log(
      `[Rollback] Found ${usedPointsRecords.length} point usage records to revert for transaction ${transaction.id}.`
    );
    for (const usedPoint of usedPointsRecords) {
      await prismaClient.point.update({
        where: { id: usedPoint.id },
        data: { deletedAt: new Date() },
      });
      console.log(
        `[Rollback] Point usage record ID ${usedPoint.id} (value: ${usedPoint.point}) marked as deleted. Points effectively refunded.`
      );
    }
  } else {
    console.log(
      `[Rollback] No active point usage records found to revert for transaction ${transaction.id}.`
    );
  }

  if (transaction.usedCouponId) {
    await prismaClient.coupon.update({
      where: { id: transaction.usedCouponId },
      data: { deletedAt: null },
    });
    console.log(
      `[Rollback] Coupon ${transaction.usedCouponId} marked as not used.`
    );
  } else {
    console.log(
      `[Rollback] No usedCouponId found for transaction ${transaction.id}. No coupon rollback performed.`
    );
  }

  if (transaction.usedVoucherId) {
    await prismaClient.voucher.update({
      where: { id: transaction.usedVoucherId },
      data: { quota: { increment: 1 } },
    });
    console.log(
      `[Rollback] Voucher ${transaction.usedVoucherId} quota incremented because it was used in transaction ${transaction.id}.`
    );
  } else {
    console.log(
      `[Rollback] No usedVoucherId found for transaction ${transaction.id}. No voucher quota rollback performed.`
    );
  }
  console.log(`[Rollback] Finished for transaction ${transaction.id}`);
}

cron.schedule("*/5 * * * *", async () => {
  const jobName = "ExpireUnpaidTransactions";
  console.log(`[Scheduler][${jobName}] Running job every 5 minutes`);
  const twoHoursAgo = new Date(Date.now() - TWO_HOURS_IN_MS);
  //   const fiveMinutesAgo = new Date(Date.now() - FIVE_MINUTES_IN_MS);

  const unpaidTransactions = await prisma.transaction.findMany({
    where: {
      transactionStatusId: 1,
      paymentProof: null,
      createdAt: { lt: twoHoursAgo },
    },
    include: {
      event: { select: { vouchers: { select: { id: true } } } },
    },
  });

  if (unpaidTransactions.length > 0) {
    console.log(
      `[Scheduler][${jobName}] Found ${unpaidTransactions.length} unpaid transaction(s) to potentially expire.`
    );
  } else {
    console.log(
      `[Scheduler][${jobName}] No unpaid transactions older than 2 hours found.`
    );
    return;
  }

  for (const transaction of unpaidTransactions) {
    try {
      await prisma.$transaction(async (tx) => {
        console.log(
          `[Scheduler][${jobName}] Processing transaction ${transaction.id} for expiration...`
        );
        await rollbackResources(transaction, tx);
        await tx.transaction.update({
          where: { id: transaction.id },
          data: { transactionStatusId: 5 },
        });
        console.log(
          `[Scheduler][${jobName}] Transaction ${transaction.id} successfully expired.`
        );
      });
    } catch (error) {
      console.error(
        `[Scheduler][${jobName}] Error expiring transaction ${transaction.id}:`,
        error
      );
    }
  }
});

cron.schedule("*/5 * * * *", async () => {
  const jobName = "CancelUnconfirmedTransactions";
  console.log(`[Scheduler][${jobName}] Running job every 5 minutes`);
  const threeDaysAgo = new Date(Date.now() - THREE_DAYS_IN_MS);
  //   const fiveMinutesAgo = new Date(Date.now() - FIVE_MINUTES_IN_MS);

  const unconfirmedTransactions = await prisma.transaction.findMany({
    where: {
      transactionStatusId: 2,
      updatedAt: { lt: threeDaysAgo },
    },
    include: {
      event: { select: { vouchers: { select: { id: true } } } },
    },
  });

  if (unconfirmedTransactions.length > 0) {
    console.log(
      `[Scheduler][${jobName}] Found ${unconfirmedTransactions.length} unconfirmed transaction(s) to potentially cancel.`
    );
  } else {
    console.log(
      `[Scheduler][${jobName}] No unconfirmed transactions older than 3 days found.`
    );
    return;
  }

  for (const transaction of unconfirmedTransactions) {
    try {
      await prisma.$transaction(async (tx) => {
        console.log(
          `[Scheduler][${jobName}] Processing transaction ${transaction.id} for cancellation...`
        );
        await rollbackResources(transaction, tx);

        if (transaction.totalPrice > 0) {
          await tx.point.create({
            data: {
              userId: transaction.userId,
              point: transaction.totalPrice,
              expiredAt: null,
            },
          });
          console.log(
            `[Scheduler][${jobName}] Refunded ${transaction.totalPrice} as points to user ${transaction.userId} for transaction ${transaction.id}.`
          );
        }

        await tx.transaction.update({
          where: { id: transaction.id },
          data: { transactionStatusId: 6 },
        });
        console.log(
          `[Scheduler][${jobName}] Transaction ${transaction.id} successfully canceled.`
        );
      });
    } catch (error) {
      console.error(
        `[Scheduler][${jobName}] Error canceling transaction ${transaction.id}:`,
        error
      );
    }
  }
});

console.log("[Scheduler] Transaction schedulers have been initialized.");
