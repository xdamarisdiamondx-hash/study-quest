ALTER TABLE "quest_steps" ADD COLUMN "target" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "quest_steps" ADD COLUMN "progress" integer DEFAULT 0 NOT NULL;