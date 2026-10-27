/*
  Warnings:

  - The values [JUDGE] on the enum `UserRole` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `judgeId` on the `CompetitionScore` table. All the data in the column will be lost.
  - You are about to drop the `JudgeAssignment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ScoringFormatCriterion` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ScoringFormatJudge` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[registrationId,criterionId,judgeLabel]` on the table `CompetitionScore` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[eventId,categoryId,name]` on the table `ScoringCriterion` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `judgeLabel` to the `CompetitionScore` table without a default value. This is not possible if the table is not empty.
  - Made the column `configuration` on table `ScoringFormat` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('ADMIN', 'TEAM', 'ORGANIZER', 'PARTICIPANT');
ALTER TABLE "public"."User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "public"."UserRole_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'PARTICIPANT';
COMMIT;

-- DropForeignKey
ALTER TABLE "CompetitionScore" DROP CONSTRAINT "CompetitionScore_judgeId_fkey";

-- DropForeignKey
ALTER TABLE "JudgeAssignment" DROP CONSTRAINT "JudgeAssignment_eventId_fkey";

-- DropForeignKey
ALTER TABLE "JudgeAssignment" DROP CONSTRAINT "JudgeAssignment_judgeId_fkey";

-- DropForeignKey
ALTER TABLE "ScoringFormatCriterion" DROP CONSTRAINT "ScoringFormatCriterion_formatId_fkey";

-- DropForeignKey
ALTER TABLE "ScoringFormatJudge" DROP CONSTRAINT "ScoringFormatJudge_formatId_fkey";

-- DropForeignKey
ALTER TABLE "ScoringFormatJudge" DROP CONSTRAINT "ScoringFormatJudge_judgeId_fkey";

-- DropIndex
DROP INDEX "CompetitionScore_registrationId_criterionId_judgeId_key";

-- DropIndex
DROP INDEX "ScoringCriterion_eventId_name_key";

-- AlterTable
ALTER TABLE "CompetitionScore" DROP COLUMN "judgeId",
ADD COLUMN     "judgeLabel" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "scoringConfiguration" JSONB;

-- AlterTable
ALTER TABLE "EventRegistration" ADD COLUMN     "scoringPenalties" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "scoringTime" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "ScoringCriterion" ADD COLUMN     "categoryId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "categoryName" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "ScoringFormat" ALTER COLUMN "configuration" SET NOT NULL;

-- DropTable
DROP TABLE "JudgeAssignment";

-- DropTable
DROP TABLE "ScoringFormatCriterion";

-- DropTable
DROP TABLE "ScoringFormatJudge";

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionScore_registrationId_criterionId_judgeLabel_key" ON "CompetitionScore"("registrationId", "criterionId", "judgeLabel");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringCriterion_eventId_categoryId_name_key" ON "ScoringCriterion"("eventId", "categoryId", "name");
