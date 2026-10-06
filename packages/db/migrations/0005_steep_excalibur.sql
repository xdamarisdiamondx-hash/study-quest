ALTER TABLE "quiz_attempts" ADD COLUMN "answers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "retry_of" uuid;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "focus_tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_retry_of_quizzes_id_fk" FOREIGN KEY ("retry_of") REFERENCES "public"."quizzes"("id") ON DELETE set null ON UPDATE no action;