// Conversations in the Fallout 3 style: the other side says a line, the player picks one of the numbered answers.
// Content in src/data/dialogs.json: { <id>: { speaker, start, nodes: { <node>: { text, event?, options } } } }.
// `next: null` ends the conversation. A node's `event` fires when the node is shown (e.g. the enemy ship arrives).
// Text placeholders: {captain} {ship} {crew}. Pure functions, engine-neutral.
import DIALOGS from '../data/dialogs.json';

export interface DialogOption {
  text: string;
  next: string | null;
}
export interface DialogNode {
  text: string;
  event?: string;
  options: DialogOption[];
}
export interface Dialog {
  speaker: { name: string; title: string; portrait: string; silhouette?: boolean };
  start: string;
  nodes: Record<string, DialogNode>;
}

export function dialogById(id: string): Dialog | null {
  return (DIALOGS as unknown as Record<string, Dialog>)[id] ?? null;
}

/** The node an answer leads to (null = the conversation ends). */
export function answer(d: Dialog, node: string, option: number): string | null {
  return d.nodes[node]?.options[option]?.next ?? null;
}

/** Every event of the nodes not seen yet on the way from `node` to the end (SKIP still triggers them, in order). */
export function eventsAhead(d: Dialog, node: string | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let n = node;
  while (n && !seen.has(n)) {
    seen.add(n);
    const e = d.nodes[n]?.event;
    if (e) out.push(e);
    n = d.nodes[n]?.options[0]?.next ?? null;
  }
  return out;
}

/** Fill {placeholders}. */
export function fillText(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

/** "BOLT", "SAMANTHA", "KAAN" -> "Bolt, Samantha and Kaan". */
export function nameList(names: string[]): string {
  const nice = names.map((n) => n.toLowerCase().replace(/(^|[\s-])\w/g, (c) => c.toUpperCase()));
  return nice.length <= 1 ? (nice[0] ?? '') : `${nice.slice(0, -1).join(', ')} and ${nice.at(-1)}`;
}
