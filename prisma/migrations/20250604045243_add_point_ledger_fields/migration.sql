-- AlterTable
ALTER TABLE "points" ADD COLUMN     "originalPointExpiredAt" TIMESTAMP(3),
ADD COLUMN     "transactionId" INTEGER;

-- AddForeignKey
ALTER TABLE "points" ADD CONSTRAINT "points_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
