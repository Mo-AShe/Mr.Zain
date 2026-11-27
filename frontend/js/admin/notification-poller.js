/** @type {(callback: () => void, delay: number) => number} */
const scheduleDefault = (callback, delay) => window.setTimeout(callback, delay);
/** @type {(timer: number) => void} */
const cancelDefault = (timer) => window.clearTimeout(timer);

export function createNotificationPoller({
  fetchNotifications,
  onSuccess,
  onError,
  onUnauthorized,
  intervalMs = 20_000,
  maxBackoffMs = 5 * 60_000,
  schedule = scheduleDefault,
  cancel = cancelDefault,
}) {
  let active = false;
  let inFlight = false;
  let timer = null;
  let failures = 0;
  let generation = 0;

  const scheduleNext = (delay, currentGeneration) => {
    if (!active || currentGeneration !== generation) return;
    timer = schedule(() => {
      timer = null;
      void poll(currentGeneration);
    }, delay);
  };

  const poll = async (currentGeneration) => {
    if (!active || currentGeneration !== generation || inFlight) return;
    inFlight = true;

    try {
      const result = await fetchNotifications();
      if (!active || currentGeneration !== generation) return;
      failures = 0;
      onSuccess(result);
      scheduleNext(intervalMs, currentGeneration);
    } catch (error) {
      if (!active || currentGeneration !== generation) return;
      if (error?.status === 401 || error?.status === 403) {
        stop();
        onUnauthorized(error);
        return;
      }

      failures += 1;
      onError(error, failures);
      scheduleNext(
        Math.min(intervalMs * 2 ** (failures - 1), maxBackoffMs),
        currentGeneration
      );
    } finally {
      inFlight = false;
    }
  };

  const start = () => {
    if (active) return;
    active = true;
    generation += 1;
    void poll(generation);
  };

  const refresh = () => {
    if (!active || inFlight) return false;
    if (timer !== null) cancel(timer);
    timer = null;
    void poll(generation);
    return true;
  };

  const stop = () => {
    active = false;
    generation += 1;
    if (timer !== null) cancel(timer);
    timer = null;
  };

  return { start, stop, refresh };
}
