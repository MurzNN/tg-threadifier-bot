ALTER TABLE "messages" ADD COLUMN "topic_id" integer;--> statement-breakpoint
UPDATE "messages"
SET "topic_id" = ("raw"->>'message_thread_id')::integer
WHERE ("raw"->>'is_topic_message')::boolean IS TRUE
  AND ("raw"->>'message_thread_id') IS NOT NULL;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "target_topic_id" integer;--> statement-breakpoint
DROP INDEX "threads_target_created_idx";--> statement-breakpoint
CREATE INDEX "threads_target_created_idx" ON "threads" USING btree ("target_chat_id","target_topic_id","created_at");
