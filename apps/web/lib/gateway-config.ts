const STORAGE_KEY = 'scooby:gateway-url';

export function getGatewayUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function setGatewayUrl(url: string): void {
  localStorage.setItem(STORAGE_KEY, url.replace(/\/+$/, ''));
}

export function clearGatewayConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Derive WebSocket URL from the gateway HTTP URL. */
export function getWsUrl(): string | null {
  const base = getGatewayUrl();
  if (!base) return null;
  const wsProto = base.startsWith('https') ? 'wss' : 'ws';
  const stripped = base.replace(/^https?:\/\//, '');
  return `${wsProto}://${stripped}/ws`;
}
