import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { addresses, orders, roles, sessions, users } from "../db/schema.js";
import { AppError } from "../middleware/errorHandler.js";
import type {
  AdminCustomersQueryInput,
  UpdateCustomerStatusInput,
} from "../validators/adminCustomers.validators.js";
import { roundCurrency } from "./shipping.service.js";

export interface AdminCustomerSummaryDTO {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  isVerified: boolean;
  totalOrders: number;
  paidOrdersCount: number;
  totalPaidSpend: number;
  lastOrderAt: string | null;
  createdAt: string;
}

export interface AdminCustomerAddressDTO {
  id: string;
  recipientName: string;
  phone: string;
  governorate: string;
  city: string;
  street: string;
  building: string | null;
  apartment: string | null;
  floor: string | null;
  additionalInformation: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface AdminCustomerOrderDTO {
  id: string;
  orderNumber: string;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string;
  totalAmount: number;
  itemCount: number;
  createdAt: string;
}

export interface AdminCustomerDetailDTO {
  customer: AdminCustomerSummaryDTO & {
    updatedAt: string;
    deliveredOrders: number;
    cancelledOrders: number;
    activeSessionsCount: number;
  };
  addresses: AdminCustomerAddressDTO[];
  orders: AdminCustomerOrderDTO[];
}

function toIsoStringOrNull(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  const parsed = new Date(String(val));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function mapCustomerSummaryRow(r: Record<string, unknown>): AdminCustomerSummaryDTO {
  return {
    id: String(r.id),
    fullName: String(r.full_name ?? ""),
    email: String(r.email ?? ""),
    phone: r.phone ? String(r.phone) : null,
    isActive: Boolean(r.is_active),
    isVerified: Boolean(r.is_verified),
    totalOrders: Number(r.total_orders ?? 0),
    paidOrdersCount: Number(r.paid_orders_count ?? 0),
    totalPaidSpend: roundCurrency(Number(r.total_paid_spend ?? 0)),
    lastOrderAt: toIsoStringOrNull(r.last_order_at),
    createdAt: toIsoStringOrNull(r.created_at) || new Date().toISOString(),
  };
}

export async function listAdminCustomers(
  query: AdminCustomersQueryInput
): Promise<{
  customers: AdminCustomerSummaryDTO[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  // Strictly restrict directory to customer role — admin accounts are never returned.
  const conditions = [sql`r.name = 'customer'`];

  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(sql`(
      u.full_name ILIKE ${pattern}
      OR u.email ILIKE ${pattern}
      OR COALESCE(u.phone, '') ILIKE ${pattern}
    )`);
  }

  if (query.status === "active") {
    conditions.push(sql`u.is_active = true`);
  } else if (query.status === "inactive") {
    conditions.push(sql`u.is_active = false`);
  }

  const whereClause = sql.join(conditions, sql` AND `);

  let orderBySql = sql`u.created_at DESC`;
  if (query.sort === "oldest") {
    orderBySql = sql`u.created_at ASC`;
  } else if (query.sort === "spend_desc") {
    orderBySql = sql`COALESCE(os.total_paid_spend, 0) DESC, u.created_at DESC`;
  } else if (query.sort === "orders_desc") {
    orderBySql = sql`COALESCE(os.total_orders, 0) DESC, u.created_at DESC`;
  } else if (query.sort === "name_asc") {
    orderBySql = sql`u.full_name ASC`;
  }

  const countRes = await db.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM users u
    INNER JOIN roles r ON r.id = u.role_id
    WHERE ${whereClause}
  `);

  const total = Number((countRes.rows[0] as Record<string, unknown> | undefined)?.total ?? 0);
  const offset = (query.page - 1) * query.limit;

  const rowsRes = await db.execute(sql`
    WITH order_stats AS (
      SELECT
        o.user_id,
        COUNT(*)::int AS total_orders,
        COUNT(*) FILTER (
          WHERE o.payment_status = 'paid' AND o.order_status <> 'cancelled'
        )::int AS paid_orders_count,
        COALESCE(
          SUM(o.total_amount) FILTER (
            WHERE o.payment_status = 'paid' AND o.order_status <> 'cancelled'
          ),
          0
        )::numeric(12, 2) AS total_paid_spend,
        MAX(o.created_at) AS last_order_at
      FROM orders o
      GROUP BY o.user_id
    )
    SELECT
      u.id,
      u.full_name,
      u.email,
      u.phone,
      u.is_active,
      u.is_verified,
      u.created_at,
      COALESCE(os.total_orders, 0)::int AS total_orders,
      COALESCE(os.paid_orders_count, 0)::int AS paid_orders_count,
      COALESCE(os.total_paid_spend, 0)::numeric(12, 2)::text AS total_paid_spend,
      os.last_order_at
    FROM users u
    INNER JOIN roles r ON r.id = u.role_id
    LEFT JOIN order_stats os ON os.user_id = u.id
    WHERE ${whereClause}
    ORDER BY ${orderBySql}
    LIMIT ${query.limit}
    OFFSET ${offset}
  `);

  return {
    customers: rowsRes.rows.map((row) =>
      mapCustomerSummaryRow(row as Record<string, unknown>)
    ),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function getAdminCustomerById(
  customerId: string
): Promise<AdminCustomerDetailDTO> {
  const userRes = await db.execute(sql`
    SELECT
      u.id,
      u.full_name,
      u.email,
      u.phone,
      u.is_active,
      u.is_verified,
      u.created_at,
      u.updated_at,
      (
        SELECT COUNT(*)::int
        FROM sessions s
        WHERE s.user_id = u.id
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
      ) AS active_sessions_count,
      (
        SELECT COUNT(*)::int FROM orders o WHERE o.user_id = u.id
      ) AS total_orders,
      (
        SELECT COUNT(*)::int FROM orders o WHERE o.user_id = u.id AND o.order_status = 'delivered'
      ) AS delivered_orders,
      (
        SELECT COUNT(*)::int FROM orders o WHERE o.user_id = u.id AND o.order_status = 'cancelled'
      ) AS cancelled_orders,
      (
        SELECT COUNT(*)::int FROM orders o
        WHERE o.user_id = u.id AND o.payment_status = 'paid' AND o.order_status <> 'cancelled'
      ) AS paid_orders_count,
      (
        SELECT COALESCE(SUM(o.total_amount), 0)::numeric(12, 2)::text FROM orders o
        WHERE o.user_id = u.id AND o.payment_status = 'paid' AND o.order_status <> 'cancelled'
      ) AS total_paid_spend,
      (
        SELECT MAX(o.created_at) FROM orders o WHERE o.user_id = u.id
      ) AS last_order_at
    FROM users u
    INNER JOIN roles r ON r.id = u.role_id
    WHERE u.id = ${customerId}
      AND r.name = 'customer'
    LIMIT 1
  `);

  if (userRes.rows.length === 0) {
    throw new AppError("Customer not found.", 404, "CUSTOMER_NOT_FOUND");
  }

  const r = userRes.rows[0] as Record<string, unknown>;
  const summary = mapCustomerSummaryRow(r);

  const [addressRows, orderRows] = await Promise.all([
    db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, customerId))
      .orderBy(desc(addresses.isDefault), desc(addresses.createdAt)),
    db.execute(sql`
      SELECT
        o.id,
        o.order_number,
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
      WHERE o.user_id = ${customerId}
      ORDER BY o.created_at DESC
      LIMIT 100
    `),
  ]);

  return {
    customer: {
      ...summary,
      updatedAt: toIsoStringOrNull(r.updated_at) || summary.createdAt,
      deliveredOrders: Number(r.delivered_orders ?? 0),
      cancelledOrders: Number(r.cancelled_orders ?? 0),
      activeSessionsCount: Number(r.active_sessions_count ?? 0),
    },
    addresses: addressRows.map((a) => ({
      id: a.id,
      recipientName: a.recipientName,
      phone: a.phone,
      governorate: a.governorate,
      city: a.city,
      street: a.street,
      building: a.building ?? null,
      apartment: a.apartment ?? null,
      floor: a.floor ?? null,
      additionalInformation: a.additionalInformation ?? null,
      isDefault: a.isDefault,
      createdAt: a.createdAt.toISOString(),
    })),
    orders: orderRows.rows.map((row) => {
      const or = row as Record<string, unknown>;
      return {
        id: String(or.id),
        orderNumber: String(or.order_number),
        orderStatus: String(or.order_status),
        paymentStatus: String(or.payment_status),
        paymentMethod: String(or.payment_method),
        totalAmount: roundCurrency(Number(or.total_amount ?? 0)),
        itemCount: Number(or.item_count ?? 0),
        createdAt: toIsoStringOrNull(or.created_at) || new Date().toISOString(),
      };
    }),
  };
}

export async function updateAdminCustomerStatus(
  customerId: string,
  adminUserId: string,
  input: UpdateCustomerStatusInput
): Promise<{
  customer: AdminCustomerSummaryDTO;
  revokedSessionsCount: number;
}> {
  if (customerId === adminUserId) {
    throw new AppError(
      "You cannot change the status of your own account.",
      409,
      "SELF_MODIFICATION_FORBIDDEN"
    );
  }

  const revokedCount = await db.transaction(async (tx) => {
    const [target] = await tx
      .select({
        id: users.id,
        roleName: roles.name,
        isActive: users.isActive,
      })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(eq(users.id, customerId))
      .for("update")
      .limit(1);

    if (!target) {
      throw new AppError("Customer not found.", 404, "CUSTOMER_NOT_FOUND");
    }

    if (target.roleName !== "customer") {
      throw new AppError(
        "Admin accounts cannot be modified from customer management.",
        403,
        "ADMIN_ACCOUNT_PROTECTED"
      );
    }

    const now = new Date();
    await tx
      .update(users)
      .set({
        isActive: input.isActive,
        updatedAt: now,
      })
      .where(eq(users.id, customerId));

    let revokedSessionsCount = 0;
    if (!input.isActive) {
      const revoked = await tx
        .update(sessions)
        .set({ revokedAt: now })
        .where(and(eq(sessions.userId, customerId), isNull(sessions.revokedAt)))
        .returning({ id: sessions.id });
      revokedSessionsCount = revoked.length;
    }

    return revokedSessionsCount;
  });

  const detail = await getAdminCustomerById(customerId);
  return {
    customer: detail.customer,
    revokedSessionsCount: revokedCount,
  };
}
