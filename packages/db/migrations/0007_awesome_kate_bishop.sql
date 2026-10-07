ALTER TABLE "task_recurrences" ADD COLUMN "anchor_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "recurrence_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_recurrence_id_task_recurrences_id_fk" FOREIGN KEY ("recurrence_id") REFERENCES "public"."task_recurrences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_recurrence_idx" ON "tasks" USING btree ("recurrence_id");