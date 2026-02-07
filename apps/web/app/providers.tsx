'use client';

import type { ReactNode } from 'react';
import { GatewayProvider } from '@scooby/api-client/react';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:3000';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <GatewayProvider config={{ baseUrl: GATEWAY_URL }}>
      {children}
    </GatewayProvider>
  );
}
