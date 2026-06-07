export function normalizeWingsSocketUrl(socket: string, hostOverride?: string): string {
  if (!hostOverride) {
    return socket;
  }

  try {
    const url = new URL(socket);
    const [hostname, port] = hostOverride.includes(":")
      ? (hostOverride.split(":", 2) as [string, string])
      : [hostOverride, url.port];

    url.hostname = hostname;
    if (port) {
      url.port = port;
    }
    return url.toString();
  } catch {
    return socket;
  }
}
