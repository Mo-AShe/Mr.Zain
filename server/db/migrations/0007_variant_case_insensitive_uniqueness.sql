DO $$
DECLARE
  sku_conflicts text;
  combination_conflicts text;
BEGIN
  SELECT string_agg(conflict_key, ', ')
  INTO sku_conflicts
  FROM (
    SELECT upper(btrim(sku)) AS conflict_key
    FROM product_variants
    GROUP BY upper(btrim(sku))
    HAVING COUNT(*) > 1
    ORDER BY conflict_key
    LIMIT 20
  ) conflicts;
  IF sku_conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot add normalized SKU uniqueness.'
      USING DETAIL = 'Reconcile these duplicate SKU values first: ' || sku_conflicts;
  END IF;

  SELECT string_agg(conflict_key, ', ')
  INTO combination_conflicts
  FROM (
    SELECT format(
      '%s (%s / %s)',
      product_id,
      min(size),
      min(color)
    ) AS conflict_key
    FROM product_variants
    GROUP BY product_id, lower(btrim(size)), lower(btrim(color))
    HAVING COUNT(*) > 1
    ORDER BY conflict_key
    LIMIT 20
  ) conflicts;
  IF combination_conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot add normalized size/color uniqueness.'
      USING DETAIL = 'Reconcile these duplicate product combinations first: ' || combination_conflicts;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE product_variants
  DROP CONSTRAINT IF EXISTS product_variants_sku_unique;
--> statement-breakpoint
DROP INDEX IF EXISTS product_variants_product_size_color_uidx;
--> statement-breakpoint
CREATE UNIQUE INDEX product_variants_sku_normalized_uidx
  ON product_variants (upper(btrim(sku)));
--> statement-breakpoint
CREATE UNIQUE INDEX product_variants_product_size_color_normalized_uidx
  ON product_variants (
    product_id,
    lower(btrim(size)),
    lower(btrim(color))
  );
