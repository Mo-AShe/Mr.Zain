ALTER TABLE "addresses" ADD COLUMN "floor" varchar(40);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "idempotency_key" varchar(128);--> statement-breakpoint
CREATE UNIQUE INDEX "orders_user_idempotency_uidx" ON "orders" USING btree ("user_id","idempotency_key") WHERE "orders"."idempotency_key" IS NOT NULL;