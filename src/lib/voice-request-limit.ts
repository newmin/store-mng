// Best-effort protection against repeated session creation within a server instance.
export function createVoiceRequestLimit(now: () => number = Date.now) {
  const clients = new Map<string, number>();
  let windowStart = now();
  let total = 0;
  return (client: string) => {
    const at = now();
    if (at - windowStart >= 60000) {
      clients.clear();
      total = 0;
      windowStart = at;
    }
    const count = clients.get(client) || 0;
    if (count >= 6 || total >= 30) return false;
    clients.set(client, count + 1);
    total++;
    return true;
  };
}
