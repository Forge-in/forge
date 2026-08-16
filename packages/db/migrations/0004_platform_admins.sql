CREATE TABLE "platform_admin_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"invited_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"suspended_at" timestamp with time zone,
	"invited_by" uuid,
	"last_signed_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_admin_invites_token_hash_key" ON "platform_admin_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_admin_invites_pending_phone_key" ON "platform_admin_invites" USING btree ("phone") WHERE "platform_admin_invites"."accepted_at" is null and "platform_admin_invites"."revoked_at" is null and "platform_admin_invites"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "platform_admin_invites_expires_at_idx" ON "platform_admin_invites" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_admins_user_id_key" ON "platform_admins" USING btree ("user_id") WHERE "platform_admins"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "platform_admins_status_idx" ON "platform_admins" USING btree ("status");