import { z } from "zod";
import { AppError } from "../middleware/errorHandler.js";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

function isValidCalendarDate(dateStr: string): boolean {
  if (!ISO_DATE_RE.test(dateStr)) return false;
  const [yStr, mStr, dStr] = dateStr.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

function toUtcMidnightMs(dateStr: string): number {
  const [yStr, mStr, dStr] = dateStr.split("-");
  return Date.UTC(Number(yStr), Number(mStr) - 1, Number(dStr));
}

function formatUtcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function getCairoTodayDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export const salesQuerySchema = z
  .object({
    startDate: z.string().trim().optional(),
    endDate: z.string().trim().optional(),
    days: z.coerce.number().int().min(1).max(365).optional(),
  })
  .superRefine((data, ctx) => {
    const hasStart = Boolean(data.startDate);
    const hasEnd = Boolean(data.endDate);

    if (hasStart !== hasEnd) {
      ctx.addIssue({
        code: "custom",
        path: [hasStart ? "endDate" : "startDate"],
        message: "Both startDate and endDate are required when specifying a custom range.",
      });
      return;
    }

    if (data.startDate && !isValidCalendarDate(data.startDate)) {
      ctx.addIssue({
        code: "custom",
        path: ["startDate"],
        message: "startDate must be a valid YYYY-MM-DD calendar date.",
      });
    }

    if (data.endDate && !isValidCalendarDate(data.endDate)) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "endDate must be a valid YYYY-MM-DD calendar date.",
      });
    }

    if (
      data.startDate &&
      data.endDate &&
      isValidCalendarDate(data.startDate) &&
      isValidCalendarDate(data.endDate)
    ) {
      const startMs = toUtcMidnightMs(data.startDate);
      const endMs = toUtcMidnightMs(data.endDate);
      if (startMs > endMs) {
        ctx.addIssue({
          code: "custom",
          path: ["startDate"],
          message: "startDate cannot be after endDate.",
        });
      } else {
        const diffDays = Math.floor((endMs - startMs) / 86_400_000) + 1;
        if (diffDays > MAX_RANGE_DAYS) {
          ctx.addIssue({
            code: "custom",
            path: ["endDate"],
            message: `Date range cannot exceed ${MAX_RANGE_DAYS} days.`,
          });
        }
      }
    }
  });

export type SalesQueryInput = z.infer<typeof salesQuerySchema>;

export interface ResolvedSalesRange {
  startDate: string;
  endDate: string;
  days: number;
  timezone: "Africa/Cairo";
}

export function resolveSalesDateRange(query: SalesQueryInput): ResolvedSalesRange {
  if (query.startDate && query.endDate) {
    const startMs = toUtcMidnightMs(query.startDate);
    const endMs = toUtcMidnightMs(query.endDate);
    if (startMs > endMs) {
      throw new AppError("startDate cannot be after endDate.", 422, "VALIDATION_ERROR");
    }
    const days = Math.floor((endMs - startMs) / 86_400_000) + 1;
    return {
      startDate: query.startDate,
      endDate: query.endDate,
      days,
      timezone: "Africa/Cairo",
    };
  }

  const days = query.days ?? 30;
  const endDate = getCairoTodayDateString();
  const endMs = toUtcMidnightMs(endDate);
  const startMs = endMs - (days - 1) * 86_400_000;

  return {
    startDate: formatUtcDate(startMs),
    endDate,
    days,
    timezone: "Africa/Cairo",
  };
}
