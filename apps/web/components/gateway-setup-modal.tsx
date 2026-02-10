'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { setGatewayUrl } from '../lib/gateway-config';

export function GatewaySetupModal({ onConnected }: { onConnected: (url: string) => void }) {
  const [url, setUrl] = useState('http://localhost:4000');
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = url.trim().replace(/\/+$/, '');
    if (!trimmed) {
      setError('URL is required');
      return;
    }

    try {
      new URL(trimmed);
    } catch {
      setError('Invalid URL format');
      return;
    }

    setTesting(true);
    try {
      const res = await fetch(`${trimmed}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setError('Could not reach the gateway. Check the URL and ensure your bot is running.');
      setTesting(false);
      return;
    }

    setGatewayUrl(trimmed);
    onConnected(trimmed);
  }

  return (
    <Dialog open>
      <DialogContent
        className="sm:max-w-md [&>button:last-of-type]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Connect to Scooby</DialogTitle>
          <DialogDescription>
            Enter the URL of your Scooby gateway to get started.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="gateway-url" className="text-sm font-medium text-neutral-700">
              Gateway URL
            </label>
            <Input
              id="gateway-url"
              placeholder="http://localhost:4000"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              autoFocus
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={testing}>
              {testing ? 'Connecting...' : 'Connect'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
