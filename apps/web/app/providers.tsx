'use client';

import { type ReactNode, useState, useEffect } from 'react';
import { GatewayProvider } from '@scooby/api-client/react';
import { getGatewayUrl } from '../lib/gateway-config';
import { GatewaySetupModal } from '../components/gateway-setup-modal';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Toaster } from '../components/ui/sonner';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

export function Providers({ children }: { children: ReactNode }) {
  const [gatewayUrl, setGatewayUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setGatewayUrl(getGatewayUrl());
  }, []);

  // SSR / initial hydration — render nothing until we've read localStorage
  if (gatewayUrl === undefined) return null;

  // No config yet — show setup modal
  if (gatewayUrl === null) {
    return <GatewaySetupModal onConnected={setGatewayUrl} />;
  }

  return (
    <GatewayProvider config={{ baseUrl: gatewayUrl }}>
      <NuqsAdapter>
        <TooltipPrimitive.Provider delayDuration={150}>
          {children}
          <Toaster position="bottom-right" />
        </TooltipPrimitive.Provider>
      </NuqsAdapter>
    </GatewayProvider>
  );
}
