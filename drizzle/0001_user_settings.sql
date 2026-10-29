CREATE TABLE "user_settings" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"locale" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
