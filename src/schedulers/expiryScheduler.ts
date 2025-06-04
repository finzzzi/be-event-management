import cron from "node-cron";
import { PrismaClient } from "../generated/prisma"; // Sesuaikan path jika direktori generated Anda berbeda

const prisma = new PrismaClient();

// --- SCHEDULER 1: EXPIRE POINTS ---
// run every day at 00:05 (5 minutes after midnight)
cron.schedule("5 0 * * *", async () => {
  const jobName = "ExpirePoints";
  const now = new Date();
  console.log(`[Scheduler][${jobName}] Running job at ${now.toISOString()}`);

  try {
    const result = await prisma.point.updateMany({
      where: {
        expiredAt: {
          lte: now,
          not: null,
        },
        deletedAt: null,
        point: { gt: 0 },
      },
      data: {
        deletedAt: now,
      },
    });

    if (result.count > 0) {
      console.log(
        `[Scheduler][${jobName}] Successfully marked ${result.count} point(s) as expired.`
      );
    } else {
      console.log(
        `[Scheduler][${jobName}] No points found to expire at this time.`
      );
    }
  } catch (error) {
    console.error(`[Scheduler][${jobName}] Error expiring points:`, error);
  }
});

// --- SCHEDULER 2: EXPIRE COUPONS ---
// run every day at 00:10 (10 minutes after midnight)
cron.schedule("10 0 * * *", async () => {
  const jobName = "ExpireCoupons";
  const now = new Date();
  console.log(`[Scheduler][${jobName}] Running job at ${now.toISOString()}`);

  try {
    const result = await prisma.coupon.updateMany({
      where: {
        expiredAt: {
          lte: now,
        },
        deletedAt: null,
      },
      data: {
        deletedAt: now,
      },
    });

    if (result.count > 0) {
      console.log(
        `[Scheduler][${jobName}] Successfully marked ${result.count} coupon(s) as expired.`
      );
    } else {
      console.log(
        `[Scheduler][${jobName}] No coupons found to expire at this time.`
      );
    }
  } catch (error) {
    console.error(`[Scheduler][${jobName}] Error expiring coupons:`, error);
  }
});

console.log(
  "[Scheduler] Expiry schedulers (points & coupons) have been initialized."
);
