DELETE FROM "chat_pairs";
--> statement-breakpoint
DELETE FROM "relocation_jobs" WHERE "chat_pair_id" NOT IN (SELECT "id" FROM "chat_pairs");
--> statement-breakpoint
ALTER TABLE "chat_pairs" ADD COLUMN "configured_by_user_id" bigint NOT NULL;