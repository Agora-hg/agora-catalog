CREATE TYPE "public"."claim_status" AS ENUM('new', 'in_review', 'applied', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."claim_type" AS ENUM('update', 'delete', 'verify', 'add_info');--> statement-breakpoint
CREATE TYPE "public"."company_status" AS ENUM('active', 'unknown', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."request_company_status" AS ENUM('selected', 'contacted', 'no_answer', 'interested', 'not_interested', 'connected');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('new', 'processing', 'suppliers_found', 'sent_to_suppliers', 'supplier_interested', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('yandex_maps', 'dadata', 'manual', 'claim', 'call');--> statement-breakpoint
CREATE TYPE "public"."supplier_response_status" AS ENUM('new', 'reviewed', 'connected', 'rejected');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"legal_name" text,
	"inn" text,
	"ogrn" text,
	"kpp" text,
	"okved" text,
	"egrul_status" text,
	"region" text,
	"city" text,
	"address" text,
	"lat" double precision,
	"lon" double precision,
	"website" text,
	"email" text,
	"phone" text,
	"phones" text[],
	"description" text,
	"description_raw" text,
	"products_tags" text[],
	"status" "company_status" DEFAULT 'unknown' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_reason" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"called_at" timestamp with time zone,
	"call_note" text,
	"source_url" text,
	"yandex_oid" text,
	"yandex_rating" double precision,
	"yandex_reviews_count" integer,
	"hours_raw" text,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('russian', coalesce(name,'') || ' ' || coalesce(description,'') || ' ' || coalesce(array_to_string(products_tags, ' '), ''))) STORED
);
--> statement-breakpoint
CREATE TABLE "company_categories" (
	"company_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"is_auto" boolean DEFAULT true NOT NULL,
	CONSTRAINT "company_categories_company_id_category_id_pk" PRIMARY KEY("company_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "company_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"type" "claim_type" NOT NULL,
	"status" "claim_status" DEFAULT 'new' NOT NULL,
	"name" text,
	"position" text,
	"phone" text,
	"email" text,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source_type" "source_type" NOT NULL,
	"source_url" text,
	"payload" jsonb,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visitor_id" text NOT NULL,
	"session_id" text,
	"event" text NOT NULL,
	"company_id" uuid,
	"category_id" uuid,
	"path" text,
	"referrer" text,
	"utm" jsonb,
	"payload" jsonb,
	"ip_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_yandex_orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oid" text NOT NULL,
	"payload" jsonb NOT NULL,
	"batch" text NOT NULL,
	"processed_at" timestamp with time zone,
	"company_id" uuid,
	"error" text,
	"scraped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"status" "request_company_status" DEFAULT 'selected' NOT NULL,
	"sent_at" timestamp with time zone,
	"response_at" timestamp with time zone,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid,
	"title" text,
	"description" text NOT NULL,
	"quantity" text,
	"dimensions" text,
	"material" text,
	"branding" text,
	"delivery_city" text,
	"deadline" text,
	"customer_name" text,
	"customer_phone" text,
	"customer_email" text,
	"status" "request_status" DEFAULT 'new' NOT NULL,
	"internal_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"company_id" uuid,
	"company_name" text,
	"name" text,
	"phone" text,
	"email" text,
	"message" text,
	"status" "supplier_response_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_categories" ADD CONSTRAINT "company_categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_categories" ADD CONSTRAINT "company_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_claims" ADD CONSTRAINT "company_claims_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_sources" ADD CONSTRAINT "company_sources_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_yandex_orgs" ADD CONSTRAINT "raw_yandex_orgs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_companies" ADD CONSTRAINT "request_companies_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_companies" ADD CONSTRAINT "request_companies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_responses" ADD CONSTRAINT "supplier_responses_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_responses" ADD CONSTRAINT "supplier_responses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_key" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_slug_key" ON "companies" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_inn_key" ON "companies" USING btree ("inn") WHERE "companies"."inn" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_yandex_oid_key" ON "companies" USING btree ("yandex_oid") WHERE "companies"."yandex_oid" is not null;--> statement-breakpoint
CREATE INDEX "companies_status_idx" ON "companies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "companies_city_idx" ON "companies" USING btree ("city");--> statement-breakpoint
CREATE INDEX "companies_search_idx" ON "companies" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "company_categories_category_idx" ON "company_categories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "company_claims_company_idx" ON "company_claims" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "company_claims_status_idx" ON "company_claims" USING btree ("status");--> statement-breakpoint
CREATE INDEX "company_sources_company_idx" ON "company_sources" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "events_created_idx" ON "events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "events_visitor_idx" ON "events" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "events_event_idx" ON "events" USING btree ("event");--> statement-breakpoint
CREATE INDEX "events_company_idx" ON "events" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_yandex_orgs_oid_batch_key" ON "raw_yandex_orgs" USING btree ("oid","batch");--> statement-breakpoint
CREATE INDEX "raw_yandex_orgs_processed_idx" ON "raw_yandex_orgs" USING btree ("processed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "request_companies_pair_key" ON "request_companies" USING btree ("request_id","company_id");--> statement-breakpoint
CREATE INDEX "request_companies_status_idx" ON "request_companies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "requests_status_idx" ON "requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "requests_created_idx" ON "requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "supplier_responses_request_idx" ON "supplier_responses" USING btree ("request_id");