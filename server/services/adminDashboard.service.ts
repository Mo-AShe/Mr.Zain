import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  resolveSalesDateRange,
  type ResolvedSalesRange,
  type SalesQueryInput,
} from "../validators/adminDashboard.validators.js";

export interface AdminRecentOrderDTO {
  id: string;
  orderNumber: string;
  customerName: string;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string;
  totalAmount: number;
  itemCount: number;
  createdAt: string;
}

export interface AdminBestSellingProductDTO {
  productId: string | null;
  productSlug: string | null;
  name_en: string;
  name_ar: string;
  unitsSold: number;
  revenue: number;
}

export interface AdminDashboardOverviewDTO {
  currency: "EGP";
  orders: {
    total: number;
    pending: number;
    confirmed: number;
    processing: number;
    shipped: number;
    delivered: number;
    cancelled: number;
  };
  customers: {
    totalRegistered: number;
  };
  products: {
    total: number;
    published: number;
    active: number;
  };
  inventory: {
    activeVariants: number;
    lowStockVariants: number;
    outOfStockVariants: number;
  };
  revenue: {
    totalCollected: number;
    currentMonth: number;
    previousMonth: number;
    paidOrdersCount: number;
  };
  recentOrders: AdminRecentOrderDTO[];
  bestSellingProducts: AdminBestSellingProductDTO[];
}

export interface AdminDailySalePointDTO {
  date: string;
  revenue: number;
  paidOrdersCount: number;
}

export interface AdminSalesAnalyticsDTO {
  currency: "EGP";
  range: ResolvedSalesRange;
  summary: {
    totalRevenue: number;
    totalPaidOrders: number;
    averageDailyRevenue: number;
    peakDay: {
      date: string;
      revenue: number;
    } | null;
  };
  dailySales: AdminDailySalePointDTO[];
}

function toMoneyNumber(raw: unknown): number {
  const num = Number(raw ?? 0);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

export async function getAdminDashboardOverview(): Promise<AdminDashboardOverviewDTO> {
  const [
    orderStatsRes,
    revenueStatsRes,
    customerStatsRes,
    productStatsRes,
    inventoryStatsRes,
    recentOrdersRes,
    bestSellingRes,
  ] = await Promise.all([
    // 1. Paid order counts directly on orders table (no joins -> zero duplicate rows)
    db.execute(sql`
      SELECT
        COUNT(*)::int AS total_orders,
        COUNT(*) FILTER (WHERE order_status = 'pending')::int AS pending_orders,
        COUNT(*) FILTER (WHERE order_status = 'confirmed')::int AS confirmed_orders,
        COUNT(*) FILTER (WHERE order_status = 'processing')::int AS processing_orders,
        COUNT(*) FILTER (WHERE order_status = 'shipped')::int AS shipped_orders,
        COUNT(*) FILTER (WHERE order_status = 'delivered')::int AS delivered_orders,
        COUNT(*) FILTER (WHERE order_status = 'cancelled')::int AS cancelled_orders
      FROM orders
        WHERE payment_status = 'paid'
    `),

    // 2. Collected revenue strictly from successfully paid, non-cancelled orders.
    //    Pending/unpaid COD orders are excluded. Queried directly on orders (no join multiplication).
    db.execute(sql`
      WITH cairo_bounds AS (
        SELECT
          date_trunc('month', now() AT TIME ZONE 'Africa/Cairo') AS curr_month_start,
          date_trunc('month', now() AT TIME ZONE 'Africa/Cairo') - interval '1 month' AS prev_month_start
      )
      SELECT
        COALESCE(SUM(o.total_amount), 0)::numeric(12, 2)::text AS total_collected_revenue,
        COALESCE(
          SUM(o.total_amount) FILTER (
            WHERE (o.created_at AT TIME ZONE 'Africa/Cairo') >= cb.curr_month_start
          ),
          0
        )::numeric(12, 2)::text AS current_month_revenue,
        COALESCE(
          SUM(o.total_amount) FILTER (
            WHERE (o.created_at AT TIME ZONE 'Africa/Cairo') >= cb.prev_month_start
              AND (o.created_at AT TIME ZONE 'Africa/Cairo') < cb.curr_month_start
          ),
          0
        )::numeric(12, 2)::text AS previous_month_revenue,
        COUNT(*)::int AS paid_orders_count
      FROM orders o
      CROSS JOIN cairo_bounds cb
      WHERE o.payment_status = 'paid'
        AND o.order_status <> 'cancelled'
    `),

    // 3. Registered customers only (excludes admin accounts)
    db.execute(sql`
      SELECT COUNT(*)::int AS total_customers
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      WHERE r.name = 'customer'
    `),

    // 4. Published & active catalog products without join duplication
    db.execute(sql`
      SELECT
        COUNT(*)::int AS total_products,
        COUNT(*) FILTER (WHERE p.is_published = true)::int AS published_products,
        COUNT(*) FILTER (
          WHERE p.is_published = true
            AND c.is_active = true
            AND EXISTS (
              SELECT 1
              FROM product_variants pv
              WHERE pv.product_id = p.id
                AND pv.is_active = true
            )
        )::int AS active_products
      FROM products p
      INNER JOIN categories c ON c.id = p.category_id
    `),

    // 5. Variant inventory health accounting for reserved stock (available = quantity - reserved_quantity)
    db.execute(sql`
      SELECT
        COUNT(*)::int AS active_variants,
        COUNT(*) FILTER (
          WHERE (COALESCE(inv.quantity, 0) - COALESCE(inv.reserved_quantity, 0)) <= 0
        )::int AS out_of_stock_variants,
        COUNT(*) FILTER (
          WHERE (COALESCE(inv.quantity, 0) - COALESCE(inv.reserved_quantity, 0)) > 0
            AND (COALESCE(inv.quantity, 0) - COALESCE(inv.reserved_quantity, 0))
                <= COALESCE(inv.low_stock_threshold, 5)
        )::int AS low_stock_variants
      FROM product_variants pv
      LEFT JOIN inventory inv ON inv.variant_id = pv.id
      WHERE pv.is_active = true
    `),

    // 6. Recent orders (safe summary only, item count computed by correlated subquery)
    db.execute(sql`
      SELECT
        o.id,
        o.order_number,
        COALESCE(
          NULLIF(o.shipping_address_snapshot->>'recipientName', ''),
          u.full_name,
          'Customer'
        ) AS customer_name,
        o.order_status,
        o.payment_status,
        o.payment_method,
        o.total_amount::numeric(12, 2)::text AS total_amount,
        (
          SELECT COALESCE(SUM(oi.quantity), 0)::int
          FROM order_items oi
          WHERE oi.order_id = o.id
        ) AS item_count,
        o.created_at
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      ORDER BY o.created_at DESC
      LIMIT 6
    `),

    // 7. Best-selling products calculated strictly from paid, non-cancelled orders
    db.execute(sql`
      SELECT
        p.id AS product_id,
        p.slug AS product_slug,
        COALESCE(p.name_en, oi.product_name_snapshot) AS name_en,
        COALESCE(p.name_ar, oi.product_name_snapshot) AS name_ar,
        SUM(oi.quantity)::int AS units_sold,
        COALESCE(SUM(oi.total_price), 0)::numeric(12, 2)::text AS revenue
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi.order_id
      LEFT JOIN product_variants pv ON pv.id = oi.variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      WHERE o.payment_status = 'paid'
        AND o.order_status <> 'cancelled'
      GROUP BY
        p.id,
        p.slug,
        COALESCE(p.name_en, oi.product_name_snapshot),
        COALESCE(p.name_ar, oi.product_name_snapshot)
      ORDER BY units_sold DESC, SUM(oi.total_price) DESC
      LIMIT 5
    `),
  ]);

  const orderRow = (orderStatsRes.rows[0] ?? {}) as Record<string, unknown>;
  const revenueRow = (revenueStatsRes.rows[0] ?? {}) as Record<string, unknown>;
  const customerRow = (customerStatsRes.rows[0] ?? {}) as Record<string, unknown>;
  const productRow = (productStatsRes.rows[0] ?? {}) as Record<string, unknown>;
  const inventoryRow = (inventoryStatsRes.rows[0] ?? {}) as Record<string, unknown>;

  const recentOrders: AdminRecentOrderDTO[] = recentOrdersRes.rows.map((row) => {
    const r = row as Record<string, unknown>;
    const createdAtVal =
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at ?? "");
    return {
      id: String(r.id),
      orderNumber: String(r.order_number),
      customerName: String(r.customer_name ?? ""),
      orderStatus: String(r.order_status),
      paymentStatus: String(r.payment_status),
      paymentMethod: String(r.payment_method),
      totalAmount: toMoneyNumber(r.total_amount),
      itemCount: Number(r.item_count ?? 0),
      createdAt: createdAtVal,
    };
  });

  const bestSellingProducts: AdminBestSellingProductDTO[] = bestSellingRes.rows.map(
    (row) => {
      const r = row as Record<string, unknown>;
      return {
        productId: r.product_id ? String(r.product_id) : null,
        productSlug: r.product_slug ? String(r.product_slug) : null,
        name_en: String(r.name_en ?? ""),
        name_ar: String(r.name_ar ?? ""),
        unitsSold: Number(r.units_sold ?? 0),
        revenue: toMoneyNumber(r.revenue),
      };
    }
  );

  return {
    currency: "EGP",
    orders: {
      total: Number(orderRow.total_orders ?? 0),
      pending: Number(orderRow.pending_orders ?? 0),
      confirmed: Number(orderRow.confirmed_orders ?? 0),
      processing: Number(orderRow.processing_orders ?? 0),
      shipped: Number(orderRow.shipped_orders ?? 0),
      delivered: Number(orderRow.delivered_orders ?? 0),
      cancelled: Number(orderRow.cancelled_orders ?? 0),
    },
    customers: {
      totalRegistered: Number(customerRow.total_customers ?? 0),
    },
    products: {
      total: Number(productRow.total_products ?? 0),
      published: Number(productRow.published_products ?? 0),
      active: Number(productRow.active_products ?? 0),
    },
    inventory: {
      activeVariants: Number(inventoryRow.active_variants ?? 0),
      lowStockVariants: Number(inventoryRow.low_stock_variants ?? 0),
      outOfStockVariants: Number(inventoryRow.out_of_stock_variants ?? 0),
    },
    revenue: {
      totalCollected: toMoneyNumber(revenueRow.total_collected_revenue),
      currentMonth: toMoneyNumber(revenueRow.current_month_revenue),
      previousMonth: toMoneyNumber(revenueRow.previous_month_revenue),
      paidOrdersCount: Number(revenueRow.paid_orders_count ?? 0),
    },
    recentOrders,
    bestSellingProducts,
  };
}

export async function getAdminDashboardSales(
  query: SalesQueryInput
): Promise<AdminSalesAnalyticsDTO> {
  const range = resolveSalesDateRange(query);

  const result = await db.execute(sql`
    WITH days AS (
      SELECT gs::date AS day_date
      FROM generate_series(
        ${range.startDate}::date,
        ${range.endDate}::date,
        interval '1 day'
      ) AS gs
    ),
    daily_paid AS (
      SELECT
        (o.created_at AT TIME ZONE 'Africa/Cairo')::date AS order_day,
        COUNT(*)::int AS paid_orders_count,
        COALESCE(SUM(o.total_amount), 0)::numeric(12, 2) AS revenue
      FROM orders o
      WHERE o.payment_status = 'paid'
        AND o.order_status <> 'cancelled'
        AND (o.created_at AT TIME ZONE 'Africa/Cairo')::date >= ${range.startDate}::date
        AND (o.created_at AT TIME ZONE 'Africa/Cairo')::date <= ${range.endDate}::date
      GROUP BY (o.created_at AT TIME ZONE 'Africa/Cairo')::date
    )
    SELECT
      to_char(d.day_date, 'YYYY-MM-DD') AS date,
      COALESCE(dp.paid_orders_count, 0)::int AS paid_orders_count,
      COALESCE(dp.revenue, 0)::numeric(12, 2)::text AS revenue
    FROM days d
    LEFT JOIN daily_paid dp ON dp.order_day = d.day_date
    ORDER BY d.day_date ASC
  `);

  let totalRevenueCents = 0;
  let totalPaidOrders = 0;
  let peakDay: { date: string; revenue: number } | null = null;

  const dailySales: AdminDailySalePointDTO[] = result.rows.map((row) => {
    const r = row as Record<string, unknown>;
    const revenue = toMoneyNumber(r.revenue);
    const paidOrdersCount = Number(r.paid_orders_count ?? 0);
    const date = String(r.date);

    totalRevenueCents += Math.round(revenue * 100);
    totalPaidOrders += paidOrdersCount;

    if (revenue > 0 && (!peakDay || revenue > peakDay.revenue)) {
      peakDay = { date, revenue };
    }

    return {
      date,
      revenue,
      paidOrdersCount,
    };
  });

  const totalRevenue = Math.round(totalRevenueCents) / 100;
  const averageDailyRevenue =
    range.days > 0 ? Math.round((totalRevenue / range.days) * 100) / 100 : 0;

  return {
    currency: "EGP",
    range,
    summary: {
      totalRevenue,
      totalPaidOrders,
      averageDailyRevenue,
      peakDay,
    },
    dailySales,
  };
}
