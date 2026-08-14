type Listener = () => void;

const store = globalThis as typeof globalThis & {
  makanRelay?: Map<string, Set<Listener>>;
};

const listeners = (store.makanRelay ??= new Map<string, Set<Listener>>());

export const subscribe = (sessionId: string, listener: Listener) => {
  const room = listeners.get(sessionId) ?? new Set<Listener>();
  listeners.set(sessionId, room);
  room.add(listener);
  return () => {
    room.delete(listener);
    if (room.size === 0) listeners.delete(sessionId);
  };
};

export const publish = (sessionId: string) => {
  for (const listener of listeners.get(sessionId) ?? []) listener();
};

export const rooms = () => listeners.size;
