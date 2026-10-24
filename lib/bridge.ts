// window.postMessage protocol between Money Manager's MAIN world script
// (which holds the MX session) and the ISOLATED world UI (which can reach
// the extension). Amazon data stays on the ISOLATED side: the MAIN side only
// receives MX operations.
import type { Changes, SplitPart } from './mx/api';
import type { Category, RawTransaction } from './mx/session';

const MAIN = 'becu-mx-amz/main';
const ISOLATED = 'becu-mx-amz/isolated';

export interface Snapshot {
  hasSession: boolean;
  categories: Category[];
  transactions: RawTransaction[];
}

export type Call =
  | { op: 'recategorize'; guid: string; changes: Changes }
  | { op: 'split'; guid: string; parts: SplitPart[] }
  | { op: 'unsplit'; guid: string };

type FromMain =
  | { source: typeof MAIN; kind: 'snapshot'; snapshot: Snapshot }
  | { source: typeof MAIN; kind: 'result'; id: number; ok: boolean; value?: unknown; error?: string };

type FromIsolated =
  | { source: typeof ISOLATED; kind: 'hello' }
  | { source: typeof ISOLATED; kind: 'call'; id: number; call: Call };

function listen<T extends { source: string }>(source: string, fn: (msg: T) => void) {
  window.addEventListener('message', (e) => {
    if (e.source === window && e.origin === location.origin && e.data?.source === source) fn(e.data as T);
  });
}

const post = (msg: FromMain | FromIsolated) => window.postMessage(msg, location.origin);

// MAIN side
export function serveBridge(snapshot: () => Snapshot, handle: (call: Call) => Promise<unknown>) {
  const send = () => post({ source: MAIN, kind: 'snapshot', snapshot: snapshot() });
  listen<FromIsolated>(ISOLATED, (msg) => {
    if (msg.kind === 'hello') return send();
    handle(msg.call).then(
      (value) => post({ source: MAIN, kind: 'result', id: msg.id, ok: true, value }),
      (err: Error) => post({ source: MAIN, kind: 'result', id: msg.id, ok: false, error: err.message }),
    );
  });
  return send;
}

// ISOLATED side
let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

export function connectBridge(onSnapshot: (s: Snapshot) => void) {
  listen<FromMain>(MAIN, (msg) => {
    if (msg.kind === 'snapshot') return onSnapshot(msg.snapshot);
    const waiter = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.ok) waiter?.resolve(msg.value);
    else waiter?.reject(new Error(msg.error));
  });
  post({ source: ISOLATED, kind: 'hello' });
}

export function callMain<T = unknown>(call: Call): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    post({ source: ISOLATED, kind: 'call', id, call });
  });
}
