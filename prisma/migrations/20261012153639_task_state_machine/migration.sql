-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('BUILDING', 'REVIEWING', 'PASSED', 'FAILED_MAX_LOOPS', 'FAILED_BUDGET');

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "specId" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'BUILDING',
    "loop" INTEGER NOT NULL DEFAULT 0,
    "totalCostUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "lastCodeId" TEXT,
    "lastReviewId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_specId_fkey" FOREIGN KEY ("specId") REFERENCES "Spec"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_lastCodeId_fkey" FOREIGN KEY ("lastCodeId") REFERENCES "Code"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_lastReviewId_fkey" FOREIGN KEY ("lastReviewId") REFERENCES "Review"("id") ON DELETE SET NULL ON UPDATE CASCADE;
