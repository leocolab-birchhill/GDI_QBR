-- AlterTable
ALTER TABLE "User" ADD COLUMN "regions" TEXT[] DEFAULT ARRAY[]::TEXT[];
