type StreamEntry = {
  userId: string;
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
};

// Route handlers are evaluated per-request and may land in different module
// instances, so a module-level Map would give the writer (POST /segments) and
// the reader (GET /stream) separate registries and broadcasts would vanish.
// Parking the registry on globalThis keeps one hub per process.
const registry = globalThis as typeof globalThis & {
  __captionSseClients?: Map<string, Set<StreamEntry>>;
};
const clients: Map<string, Set<StreamEntry>> = (registry.__captionSseClients ??= new Map());

export function addClient(userId: string, controller: ReadableStreamDefaultController) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  const encoder = new TextEncoder();
  const entry: StreamEntry = { userId, controller, encoder };
  clients.get(userId)!.add(entry);
  controller.enqueue(encoder.encode("event: connected\ndata: {}\n\n"));
  return () => {
    const set = clients.get(userId);
    if (set) {
      set.delete(entry);
      if (set.size === 0) clients.delete(userId);
    }
  };
}

export function broadcast(userId: string, event: string, data: unknown) {
  const set = clients.get(userId);
  if (!set || set.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const entry of set) {
    try {
      entry.controller.enqueue(entry.encoder.encode(payload));
    } catch {
      set.delete(entry);
    }
  }
}

/** Number of live listeners; used by the dev check script. */
export function clientCount(userId: string) {
  return clients.get(userId)?.size ?? 0;
}
