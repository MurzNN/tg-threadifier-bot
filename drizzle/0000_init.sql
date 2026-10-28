CREATE TABLE "chat_pairs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_chat_id" bigint NOT NULL,
	"target_chat_id" bigint NOT NULL,
	"source_title" text,
	"target_title" text,
	"source_username_or_path" text,
	"ai_titles_enabled" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"chat_id" bigint NOT NULL,
	"message_id" integer NOT NULL,
	"from_user_id" bigint,
	"date" integer NOT NULL,
	"text" text,
	"caption" text,
	"content_fingerprint" text,
	"reply_to_message_id" integer,
	"forward_origin" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relocation_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_pair_id" integer NOT NULL,
	"phase" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" serial PRIMARY KEY NOT NULL,
	"target_chat_id" bigint NOT NULL,
	"root_message_id" integer NOT NULL,
	"thread_title" text NOT NULL,
	"topic_label" text NOT NULL,
	"title_source" text DEFAULT 'truncated' NOT NULL,
	"initiator_user_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "messages_chat_message_uidx" ON "messages" USING btree ("chat_id","message_id");--> statement-breakpoint
CREATE INDEX "threads_target_created_idx" ON "threads" USING btree ("target_chat_id","created_at");