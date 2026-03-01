import {
  RECONNECT_DELAY_MS,
  RECONNECT_MAX_DELAY_MS,
  RECONNECT_MAX_ATTEMPTS,
} from '@farscry/shared';

export class ReconnectionManager {
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  get currentAttempt() {
    return this.attempt;
  }

  get exhausted() {
    return this.attempt >= RECONNECT_MAX_ATTEMPTS;
  }

  scheduleReconnect(connect: () => void): void {
    if (this.exhausted) return;

    const delay = Math.min(
      RECONNECT_DELAY_MS * Math.pow(2, this.attempt),
      RECONNECT_MAX_DELAY_MS,
    );

    this.timer = setTimeout(() => {
      this.attempt++;
      connect();
    }, delay);
  }

  reset() {
    this.attempt = 0;
    this.cancelPending();
  }

  cancelPending() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
