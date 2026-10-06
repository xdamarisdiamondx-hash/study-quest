ALTER TABLE "flashcard_reviews" ADD COLUMN "batch_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "flashcards" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "flashcard_reviews_batch_card_idx" ON "flashcard_reviews" USING btree ("batch_id","flashcard_id");