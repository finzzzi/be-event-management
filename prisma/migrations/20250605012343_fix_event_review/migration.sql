/*
  Warnings:

  - A unique constraint covering the columns `[transactionId]` on the table `event_reviews` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `transactionId` to the `event_reviews` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "event_reviews" ADD COLUMN     "transactionId" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "event_reviews_transactionId_key" ON "event_reviews"("transactionId");

-- AddForeignKey
ALTER TABLE "event_reviews" ADD CONSTRAINT "event_reviews_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
