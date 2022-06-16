/*
  Warnings:

  - You are about to drop the column `created_at` on the `Link` table. All the data in the column will be lost.
  - You are about to drop the column `link_dest` on the `Link` table. All the data in the column will be lost.
  - You are about to drop the column `link_text` on the `Link` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `Link` table. All the data in the column will be lost.
  - You are about to drop the column `is_admin` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `password_digest` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[linkText]` on the table `Link` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `linkDest` to the `Link` table without a default value. This is not possible if the table is not empty.
  - Added the required column `linkText` to the `Link` table without a default value. This is not possible if the table is not empty.
  - Added the required column `isAdmin` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `passwordDigest` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Link_link_text_key";

-- AlterTable
ALTER TABLE "Link" DROP COLUMN "created_at",
DROP COLUMN "link_dest",
DROP COLUMN "link_text",
DROP COLUMN "updated_at",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "linkDest" TEXT NOT NULL,
ADD COLUMN     "linkText" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "is_admin",
DROP COLUMN "password_digest",
ADD COLUMN     "isAdmin" BOOLEAN NOT NULL,
ADD COLUMN     "passwordDigest" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Link_linkText_key" ON "Link"("linkText");
