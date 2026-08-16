CREATE TABLE "studios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "gyms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "gyms_studio_id_id_key" UNIQUE("studio_id","id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"full_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"registered_gym_id" uuid,
	"gym_access" text DEFAULT 'all' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "memberships_studio_id_id_key" UNIQUE("studio_id","id")
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"gym_id" uuid NOT NULL,
	"checked_in_at" timestamp with time zone NOT NULL,
	"business_date" date NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "attendance_studio_id_idempotency_key" UNIQUE("studio_id","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "gyms" ADD CONSTRAINT "gyms_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_registered_gym_fk" FOREIGN KEY ("studio_id","registered_gym_id") REFERENCES "public"."gyms"("studio_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_studio_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_membership_fk" FOREIGN KEY ("studio_id","membership_id") REFERENCES "public"."memberships"("studio_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_gym_fk" FOREIGN KEY ("studio_id","gym_id") REFERENCES "public"."gyms"("studio_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "studios_slug_key" ON "studios" USING btree ("slug") WHERE "studios"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "studios_created_at_idx" ON "studios" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "gyms_studio_id_code_key" ON "gyms" USING btree ("studio_id","code") WHERE "gyms"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "gyms_studio_id_created_at_idx" ON "gyms" USING btree ("studio_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_key" ON "users" USING btree ("phone") WHERE "users"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_studio_user_role_key" ON "memberships" USING btree ("studio_id","user_id","role") WHERE "memberships"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "memberships_studio_id_user_id_idx" ON "memberships" USING btree ("studio_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_studio_id_registered_gym_id_idx" ON "memberships" USING btree ("studio_id","registered_gym_id");--> statement-breakpoint
CREATE INDEX "memberships_studio_id_role_status_idx" ON "memberships" USING btree ("studio_id","role","status");--> statement-breakpoint
CREATE INDEX "attendance_studio_membership_date_idx" ON "attendance" USING btree ("studio_id","membership_id","business_date");--> statement-breakpoint
CREATE INDEX "attendance_studio_gym_date_idx" ON "attendance" USING btree ("studio_id","gym_id","business_date");