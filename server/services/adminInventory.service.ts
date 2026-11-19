import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  inventory,
  inventoryMovements,
  orders,
  productImages,
  products,
  productVariants,
  users,
} from "../db/schema.js";
import { AppError } from "../middleware/errorHandler.js";
import type {
  AdminInventoryMovementsQueryInput,
  AdminInventoryQueryInput,
  CreateStockAdjustmentInput,
  UpdateLowStockThresholdInput,
} from "../validators/adminInventory.validators.js";

export type InventoryStockState = "out_of_stock" | "low_stock" | "in_stock";

export interface AdminInventorySummaryDTO {
  totalActiveVariants: number;
  totalInactiveVariants: number;
  totalAvailableUnits: number;
  totalReservedUnits: number;
  totalPhysicalUnits: number;
  lowStockVariants: number;
  outOfStockVariants: number;
}

export interface AdminInventoryItemDTO {
  variantId: string;
  productId: string;
  productSlug: string;
  productNameEn: string;
  productNameAr: string;
  productIsPublished: boolean;
  primaryImageUrl: string | null;
  sku: string;
  size: string;
  color: string;
  price: number;
  variantIsActive: boolean;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  lowStockThreshold: number;
  stockState: InventoryStockState;
  lastMovementAt: string | null;
  updatedAt: string;
}

export interface AdminInventoryMovementDTO {
  id: string;
  variantId: string;
  sku: string;
  size: string;
  color: string;
  productId: string;
  productNameEn: string;
  productNameAr: string;
  movementType: string;
  quantity: number;
  previousQuantity: number | null;
  resultingQuantity: number | null;
  reason: string | null;
  referenceId: string | null;
  orderNumber: string | null;
  performedBy: string | null;
  performedByName: string | null;
  idempotencyKey: string | null;
  createdAt: string;
}

function toIsoStringOrNull(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  const parsed = new Date(String(val));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function resolveStockState(
  quantity: number,
  reservedQuantity: number,
  lowStockThreshold: number
): InventoryStockState {
  const available = quantity - reservedQuantity;
  if (available <= 0) return "out_of_stock";
  if (available <= lowStockThreshold) return "low_stock";
  return "in_stock";
}

function mapInventoryRow(r: Record<string, unknown>): AdminInventoryItemDTO {
  const quantity = Number(r.quantity ?? 0);
  const reservedQuantity = Number(r.reserved_quantity ?? 0);
  const availableQuantity = Math.max(0, quantity - reservedQuantity);
  const lowStockThreshold = Number(r.low_stock_threshold ?? 5);

  return {
    variantId: String(r.variant_id),
    productId: String(r.product_id),
    productSlug: String(r.product_slug ?? ""),
    productNameEn: String(r.product_name_en ?? ""),
    productNameAr: String(r.product_name_ar ?? ""),
    productIsPublished: Boolean(r.product_is_published),
    primaryImageUrl: r.primary_image_url ? String(r.primary_image_url) : null,
    sku: String(r.sku ?? ""),
    size: String(r.size ?? ""),
    color: String(r.color ?? ""),
    price: Math.round(Number(r.price ?? 0) * 100) / 100,
    variantIsActive: Boolean(r.variant_is_active),
    quantity,
    reservedQuantity,
    availableQuantity,
    lowStockThreshold,
    stockState: resolveStockState(quantity, reservedQuantity, lowStockThreshold),
    lastMovementAt: toIsoStringOrNull(r.last_movement_at),
    updatedAt: toIsoStringOrNull(r.updated_at) || new Date().toISOString(),
  };
}

export async function getAdminInventorySummary(): Promise<AdminInventorySummaryDTO> {
  const result = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE pv.is_active = true)::int AS total_active_variants,
      COUNT(*) FILTER (WHERE pv.is_active = false)::int AS total_inactive_variants,
      COALESCE(
        SUM(GREATEST(0, COALESCE(inv.quantity, 0) - COALESCE(inv.reserved_quantity, 0)))
          FILTER (WHERE pv.is_active = true),
        0
      )::int AS total_available_units,
      COALESCE(
        SUM(COALESCE(inv.reserved_quantity, 0)) FILTER (WHERE pv.is_active = true),
        0
      )::int AS total_reserved_units,
      COALESCE(
        SUM(COALESCE(inv.quantity, 0)) FILTER (WHERE pv.is_active = true),
        0
      )::int AS total_physical_units,
      COUNT(*) FILTER (
        WHERE pv.is_active = true
          AND (COALESCE(inv.quantity, 0) - COALESCE(inv.reserved_quantity, 0)) > 0
          AND (COALESCE(inv.quantity, 0) - COALESCE(inv.reserved_quantity, 0))
              <= COALESCE(inv.low_stock_threshold, 5)
      )::int AS low_stock_variants,
      COUNT(*) FILTER (
        WHERE pv.is_active = true
          AND (COALESCE(inv.quantity, 0) - COALESCE(inv.reserved_quantity, 0)) <= 0
      )::int AS out_of_stock_variants
    FROM product_variants pv
    LEFT JOIN inventory inv ON inv.variant_id = pv.id
  `);

  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  return {
    totalActiveVariants: Number(row.total_active_variants ?? 0),
    totalInactiveVariants: Number(row.total_inactive_variants ?? 0),
    totalAvailableUnits: Number(row.total_available_units ?? 0),
    totalReservedUnits: Number(row.total_reserved_units ?? 0),
    totalPhysicalUnits: Number(row.total_physical_units ?? 0),
    lowStockVariants: Number(row.low_stock_variants ?? 0),
    outOfStockVariants: Number(row.out_of_stock_variants ?? 0),
  };
}

export async function listAdminInventory(
  query: AdminInventoryQueryInput
): Promise<{
  items: AdminInventoryItemDTO[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const conditions = [sql`1 = 1`];

  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(sql`(
      pv.sku ILIKE ${pattern}
      OR pv.size ILIKE ${pattern}
      OR pv.color ILIKE ${pattern}
      OR p.name_en ILIKE ${pattern}
      OR p.name_ar ILIKE ${pattern}
    )`);
  }

  if (query.activeOnly === "active") {
    conditions.push(sql`pv.is_active = true`);
  } else if (query.activeOnly === "inactive") {
    conditions.push(sql`pv.is_active = false`);
  }

  if (query.stockStatus === "out_of_stock") {
    conditions.push(
      sql`(COALESCE(inv.quantity, 0) - COALESCE(inv.reserved_quantity, 0)) <= 0`
    );
  } else if (query.stockStatus === "low_stock") {
    conditions.push(
      sql`(COALESCE(inv.quantity, 0) - COALESCE(inv.reserved_quantity, 0)) > 0
          AND (COALESCE(inv.quantity, 0) - COALESCE(inv.reserved_quantity, 0)) <= COALESCE(inv.low_stock_threshold, 5)`
    );
  } else if (query.stockStatus === "in_stock") {
    conditions.push(
      sql`(COALESCE(inv.quantity, 0) - COALESCE(inv.reserved_quantity, 0)) > COALESCE(inv.low_stock_threshold, 5)`
    );
  } else if (query.stockStatus === "reserved") {
    conditions.push(sql`COALESCE(inv.reserved_quantity, 0) > 0`);
  }

  const whereClause = sql.join(conditions, sql` AND `);

  let orderBySql = sql`COALESCE(inv.updated_at, pv.created_at) DESC, pv.sku ASC`;
  if (query.sort === "available_asc") {
    orderBySql = sql`(COALESCE(inv.quantity, 0) - COALESCE(inv.reserved_quantity, 0)) ASC, pv.sku ASC`;
  } else if (query.sort === "available_desc") {
    orderBySql = sql`(COALESCE(inv.quantity, 0) - COALESCE(inv.reserved_quantity, 0)) DESC, pv.sku ASC`;
  } else if (query.sort === "sku_asc") {
    orderBySql = sql`pv.sku ASC`;
  } else if (query.sort === "product_asc") {
    orderBySql = sql`p.name_en ASC, pv.size ASC, pv.color ASC`;
  }

  const countRes = await db.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM product_variants pv
    INNER JOIN products p ON p.id = pv.product_id
    LEFT JOIN inventory inv ON inv.variant_id = pv.id
    WHERE ${whereClause}
  `);

  const total = Number((countRes.rows[0] as Record<string, unknown> | undefined)?.total ?? 0);
  const offset = (query.page - 1) * query.limit;

  const listRes = await db.execute(sql`
    SELECT
      pv.id AS variant_id,
      pv.product_id,
      p.slug AS product_slug,
      p.name_en AS product_name_en,
      p.name_ar AS product_name_ar,
      p.is_published AS product_is_published,
      (
        SELECT pi.image_url
        FROM product_images pi
        WHERE pi.product_id = p.id
        ORDER BY pi.is_primary DESC, pi.display_order ASC
        LIMIT 1
      ) AS primary_image_url,
      pv.sku,
      pv.size,
      pv.color,
      pv.price::numeric(12, 2)::text AS price,
      pv.is_active AS variant_is_active,
      COALESCE(inv.quantity, 0)::int AS quantity,
      COALESCE(inv.reserved_quantity, 0)::int AS reserved_quantity,
      COALESCE(inv.low_stock_threshold, 5)::int AS low_stock_threshold,
      (
        SELECT MAX(im.created_at)
        FROM inventory_movements im
        WHERE im.variant_id = pv.id
      ) AS last_movement_at,
      COALESCE(inv.updated_at, pv.created_at) AS updated_at
    FROM product_variants pv
    INNER JOIN products p ON p.id = pv.product_id
    LEFT JOIN inventory inv ON inv.variant_id = pv.id
    WHERE ${whereClause}
    ORDER BY ${orderBySql}
    LIMIT ${query.limit}
    OFFSET ${offset}
  `);

  return {
    items: listRes.rows.map((row) => mapInventoryRow(row as Record<string, unknown>)),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function getAdminInventoryVariantDetail(
  variantId: string
): Promise<{
  item: AdminInventoryItemDTO;
  recentMovements: AdminInventoryMovementDTO[];
}> {
  const rowRes = await db.execute(sql`
    SELECT
      pv.id AS variant_id,
      pv.product_id,
      p.slug AS product_slug,
      p.name_en AS product_name_en,
      p.name_ar AS product_name_ar,
      p.is_published AS product_is_published,
      (
        SELECT pi.image_url
        FROM product_images pi
        WHERE pi.product_id = p.id
        ORDER BY pi.is_primary DESC, pi.display_order ASC
        LIMIT 1
      ) AS primary_image_url,
      pv.sku,
      pv.size,
      pv.color,
      pv.price::numeric(12, 2)::text AS price,
      pv.is_active AS variant_is_active,
      COALESCE(inv.quantity, 0)::int AS quantity,
      COALESCE(inv.reserved_quantity, 0)::int AS reserved_quantity,
      COALESCE(inv.low_stock_threshold, 5)::int AS low_stock_threshold,
      (
        SELECT MAX(im.created_at)
        FROM inventory_movements im
        WHERE im.variant_id = pv.id
      ) AS last_movement_at,
      COALESCE(inv.updated_at, pv.created_at) AS updated_at
    FROM product_variants pv
    INNER JOIN products p ON p.id = pv.product_id
    LEFT JOIN inventory inv ON inv.variant_id = pv.id
    WHERE pv.id = ${variantId}
    LIMIT 1
  `);

  if (rowRes.rows.length === 0) {
    throw new AppError("Product variant not found.", 404, "VARIANT_NOT_FOUND");
  }

  const movementsRes = await listAdminInventoryMovements({
    variantId,
    movementType: "all",
    page: 1,
    limit: 15,
  });

  return {
    item: mapInventoryRow(rowRes.rows[0] as Record<string, unknown>),
    recentMovements: movementsRes.movements,
  };
}

export async function listAdminInventoryMovements(
  query: AdminInventoryMovementsQueryInput
): Promise<{
  movements: AdminInventoryMovementDTO[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  if (query.startDate && query.endDate && query.startDate > query.endDate) {
    throw new AppError(
      "Start date cannot be after end date.",
      400,
      "INVALID_DATE_RANGE"
    );
  }

  const conditions = [sql`1 = 1`];

  if (query.variantId) {
    conditions.push(sql`im.variant_id = ${query.variantId}`);
  }

  if (query.movementType !== "all") {
    conditions.push(sql`im.movement_type = ${query.movementType}`);
  }

  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(sql`(
      pv.sku ILIKE ${pattern}
      OR p.name_en ILIKE ${pattern}
      OR p.name_ar ILIKE ${pattern}
      OR COALESCE(im.reason, '') ILIKE ${pattern}
      OR COALESCE(o.order_number, '') ILIKE ${pattern}
    )`);
  }

  if (query.startDate) {
    conditions.push(
      sql`(im.created_at AT TIME ZONE 'Africa/Cairo')::date >= ${query.startDate}::date`
    );
  }

  if (query.endDate) {
    conditions.push(
      sql`(im.created_at AT TIME ZONE 'Africa/Cairo')::date <= ${query.endDate}::date`
    );
  }

  const whereClause = sql.join(conditions, sql` AND `);

  const countRes = await db.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM inventory_movements im
    INNER JOIN product_variants pv ON pv.id = im.variant_id
    INNER JOIN products p ON p.id = pv.product_id
    LEFT JOIN orders o ON o.id = im.reference_id
    WHERE ${whereClause}
  `);

  const total = Number((countRes.rows[0] as Record<string, unknown> | undefined)?.total ?? 0);
  const offset = (query.page - 1) * query.limit;

  const rowsRes = await db.execute(sql`
    SELECT
      im.id,
      im.variant_id,
      pv.sku,
      pv.size,
      pv.color,
      p.id AS product_id,
      p.name_en AS product_name_en,
      p.name_ar AS product_name_ar,
      im.movement_type,
      im.quantity,
      im.previous_quantity,
      im.resulting_quantity,
      im.reason,
      im.reference_id,
      o.order_number,
      im.performed_by,
      u.full_name AS performed_by_name,
      im.idempotency_key,
      im.created_at
    FROM inventory_movements im
    INNER JOIN product_variants pv ON pv.id = im.variant_id
    INNER JOIN products p ON p.id = pv.product_id
    LEFT JOIN orders o ON o.id = im.reference_id
    LEFT JOIN users u ON u.id = im.performed_by
    WHERE ${whereClause}
    ORDER BY im.created_at DESC, im.id DESC
    LIMIT ${query.limit}
    OFFSET ${offset}
  `);

  const movements: AdminInventoryMovementDTO[] = rowsRes.rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      variantId: String(r.variant_id),
      sku: String(r.sku ?? ""),
      size: String(r.size ?? ""),
      color: String(r.color ?? ""),
      productId: String(r.product_id),
      productNameEn: String(r.product_name_en ?? ""),
      productNameAr: String(r.product_name_ar ?? ""),
      movementType: String(r.movement_type),
      quantity: Number(r.quantity ?? 0),
      previousQuantity:
        r.previous_quantity === null || r.previous_quantity === undefined
          ? null
          : Number(r.previous_quantity),
      resultingQuantity:
        r.resulting_quantity === null || r.resulting_quantity === undefined
          ? null
          : Number(r.resulting_quantity),
      reason: r.reason ? String(r.reason) : null,
      referenceId: r.reference_id ? String(r.reference_id) : null,
      orderNumber: r.order_number ? String(r.order_number) : null,
      performedBy: r.performed_by ? String(r.performed_by) : null,
      performedByName: r.performed_by_name ? String(r.performed_by_name) : null,
      idempotencyKey: r.idempotency_key ? String(r.idempotency_key) : null,
      createdAt: toIsoStringOrNull(r.created_at) || new Date().toISOString(),
    };
  });

  return {
    movements,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function adjustVariantInventoryStock(
  variantId: string,
  adminUserId: string,
  input: CreateStockAdjustmentInput
): Promise<{
  item: AdminInventoryItemDTO;
  movement: AdminInventoryMovementDTO;
  alreadyProcessed: boolean;
}> {
  const idempotencyKey = input.idempotencyKey?.trim() || undefined;

  const result = await db.transaction(async (tx) => {
    // Verify variant exists
    const [variantRow] = await tx
      .select({
        id: productVariants.id,
        productId: productVariants.productId,
        sku: productVariants.sku,
        size: productVariants.size,
        color: productVariants.color,
        price: productVariants.price,
        isActive: productVariants.isActive,
        productSlug: products.slug,
        productNameEn: products.nameEn,
        productNameAr: products.nameAr,
        productIsPublished: products.isPublished,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(eq(productVariants.id, variantId))
      .limit(1);

    if (!variantRow) {
      throw new AppError("Product variant not found.", 404, "VARIANT_NOT_FOUND");
    }

    if (idempotencyKey) {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`${variantId}:${idempotencyKey}`}))`
      );
    }

    // Lock inventory row FOR UPDATE (create baseline row if somehow missing)
    let [invRow] = await tx
      .select()
      .from(inventory)
      .where(eq(inventory.variantId, variantId))
      .for("update")
      .limit(1);

    if (!invRow) {
      await tx
        .insert(inventory)
        .values({ variantId, quantity: 0, reservedQuantity: 0, lowStockThreshold: 5 })
        .onConflictDoNothing();

      [invRow] = await tx
        .select()
        .from(inventory)
        .where(eq(inventory.variantId, variantId))
        .for("update")
        .limit(1);
    }

    if (idempotencyKey) {
      const [existingMovement] = await tx
        .select({
          id: inventoryMovements.id,
          variantId: inventoryMovements.variantId,
          movementType: inventoryMovements.movementType,
          quantity: inventoryMovements.quantity,
          previousQuantity: inventoryMovements.previousQuantity,
          resultingQuantity: inventoryMovements.resultingQuantity,
          reason: inventoryMovements.reason,
          referenceId: inventoryMovements.referenceId,
          performedBy: inventoryMovements.performedBy,
          idempotencyKey: inventoryMovements.idempotencyKey,
          createdAt: inventoryMovements.createdAt,
        })
        .from(inventoryMovements)
        .where(
          and(
            eq(inventoryMovements.variantId, variantId),
            eq(inventoryMovements.idempotencyKey, idempotencyKey)
          )
        )
        .limit(1);

      if (existingMovement) {
        return {
          alreadyProcessed: true,
          movementId: existingMovement.id,
        };
      }
    }

    const previousQuantity = invRow.quantity;
    const reservedQuantity = invRow.reservedQuantity;

    let newQuantity = previousQuantity;
    let movementType: "addition" | "reduction" | "adjustment" = "adjustment";

    if (input.mode === "increase") {
      newQuantity = previousQuantity + input.amount;
      movementType = "addition";
    } else if (input.mode === "decrease") {
      newQuantity = previousQuantity - input.amount;
      movementType = "reduction";
    } else {
      newQuantity = input.amount;
      movementType = "adjustment";
    }

    if (newQuantity < 0) {
      throw new AppError(
        "Physical stock quantity cannot be negative.",
        409,
        "NEGATIVE_STOCK_FORBIDDEN"
      );
    }

    if (newQuantity < reservedQuantity) {
      throw new AppError(
        `Physical quantity (${newQuantity}) cannot be less than reserved stock (${reservedQuantity}).`,
        409,
        "BELOW_RESERVED_STOCK"
      );
    }

    const delta = newQuantity - previousQuantity;
    if (delta === 0) {
      throw new AppError(
        "Adjusted physical quantity must differ from current physical quantity.",
        400,
        "NO_STOCK_CHANGE"
      );
    }

    const [updatedInv] = await tx
      .update(inventory)
      .set({
        quantity: newQuantity,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(inventory.id, invRow.id),
          sql`${newQuantity} >= ${inventory.reservedQuantity}`
        )
      )
      .returning();

    if (!updatedInv) {
      throw new AppError(
        "Inventory could not be updated because reserved stock exceeds target quantity.",
        409,
        "BELOW_RESERVED_STOCK"
      );
    }

    const [createdMovement] = await tx
      .insert(inventoryMovements)
      .values({
        variantId,
        movementType,
        quantity: delta,
        previousQuantity,
        resultingQuantity: newQuantity,
        reason: input.reason,
        performedBy: adminUserId,
        idempotencyKey: idempotencyKey ?? null,
      })
      .returning({ id: inventoryMovements.id });

    return {
      alreadyProcessed: false,
      movementId: createdMovement.id,
    };
  });

  const [detail, movementQuery] = await Promise.all([
    getAdminInventoryVariantDetail(variantId),
    db.execute(sql`
      SELECT
        im.id,
        im.variant_id,
        pv.sku,
        pv.size,
        pv.color,
        p.id AS product_id,
        p.name_en AS product_name_en,
        p.name_ar AS product_name_ar,
        im.movement_type,
        im.quantity,
        im.previous_quantity,
        im.resulting_quantity,
        im.reason,
        im.reference_id,
        NULL::text AS order_number,
        im.performed_by,
        u.full_name AS performed_by_name,
        im.idempotency_key,
        im.created_at
      FROM inventory_movements im
      INNER JOIN product_variants pv ON pv.id = im.variant_id
      INNER JOIN products p ON p.id = pv.product_id
      LEFT JOIN users u ON u.id = im.performed_by
      WHERE im.id = ${result.movementId}
      LIMIT 1
    `),
  ]);

  const mr = (movementQuery.rows[0] ?? {}) as Record<string, unknown>;
  const movement: AdminInventoryMovementDTO = {
    id: String(mr.id),
    variantId: String(mr.variant_id),
    sku: String(mr.sku ?? ""),
    size: String(mr.size ?? ""),
    color: String(mr.color ?? ""),
    productId: String(mr.product_id),
    productNameEn: String(mr.product_name_en ?? ""),
    productNameAr: String(mr.product_name_ar ?? ""),
    movementType: String(mr.movement_type),
    quantity: Number(mr.quantity ?? 0),
    previousQuantity:
      mr.previous_quantity === null || mr.previous_quantity === undefined
        ? null
        : Number(mr.previous_quantity),
    resultingQuantity:
      mr.resulting_quantity === null || mr.resulting_quantity === undefined
        ? null
        : Number(mr.resulting_quantity),
    reason: mr.reason ? String(mr.reason) : null,
    referenceId: mr.reference_id ? String(mr.reference_id) : null,
    orderNumber: null,
    performedBy: mr.performed_by ? String(mr.performed_by) : null,
    performedByName: mr.performed_by_name ? String(mr.performed_by_name) : null,
    idempotencyKey: mr.idempotency_key ? String(mr.idempotency_key) : null,
    createdAt: toIsoStringOrNull(mr.created_at) || new Date().toISOString(),
  };

  return {
    item: detail.item,
    movement,
    alreadyProcessed: result.alreadyProcessed,
  };
}

export async function updateVariantLowStockThreshold(
  variantId: string,
  input: UpdateLowStockThresholdInput
): Promise<AdminInventoryItemDTO> {
  const [variant] = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.id, variantId))
    .limit(1);

  if (!variant) {
    throw new AppError("Product variant not found.", 404, "VARIANT_NOT_FOUND");
  }

  await db
    .insert(inventory)
    .values({
      variantId,
      quantity: 0,
      reservedQuantity: 0,
      lowStockThreshold: input.lowStockThreshold,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: inventory.variantId,
      set: {
        lowStockThreshold: input.lowStockThreshold,
        updatedAt: new Date(),
      },
    });

  const detail = await getAdminInventoryVariantDetail(variantId);
  return detail.item;
}
