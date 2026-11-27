import type { Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  adminNotificationReads,
  adminNotifications,
  orders,
  users,
} from "../db/schema.js";

export interface AdminNotificationDTO {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  totalAmount: number;
  orderStatus: string;
  createdAt: string;
  isRead: boolean;
  readAt: string | null;
}

const sseClients = new Map<string, Set<Response>>();

function logDatabaseFailure(operation: string, error: unknown): void {
  const wrapped = error instanceof Error && "cause" in error ? error.cause : error;
  const databaseError =
    typeof wrapped === "object" && wrapped !== null
      ? (wrapped as Record<string, unknown>)
      : {};

  console.error("Admin notification database operation failed", {
    operation,
    message: error instanceof Error ? error.message : "Unknown database error.",
    code: databaseError.code,
    table: databaseError.table,
    column: databaseError.column,
    constraint: databaseError.constraint,
  });
}

export function addNotificationSseClient(adminId: string, res: Response): () => void {
  const clients = sseClients.get(adminId) ?? new Set<Response>();
  clients.add(res);
  sseClients.set(adminId, clients);
  return () => {
    clients.delete(res);
    if (clients.size === 0) sseClients.delete(adminId);
  };
}

export async function createOrderNotification(orderId: string): Promise<void> {
  try {
    const inserted = await db
      .insert(adminNotifications)
      .values({ orderId })
      .onConflictDoNothing({ target: adminNotifications.orderId })
      .returning({ id: adminNotifications.id });

    if (inserted.length === 0) return;

    const [notification] = await db
      .select({
        id: adminNotifications.id,
        orderId: adminNotifications.orderId,
        orderNumber: orders.orderNumber,
        customerName: users.fullName,
        totalAmount: orders.totalAmount,
        orderStatus: orders.orderStatus,
        createdAt: adminNotifications.createdAt,
      })
      .from(adminNotifications)
      .innerJoin(orders, eq(orders.id, adminNotifications.orderId))
      .leftJoin(users, eq(users.id, orders.userId))
      .where(eq(adminNotifications.orderId, orderId))
      .limit(1);

    if (!notification) return;

    const payload = {
      type: "order.created",
      notification: {
        ...notification,
        customerName: notification.customerName ?? "Unknown customer",
        totalAmount: Number(notification.totalAmount),
        createdAt: notification.createdAt.toISOString(),
        isRead: false,
        readAt: null,
      },
    };
    for (const clients of sseClients.values()) {
      for (const res of clients) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    }
  } catch (error) {
    logDatabaseFailure("create order notification", error);
    throw error;
  }
}

export async function listAdminNotifications(
  adminId: string,
  limit = 50
): Promise<{ notifications: AdminNotificationDTO[]; unreadCount: number }> {
  const boundedLimit = Number.isFinite(limit)
    ? Math.min(Math.max(Math.trunc(limit), 1), 100)
    : 50;

  try {
    const rows = await db
      .select({
        id: adminNotifications.id,
        orderId: adminNotifications.orderId,
        orderNumber: orders.orderNumber,
        customerName: users.fullName,
        totalAmount: orders.totalAmount,
        orderStatus: orders.orderStatus,
        createdAt: adminNotifications.createdAt,
        readAt: adminNotificationReads.readAt,
      })
      .from(adminNotifications)
      .innerJoin(orders, eq(orders.id, adminNotifications.orderId))
      .leftJoin(users, eq(users.id, orders.userId))
      .leftJoin(
        adminNotificationReads,
        and(
          eq(adminNotificationReads.notificationId, adminNotifications.id),
          eq(adminNotificationReads.adminId, adminId)
        )
      )
      .orderBy(desc(adminNotifications.createdAt))
      .limit(boundedLimit);

    const notifications = rows.map((row) => ({
      id: row.id,
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      customerName: row.customerName ?? "Unknown customer",
      totalAmount: Number(row.totalAmount),
      orderStatus: row.orderStatus,
      createdAt: row.createdAt.toISOString(),
      isRead: Boolean(row.readAt),
      readAt: row.readAt?.toISOString() ?? null,
    }));

    return {
      notifications,
      unreadCount: notifications.filter((item) => !item.isRead).length,
    };
  } catch (error) {
    logDatabaseFailure("list notifications", error);
    throw error;
  }
}

export async function markAdminNotificationRead(
  adminId: string,
  notificationId: string
): Promise<void> {
  try {
    await db
      .insert(adminNotificationReads)
      .values({ notificationId, adminId })
      .onConflictDoNothing();
  } catch (error) {
    logDatabaseFailure("mark notification read", error);
    throw error;
  }
}

export async function markAllAdminNotificationsRead(adminId: string): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO admin_notification_reads (notification_id, admin_id, read_at)
      SELECT id, ${adminId}, NOW()
      FROM admin_notifications
      ON CONFLICT (notification_id, admin_id) DO NOTHING
    `);
  } catch (error) {
    logDatabaseFailure("mark all notifications read", error);
    throw error;
  }
}
