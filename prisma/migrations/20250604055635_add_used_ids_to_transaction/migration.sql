-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "usedCouponId" INTEGER,
ADD COLUMN     "usedVoucherId" INTEGER;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_usedCouponId_fkey" FOREIGN KEY ("usedCouponId") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_usedVoucherId_fkey" FOREIGN KEY ("usedVoucherId") REFERENCES "vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
