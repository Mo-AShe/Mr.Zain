CREATE TABLE "admin_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL UNIQUE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "admin_notifications_created_at_idx" ON "admin_notifications" ("created_at");--> statement-breakpoint
ALTER TABLE "admin_notifications"
  ADD CONSTRAINT "admin_notifications_order_id_orders_id_fk"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "admin_notification_reads" (
  "notification_id" uuid NOT NULL,
  "admin_id" uuid NOT NULL,
  "read_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("notification_id", "admin_id")
);--> statement-breakpoint
ALTER TABLE "admin_notification_reads"
  ADD CONSTRAINT "admin_notification_reads_notification_id_admin_notifications_id_fk"
  FOREIGN KEY ("notification_id") REFERENCES "admin_notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_notification_reads"
  ADD CONSTRAINT "admin_notification_reads_admin_id_users_id_fk"
  FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_notification_reads_admin_id_idx" ON "admin_notification_reads" ("admin_id");
