-- AlterTable
ALTER TABLE "Product" ADD COLUMN "image" BLOB;
ALTER TABLE "Product" ADD COLUMN "imageMime" TEXT;
ALTER TABLE "Product" ADD COLUMN "hasImage" BOOLEAN NOT NULL DEFAULT false;
