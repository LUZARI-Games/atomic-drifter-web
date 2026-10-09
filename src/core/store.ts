// Minimal state container: holds the current state and notifies listeners.
// Renderer and UI read from here; they never own game state.

type Listener<S> = (state: S) => void;

export class Store<S> {
  private listeners = new Set<Listener<S>>();

  constructor(private state: S) {}

  get(): S {
    return this.state;
  }

  /** Apply a pure update function; notifies only when the state changed. */
  update(fn: (state: S) => S): void {
    const next = fn(this.state);
    if (next === this.state) return;
    this.state = next;
    this.listeners.forEach((l) => l(next));
  }

  subscribe(listener: Listener<S>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
