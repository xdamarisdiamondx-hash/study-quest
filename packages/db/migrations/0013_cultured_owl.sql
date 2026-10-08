CREATE TABLE "recent_searches" (
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"query" text NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recent_searches_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
ALTER TABLE "search_index" ADD CONSTRAINT "search_index_entity_type_entity_id_pk" PRIMARY KEY("entity_type","entity_id");--> statement-breakpoint
ALTER TABLE "search_index" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "recent_searches" ADD CONSTRAINT "recent_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recent_searches_ran_idx" ON "recent_searches" USING btree ("user_id","ran_at");--> statement-breakpoint
CREATE INDEX "search_index_user_idx" ON "search_index" USING btree ("user_id");--> statement-breakpoint
-- P19: search_index population (ADR-013). The column is added nullable so the
-- ALTERs run on a populated table, backfilled from the source tables below,
-- then sealed NOT NULL — the same order a fresh database passes through.
DELETE FROM "search_index" WHERE "user_id" IS NULL;--> statement-breakpoint
INSERT INTO "search_index" ("entity_type", "entity_id", "user_id", "title", "body", "subject_id", "topic_id")
SELECT 'subject', s."id", s."user_id", s."name", '', s."id", NULL FROM "subjects" s WHERE s."archived_at" IS NULL
ON CONFLICT (entity_type, entity_id) DO NOTHING;--> statement-breakpoint
INSERT INTO "search_index" ("entity_type", "entity_id", "user_id", "title", "body", "subject_id", "topic_id")
SELECT 'topic', t."id", s."user_id", t."name", coalesce(t."description", ''), t."subject_id", t."id"
FROM "topics" t JOIN "subjects" s ON s."id" = t."subject_id"
ON CONFLICT (entity_type, entity_id) DO NOTHING;--> statement-breakpoint
INSERT INTO "search_index" ("entity_type", "entity_id", "user_id", "title", "body", "subject_id", "topic_id")
SELECT 'note', n."id", n."user_id", coalesce(nullif(n."title", ''), left(n."body_md", 60)), left(n."body_md", 4000), tp."subject_id", n."topic_id"
FROM "notes" n LEFT JOIN "topics" tp ON tp."id" = n."topic_id"
ON CONFLICT (entity_type, entity_id) DO NOTHING;--> statement-breakpoint
INSERT INTO "search_index" ("entity_type", "entity_id", "user_id", "title", "body", "subject_id", "topic_id")
SELECT 'task', t."id", t."user_id", t."title", coalesce(t."notes", ''), t."subject_id", t."topic_id"
FROM "tasks" t
ON CONFLICT (entity_type, entity_id) DO NOTHING;--> statement-breakpoint
INSERT INTO "search_index" ("entity_type", "entity_id", "user_id", "title", "body", "subject_id", "topic_id")
SELECT 'quiz', q."id", q."user_id", q."title", left(coalesce(sub."prompts", ''), 4000), tp."subject_id", q."topic_id"
FROM "quizzes" q
LEFT JOIN "topics" tp ON tp."id" = q."topic_id"
LEFT JOIN LATERAL (SELECT string_agg("prompt", ' ') AS "prompts" FROM "quiz_questions" WHERE "quiz_id" = q."id") sub ON true
ON CONFLICT (entity_type, entity_id) DO NOTHING;--> statement-breakpoint
INSERT INTO "search_index" ("entity_type", "entity_id", "user_id", "title", "body", "subject_id", "topic_id")
SELECT 'flashcard', d."id", d."user_id", d."title", '', tp."subject_id", d."topic_id"
FROM "flashcard_decks" d LEFT JOIN "topics" tp ON tp."id" = d."topic_id"
ON CONFLICT (entity_type, entity_id) DO NOTHING;--> statement-breakpoint
INSERT INTO "search_index" ("entity_type", "entity_id", "user_id", "title", "body", "subject_id", "topic_id")
SELECT 'flashcard', f."id", d."user_id", f."front", left(f."back", 2000),
  coalesce(tp."subject_id", dtp."subject_id"), coalesce(f."topic_id", d."topic_id")
FROM "flashcards" f
JOIN "flashcard_decks" d ON d."id" = f."deck_id"
LEFT JOIN "topics" tp ON tp."id" = f."topic_id"
LEFT JOIN "topics" dtp ON dtp."id" = d."topic_id"
ON CONFLICT (entity_type, entity_id) DO NOTHING;--> statement-breakpoint
INSERT INTO "search_index" ("entity_type", "entity_id", "user_id", "title", "body", "subject_id", "topic_id")
SELECT 'quest', q."id", q."user_id", q."title", '', NULL, NULL FROM "quests" q
ON CONFLICT (entity_type, entity_id) DO NOTHING;--> statement-breakpoint
ALTER TABLE "search_index" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "search_index" ADD COLUMN "tsv" tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("body", ''))) STORED;--> statement-breakpoint
CREATE INDEX "search_index_tsv_idx" ON "search_index" USING gin ("tsv");--> statement-breakpoint
CREATE OR REPLACE FUNCTION sq_search_subject() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM search_index WHERE entity_type = 'subject' AND entity_id = OLD.id;
    RETURN OLD;
  END IF;
  IF NEW.archived_at IS NOT NULL THEN
    DELETE FROM search_index WHERE entity_type = 'subject' AND entity_id = NEW.id;
  ELSE
    INSERT INTO search_index (entity_type, entity_id, user_id, title, body, subject_id, topic_id)
    VALUES ('subject', NEW.id, NEW.user_id, NEW.name, '', NEW.id, NULL)
    ON CONFLICT (entity_type, entity_id) DO UPDATE
      SET user_id = EXCLUDED.user_id, title = EXCLUDED.title, body = '',
          subject_id = EXCLUDED.subject_id, topic_id = NULL;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER search_subject_trg AFTER INSERT OR UPDATE OR DELETE ON subjects FOR EACH ROW EXECUTE FUNCTION sq_search_subject();--> statement-breakpoint
CREATE OR REPLACE FUNCTION sq_search_topic() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM search_index WHERE entity_type = 'topic' AND entity_id = OLD.id;
    RETURN OLD;
  END IF;
  INSERT INTO search_index (entity_type, entity_id, user_id, title, body, subject_id, topic_id)
  SELECT 'topic', NEW.id, s.user_id, NEW.name, coalesce(NEW.description, ''), NEW.subject_id, NEW.id
  FROM subjects s WHERE s.id = NEW.subject_id
  ON CONFLICT (entity_type, entity_id) DO UPDATE
    SET user_id = EXCLUDED.user_id, title = EXCLUDED.title, body = EXCLUDED.body,
        subject_id = EXCLUDED.subject_id, topic_id = EXCLUDED.topic_id;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER search_topic_trg AFTER INSERT OR UPDATE OR DELETE ON topics FOR EACH ROW EXECUTE FUNCTION sq_search_topic();--> statement-breakpoint
CREATE OR REPLACE FUNCTION sq_search_note() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM search_index WHERE entity_type = 'note' AND entity_id = OLD.id;
    RETURN OLD;
  END IF;
  INSERT INTO search_index (entity_type, entity_id, user_id, title, body, subject_id, topic_id)
  SELECT 'note', NEW.id, NEW.user_id, coalesce(nullif(NEW.title, ''), left(NEW.body_md, 60)),
         left(NEW.body_md, 4000), (SELECT subject_id FROM topics WHERE id = NEW.topic_id), NEW.topic_id
  ON CONFLICT (entity_type, entity_id) DO UPDATE
    SET user_id = EXCLUDED.user_id, title = EXCLUDED.title, body = EXCLUDED.body,
        subject_id = EXCLUDED.subject_id, topic_id = EXCLUDED.topic_id;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER search_note_trg AFTER INSERT OR UPDATE OR DELETE ON notes FOR EACH ROW EXECUTE FUNCTION sq_search_note();--> statement-breakpoint
CREATE OR REPLACE FUNCTION sq_search_task() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM search_index WHERE entity_type = 'task' AND entity_id = OLD.id;
    RETURN OLD;
  END IF;
  INSERT INTO search_index (entity_type, entity_id, user_id, title, body, subject_id, topic_id)
  SELECT 'task', NEW.id, NEW.user_id, NEW.title, coalesce(NEW.notes, ''), NEW.subject_id, NEW.topic_id
  ON CONFLICT (entity_type, entity_id) DO UPDATE
    SET user_id = EXCLUDED.user_id, title = EXCLUDED.title, body = EXCLUDED.body,
        subject_id = EXCLUDED.subject_id, topic_id = EXCLUDED.topic_id;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER search_task_trg AFTER INSERT OR UPDATE OR DELETE ON tasks FOR EACH ROW EXECUTE FUNCTION sq_search_task();--> statement-breakpoint
CREATE OR REPLACE FUNCTION sq_search_quiz() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM search_index WHERE entity_type = 'quiz' AND entity_id = OLD.id;
    RETURN OLD;
  END IF;
  INSERT INTO search_index (entity_type, entity_id, user_id, title, body, subject_id, topic_id)
  SELECT 'quiz', NEW.id, NEW.user_id, NEW.title,
         left(coalesce((SELECT string_agg(prompt, ' ') FROM quiz_questions WHERE quiz_id = NEW.id), ''), 4000),
         (SELECT subject_id FROM topics WHERE id = NEW.topic_id), NEW.topic_id
  ON CONFLICT (entity_type, entity_id) DO UPDATE
    SET user_id = EXCLUDED.user_id, title = EXCLUDED.title, body = EXCLUDED.body,
        subject_id = EXCLUDED.subject_id, topic_id = EXCLUDED.topic_id;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER search_quiz_trg AFTER INSERT OR UPDATE OR DELETE ON quizzes FOR EACH ROW EXECUTE FUNCTION sq_search_quiz();--> statement-breakpoint
CREATE OR REPLACE FUNCTION sq_search_quiz_question() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_quiz uuid := coalesce(NEW.quiz_id, OLD.quiz_id);
BEGIN
  -- A question belongs to its quiz's row: the quiz's indexed text IS its
  -- prompts, so any question change re-derives the parent from source.
  INSERT INTO search_index (entity_type, entity_id, user_id, title, body, subject_id, topic_id)
  SELECT 'quiz', q.id, q.user_id, q.title,
         left(coalesce((SELECT string_agg(prompt, ' ') FROM quiz_questions WHERE quiz_id = q.id), ''), 4000),
         (SELECT subject_id FROM topics WHERE id = q.topic_id), q.topic_id
  FROM quizzes q WHERE q.id = v_quiz
  ON CONFLICT (entity_type, entity_id) DO UPDATE
    SET user_id = EXCLUDED.user_id, title = EXCLUDED.title, body = EXCLUDED.body,
        subject_id = EXCLUDED.subject_id, topic_id = EXCLUDED.topic_id;
  RETURN coalesce(NEW, OLD);
END;
$$;--> statement-breakpoint
CREATE TRIGGER search_quiz_question_trg AFTER INSERT OR UPDATE OR DELETE ON quiz_questions FOR EACH ROW EXECUTE FUNCTION sq_search_quiz_question();--> statement-breakpoint
CREATE OR REPLACE FUNCTION sq_search_deck() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM search_index WHERE entity_type = 'flashcard' AND entity_id = OLD.id;
    RETURN OLD;
  END IF;
  INSERT INTO search_index (entity_type, entity_id, user_id, title, body, subject_id, topic_id)
  SELECT 'flashcard', NEW.id, NEW.user_id, NEW.title, '',
         (SELECT subject_id FROM topics WHERE id = NEW.topic_id), NEW.topic_id
  ON CONFLICT (entity_type, entity_id) DO UPDATE
    SET user_id = EXCLUDED.user_id, title = EXCLUDED.title, body = '',
        subject_id = EXCLUDED.subject_id, topic_id = EXCLUDED.topic_id;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER search_deck_trg AFTER INSERT OR UPDATE OR DELETE ON flashcard_decks FOR EACH ROW EXECUTE FUNCTION sq_search_deck();--> statement-breakpoint
CREATE OR REPLACE FUNCTION sq_search_flashcard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM search_index WHERE entity_type = 'flashcard' AND entity_id = OLD.id;
    RETURN OLD;
  END IF;
  INSERT INTO search_index (entity_type, entity_id, user_id, title, body, subject_id, topic_id)
  SELECT 'flashcard', NEW.id, d.user_id, NEW.front, left(NEW.back, 2000),
         coalesce((SELECT subject_id FROM topics WHERE id = NEW.topic_id),
                  (SELECT subject_id FROM topics WHERE id = d.topic_id)),
         coalesce(NEW.topic_id, d.topic_id)
  FROM flashcard_decks d WHERE d.id = NEW.deck_id
  ON CONFLICT (entity_type, entity_id) DO UPDATE
    SET user_id = EXCLUDED.user_id, title = EXCLUDED.title, body = EXCLUDED.body,
        subject_id = EXCLUDED.subject_id, topic_id = EXCLUDED.topic_id;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER search_flashcard_trg AFTER INSERT OR UPDATE OR DELETE ON flashcards FOR EACH ROW EXECUTE FUNCTION sq_search_flashcard();--> statement-breakpoint
CREATE OR REPLACE FUNCTION sq_search_quest() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM search_index WHERE entity_type = 'quest' AND entity_id = OLD.id;
    RETURN OLD;
  END IF;
  INSERT INTO search_index (entity_type, entity_id, user_id, title, body, subject_id, topic_id)
  SELECT 'quest', NEW.id, NEW.user_id, NEW.title, '', NULL, NULL
  ON CONFLICT (entity_type, entity_id) DO UPDATE
    SET user_id = EXCLUDED.user_id, title = EXCLUDED.title, body = '',
        subject_id = NULL, topic_id = NULL;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER search_quest_trg AFTER INSERT OR UPDATE OR DELETE ON quests FOR EACH ROW EXECUTE FUNCTION sq_search_quest();