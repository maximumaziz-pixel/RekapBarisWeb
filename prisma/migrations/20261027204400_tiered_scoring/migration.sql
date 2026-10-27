ALTER TABLE "EventRegistration"
ADD COLUMN "scoringTierId" TEXT;

ALTER TABLE "ScoringCriterion"
ADD COLUMN "tierId" TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS "ScoringCriterion_eventId_categoryId_name_key";

CREATE UNIQUE INDEX "ScoringCriterion_eventId_tierId_categoryId_name_key"
ON "ScoringCriterion"("eventId", "tierId", "categoryId", "name");

DROP INDEX IF EXISTS "ScoringCriterion_eventId_active_idx";

CREATE INDEX "ScoringCriterion_eventId_tierId_active_idx"
ON "ScoringCriterion"("eventId", "tierId", "active");
