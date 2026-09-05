CREATE TABLE "event_daily_aggregates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" date NOT NULL,
	"event" text NOT NULL,
	"company_id" uuid,
	"category_id" uuid,
	"query" text,
	"count" integer DEFAULT 0 NOT NULL,
	"unique_visitors" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_daily_aggregates" ADD CONSTRAINT "event_daily_aggregates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_daily_aggregates" ADD CONSTRAINT "event_daily_aggregates_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_daily_aggregates_day_idx" ON "event_daily_aggregates" USING btree ("day");--> statement-breakpoint
CREATE INDEX "event_daily_aggregates_event_idx" ON "event_daily_aggregates" USING btree ("event");