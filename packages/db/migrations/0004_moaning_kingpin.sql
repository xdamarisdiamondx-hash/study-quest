DROP INDEX "ai_artifacts_cache_idx";--> statement-breakpoint
CREATE INDEX "ai_artifacts_cache_idx" ON "ai_artifacts" USING btree ("kind","source_id","input_hash","prompt_version","provider","model");