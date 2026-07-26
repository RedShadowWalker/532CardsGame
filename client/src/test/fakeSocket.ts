/**
 * fakeSocket.ts
 * A minimal stand-in for socket.io-client's Socket, used only in tests.
 * Supports on/off/emit(withAck) — the only surface useGame/useSocket touch —
 * plus test helpers to simulate the server pushing an event or to control
 * what a given emit's ack callback resolves with.
 */

type Handler = (...args: any[]) => void;

export class FakeSocket {
  connected = true;
  private listeners = new Map<string, Set<Handler>>();
  private ackResponders = new Map<string, (payload: any) => any>();
  emitted: { event: string; payload: any }[] = [];

  on(event: string, handler: Handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    return this;
  }

  off(event: string, handler: Handler) {
    this.listeners.get(event)?.delete(handler);
    return this;
  }

  once(event: string, handler: Handler) {
    const wrapped: Handler = (...args) => {
      this.off(event, wrapped);
      handler(...args);
    };
    return this.on(event, wrapped);
  }

  emit(event: string, payload?: any, ack?: (res: any) => void) {
    this.emitted.push({ event, payload });
    if (ack) {
      const responder = this.ackResponders.get(event);
      const res = responder ? responder(payload) : { ok: true };
      ack(res);
    }
    return this;
  }

  /** Test helper: simulates the server pushing a broadcast event to this socket. */
  trigger(event: string, payload: any) {
    this.listeners.get(event)?.forEach((h) => h(payload));
  }

  /** Test helper: controls what a given event's ack callback resolves with. */
  setAckResponder(event: string, fn: (payload: any) => any) {
    this.ackResponders.set(event, fn);
  }

  lastEmitted(event: string) {
    return [...this.emitted].reverse().find((e) => e.event === event)?.payload;
  }
}
