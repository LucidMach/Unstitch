-- NOT part of the deliverable / not used by `prisma migrate` or `prisma db push`.
--
-- This is a hand-derived reconstruction of the SQL that `prisma migrate dev`
-- would generate from prisma/schema.prisma, written so the schema could be
-- verified against a real local Postgres in a sandbox where Prisma's own
-- CLI could not run (outbound access to Prisma's engine-binary host was
-- blocked by network policy — see the accompanying explanation).
--
-- Once `pnpm install` can complete somewhere with normal network access,
-- run the real `prisma migrate dev` / `prisma db push` instead of this file
-- — this file's only job was to let the schema *design* get tested now.

CREATE TYPE "public"."admin_role" AS ENUM('OWNER', 'STAFF');
CREATE TYPE "public"."cart_status" AS ENUM('ACTIVE', 'ABANDONED', 'CONVERTED', 'EXPIRED');
CREATE TYPE "public"."delivery_method" AS ENUM('SELF_DELIVERY', 'AUSPOST', 'PICKUP');
CREATE TYPE "public"."delivery_pricing_method" AS ENUM('FLAT', 'DYNAMIC');
CREATE TYPE "public"."difficulty_level" AS ENUM('BEGINNER', 'INTERMEDIATE', 'ADVANCED');
CREATE TYPE "public"."drop_status" AS ENUM('UPCOMING', 'LIVE', 'SOLD_OUT', 'ARCHIVED');
CREATE TYPE "public"."order_channel" AS ENUM('ONLINE', 'IN_PERSON');
CREATE TYPE "public"."order_status" AS ENUM('PENDING_PAYMENT', 'PAID', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');
CREATE TYPE "public"."payment_provider" AS ENUM('STRIPE', 'SQUARE');
CREATE TYPE "public"."payment_status" AS ENUM('REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');
CREATE TYPE "public"."refund_status" AS ENUM('PENDING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "public"."review_status" AS ENUM('PENDING', 'PUBLISHED', 'REJECTED');
CREATE TYPE "public"."unit_status" AS ENUM('IN_STOCK', 'RESERVED', 'SOLD', 'SHIPPED', 'DELIVERED', 'REGISTERED', 'RETURNED');

-- Existing models (pre-existing in the live repo) --------------------------

CREATE TABLE "subscribers" (
	"id" SERIAL PRIMARY KEY,
	"name" text,
	"email" text NOT NULL,
	"source" text,
	"signup_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"product_id" uuid,
	"notified_at" timestamp with time zone,
	CONSTRAINT "subscribers_email_key" UNIQUE("email")
);

CREATE TABLE "contact_submissions" (
	"id" SERIAL PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- New commerce models --------------------------------------------------------

CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"label" varchar(60),
	"recipient_name" varchar(200) NOT NULL,
	"line1" varchar(200) NOT NULL,
	"line2" varchar(200),
	"suburb" varchar(120) NOT NULL,
	"state" varchar(10) NOT NULL,
	"postcode" varchar(10) NOT NULL,
	"country" varchar(2) DEFAULT 'AU' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(200),
	"role" "admin_role" DEFAULT 'STAFF' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);

CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"gift_wrap" boolean DEFAULT false NOT NULL,
	"gift_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_token" varchar(64) NOT NULL,
	"customer_id" uuid,
	"status" "cart_status" DEFAULT 'ACTIVE' NOT NULL,
	"abandoned_email_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carts_cart_token_unique" UNIQUE("cart_token")
);

CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(200),
	"phone" varchar(40),
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_email_unique" UNIQUE("email")
);

CREATE TABLE "delivery_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"method" "delivery_method" NOT NULL,
	"min_distance_km" integer,
	"max_distance_km" integer,
	"postcode_patterns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pricing_method" "delivery_pricing_method" DEFAULT 'FLAT' NOT NULL,
	"fee_cents" integer NOT NULL,
	"is_estimate" boolean DEFAULT false NOT NULL,
	"eta_days" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);

CREATE TABLE "drops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"drop_code" varchar(20) NOT NULL,
	"total_units" integer NOT NULL,
	"status" "drop_status" DEFAULT 'UPCOMING' NOT NULL,
	"made_location" varchar(120) DEFAULT 'Melbourne' NOT NULL,
	"made_year" integer NOT NULL,
	"release_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "giving_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"tiles_contributed" integer DEFAULT 0 NOT NULL,
	"internal_value_cents" integer,
	"giving_program_id" uuid,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "giving_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"type" varchar(40) NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "material_archive_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(160) NOT NULL,
	"title" varchar(200) NOT NULL,
	"origin_story" text NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hidden" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "material_archive_cards_slug_unique" UNIQUE("slug")
);

CREATE TABLE "material_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"material_type" varchar(100) NOT NULL,
	"cost_cents" integer NOT NULL,
	"width_cm" integer NOT NULL,
	"height_cm" integer NOT NULL,
	"waste_percent" integer DEFAULT 10 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"unit_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"line_total_cents" integer NOT NULL,
	CONSTRAINT "order_items_unit_id_unique" UNIQUE("unit_id")
);

CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" varchar(30) NOT NULL,
	"customer_id" uuid NOT NULL,
	"cart_id" uuid,
	"channel" "order_channel" DEFAULT 'ONLINE' NOT NULL,
	"status" "order_status" DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"delivery_fee_cents" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"giving_contribution_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'AUD' NOT NULL,
	"delivery_address_id" uuid,
	"delivery_zone_id" uuid,
	"gift_wrap" boolean DEFAULT false NOT NULL,
	"gift_message" text,
	"order_note" text,
	"idempotency_key" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "orders_idempotency_key_unique" UNIQUE("idempotency_key")
);

CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"provider_payment_id" varchar(200) NOT NULL,
	"status" "payment_status" DEFAULT 'REQUIRES_ACTION' NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'AUD' NOT NULL,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_payment_id_unique" UNIQUE("provider_payment_id")
);

CREATE TABLE "product_cost_recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"material_source_id" uuid NOT NULL,
	"tile_size_cm" integer NOT NULL,
	"tiles_per_kit" integer NOT NULL,
	"labour_minutes" integer NOT NULL,
	"labour_rate_cents_per_hour" integer NOT NULL,
	"equipment_cost_cents" integer DEFAULT 0 NOT NULL,
	"equipment_cost_note" text,
	"design_cost_cents" integer DEFAULT 0 NOT NULL,
	"design_amortization_units" integer DEFAULT 1 NOT NULL,
	"packaging_components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"operations_overhead_cents" integer DEFAULT 0 NOT NULL,
	"giving_tiles_per_kit" integer DEFAULT 0 NOT NULL,
	"giving_program_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_cost_recipes_product_id_unique" UNIQUE("product_id")
);

CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" varchar(40) NOT NULL,
	"slug" varchar(160) NOT NULL,
	"name" varchar(200) NOT NULL,
	"tagline" varchar(280),
	"description" text NOT NULL,
	"material_archive_card_id" uuid,
	"colour_palette" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tile_material" varchar(200),
	"material_rigidity" varchar(100),
	"difficulty_level" "difficulty_level" DEFAULT 'BEGINNER' NOT NULL,
	"age_range_min" integer,
	"age_range_max" integer,
	"kit_contents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gift_wrap_available" boolean DEFAULT true NOT NULL,
	"gift_message_available" boolean DEFAULT true NOT NULL,
	"base_price_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'AUD' NOT NULL,
	"cost_breakdown" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_cost_calculation_cents" integer,
	"giving_tiles_per_kit" integer DEFAULT 0 NOT NULL,
	"giving_internal_value_cents_per_tile" integer DEFAULT 0 NOT NULL,
	"giving_description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku"),
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);

CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"reason" text,
	"status" "refund_status" DEFAULT 'PENDING' NOT NULL,
	"provider_refund_id" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_item_id" uuid NOT NULL,
	"drop_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"unit_id" uuid,
	"rating" integer NOT NULL,
	"title" varchar(200),
	"body" text,
	"status" "review_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_unit_id_unique" UNIQUE("unit_id")
);

CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"serial" varchar(40) NOT NULL,
	"qr_slug" varchar(40) NOT NULL,
	"drop_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"edition_number" integer NOT NULL,
	"status" "unit_status" DEFAULT 'IN_STOCK' NOT NULL,
	"current_owner_customer_id" uuid,
	"registered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "units_serial_unique" UNIQUE("serial"),
	CONSTRAINT "units_qr_slug_unique" UNIQUE("qr_slug")
);

CREATE TABLE "wishlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid,
	"session_token" varchar(64),
	"product_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Foreign keys ---------------------------------------------------------------

ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "carts" ADD CONSTRAINT "carts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "drops" ADD CONSTRAINT "drops_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "giving_ledger" ADD CONSTRAINT "giving_ledger_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "giving_ledger" ADD CONSTRAINT "giving_ledger_giving_program_id_giving_programs_id_fk" FOREIGN KEY ("giving_program_id") REFERENCES "public"."giving_programs"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_address_id_addresses_id_fk" FOREIGN KEY ("delivery_address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_zone_id_delivery_zones_id_fk" FOREIGN KEY ("delivery_zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "product_cost_recipes" ADD CONSTRAINT "product_cost_recipes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "product_cost_recipes" ADD CONSTRAINT "product_cost_recipes_material_source_id_material_sources_id_fk" FOREIGN KEY ("material_source_id") REFERENCES "public"."material_sources"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "product_cost_recipes" ADD CONSTRAINT "product_cost_recipes_giving_program_id_giving_programs_id_fk" FOREIGN KEY ("giving_program_id") REFERENCES "public"."giving_programs"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "products" ADD CONSTRAINT "products_material_archive_card_id_material_archive_cards_id_fk" FOREIGN KEY ("material_archive_card_id") REFERENCES "public"."material_archive_cards"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_cart_item_id_cart_items_id_fk" FOREIGN KEY ("cart_item_id") REFERENCES "public"."cart_items"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "units" ADD CONSTRAINT "units_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "units" ADD CONSTRAINT "units_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "units" ADD CONSTRAINT "units_current_owner_customer_id_customers_id_fk" FOREIGN KEY ("current_owner_customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;

CREATE UNIQUE INDEX "drops_product_dropcode_uq" ON "drops" USING btree ("product_id","drop_code");
CREATE INDEX "reservations_drop_status_idx" ON "reservations" USING btree ("drop_id","status");
CREATE INDEX "units_drop_status_idx" ON "units" USING btree ("drop_id","status");
CREATE INDEX "units_owner_idx" ON "units" USING btree ("current_owner_customer_id");
