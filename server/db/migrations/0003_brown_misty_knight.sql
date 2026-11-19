ALTER TABLE "inventory_movements" ADD COLUMN "previous_quantity" integer;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "resulting_quantity" integer;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "performed_by" uuid;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "idempotency_key" varchar(128);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_carrier" varchar(100);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_number" varchar(120);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_movements_var_idempotency_uidx" ON "inventory_movements" USING btree ("variant_id","idempotency_key") WHERE "inventory_movements"."idempotency_key" IS NOT NULL;