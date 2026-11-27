import assert from "node:assert/strict";
import test from "node:test";
import { createNotificationPoller } from "../../frontend/js/admin/notification-poller.js";
import { adminNotificationsQuerySchema } from "../validators/adminNotifications.validators.js";

function createFakeScheduler() {
  let nextId = 0;
  const callbacks = new Map<number, () => void>();
  const delays: number[] = [];

  return {
    delays,
    schedule(callback: () => void, delay: number) {
      const id = ++nextId;
      callbacks.set(id, callback);
      delays.push(delay);
      return id;
    },
    cancel(id: number) {
      callbacks.delete(id);
    },
    runNext() {
      const entry = callbacks.entries().next().value as
        | [number, () => void]
        | undefined;
      if (!entry) return false;
      const [id, callback] = entry;
      callbacks.delete(id);
      callback();
      return true;
    },
    get pendingCount() {
      return callbacks.size;
    },
  };
}

const flushAsync = () => new Promise<void>((resolve) => setImmediate(resolve));

test("notification limits default safely and reject malformed or out-of-range values", () => {
  assert.deepEqual(adminNotificationsQuerySchema.parse({}), { limit: 50 });
  assert.deepEqual(adminNotificationsQuerySchema.parse({ limit: "100" }), {
    limit: 100,
  });
  assert.equal(adminNotificationsQuerySchema.safeParse({ limit: "nope" }).success, false);
  assert.equal(adminNotificationsQuerySchema.safeParse({ limit: "0" }).success, false);
  assert.equal(adminNotificationsQuerySchema.safeParse({ limit: "101" }).success, false);
});

test("notification polling prevents overlap and schedules the next healthy poll", async () => {
  const scheduler = createFakeScheduler();
  let resolveFetch!: (value: { notifications: []; unreadCount: number }) => void;
  let calls = 0;
  const poller = createNotificationPoller({
    fetchNotifications: () => {
      calls += 1;
      return new Promise((resolve) => {
        resolveFetch = resolve;
      });
    },
    onSuccess: () => undefined,
    onError: () => undefined,
    onUnauthorized: () => undefined,
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });

  poller.start();
  assert.equal(calls, 1);
  assert.equal(poller.refresh(), false);
  assert.equal(calls, 1);
  resolveFetch({ notifications: [], unreadCount: 0 });
  await flushAsync();

  assert.deepEqual(scheduler.delays, [20_000]);
  assert.equal(scheduler.pendingCount, 1);
  poller.stop();
  assert.equal(scheduler.pendingCount, 0);
});

test("notification polling exponentially backs off after failures", async () => {
  const scheduler = createFakeScheduler();
  let calls = 0;
  const poller = createNotificationPoller({
    fetchNotifications: async () => {
      calls += 1;
      throw new Error("temporary database failure");
    },
    onSuccess: () => undefined,
    onError: () => undefined,
    onUnauthorized: () => undefined,
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });

  poller.start();
  await flushAsync();
  assert.deepEqual(scheduler.delays, [20_000]);

  scheduler.runNext();
  await flushAsync();
  assert.equal(calls, 2);
  assert.deepEqual(scheduler.delays, [20_000, 40_000]);
  poller.stop();
});

test("notification polling stops and requests session revalidation after auth failure", async () => {
  const scheduler = createFakeScheduler();
  let authFailures = 0;
  const poller = createNotificationPoller({
    fetchNotifications: async () => {
      throw Object.assign(new Error("session expired"), { status: 401 });
    },
    onSuccess: () => undefined,
    onError: () => undefined,
    onUnauthorized: () => {
      authFailures += 1;
    },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });

  poller.start();
  await flushAsync();
  assert.equal(authFailures, 1);
  assert.equal(scheduler.pendingCount, 0);
});
