CREATE TABLE "chat_settings" (
	"chat_id" bigint PRIMARY KEY NOT NULL,
	"locale" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
