CREATE TABLE inventory_threshold_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  previous_threshold integer NOT NULL,
  new_threshold integer NOT NULL,
  changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_threshold_changes_previous_non_negative
    CHECK (previous_threshold >= 0),
  CONSTRAINT inventory_threshold_changes_new_non_negative
    CHECK (new_threshold >= 0)
);
--> statement-breakpoint
CREATE INDEX inventory_threshold_changes_variant_id_idx
  ON inventory_threshold_changes (variant_id);
--> statement-breakpoint
CREATE INDEX inventory_threshold_changes_created_at_idx
  ON inventory_threshold_changes (created_at);
