import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '-';
  return num.toLocaleString();
}

export function formatLargeNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(2) + 'B';
  }
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(2) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + 'K';
  }
  return num.toLocaleString();
}

export function formatDuration(seconds?: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds <= 0) return '—';

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    if (hours > 0) return `${days}d ${hours}h`;
    return `${days}d`;
  }
  if (hours > 0) {
    if (minutes > 0) return `${hours}h ${minutes}m`;
    return `${hours}h`;
  }
  return `${minutes}m`;
}

/**
 * Format duration from milliseconds (matches default gateway dashboard format)
 */
export function formatDurationMs(ms?: number | null): string {
  if (ms === null || ms === undefined) return '—';
  if (ms <= 0) return '—';

  if (ms < 1000) return `${ms}ms`;

  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;

  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;

  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h`;

  const day = Math.round(hr / 24);
  return `${day}d`;
}

export function formatMemory(bytes?: number | null): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 0) return '—';
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const base = 1024;
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(base)), units.length - 1);
  const value = bytes / Math.pow(base, exponent);

  if (exponent === 0) return `${bytes} B`;
  if (value >= 100) return `${Math.round(value)} ${units[exponent]}`;
  if (value >= 10) return `${value.toFixed(1)} ${units[exponent]}`;
  return `${value.toFixed(2)} ${units[exponent]}`;
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatPercentage(value: number | null | undefined, decimals: number = 1): string {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(decimals)}%`;
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.substring(0, length) + '...';
}

/**
 * Format a number as currency
 * 
 * @param amount - The amount to format
 * @param options - Formatting options
 * @returns Formatted currency string
 * 
 * @example
 * formatCurrency(1234.56)           // "$1,234.56"
 * formatCurrency(0.005)             // "<$0.01"
 * formatCurrency(1500000)           // "$1.50M"
 * formatCurrency(1234, { compact: false }) // "$1,234.00"
 * formatCurrency(50, { currency: 'EUR', locale: 'de-DE' }) // "50,00 €"
 */
export function formatCurrency(
  amount: number | null | undefined,
  options: {
    currency?: string;
    locale?: string;
    compact?: boolean;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    showPlusSign?: boolean;
  } = {}
): string {
  if (amount === null || amount === undefined) return '—';
  
  const {
    currency = 'USD',
    locale = 'en-US',
    compact = true,
    minimumFractionDigits,
    maximumFractionDigits,
    showPlusSign = false,
  } = options;

  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : (showPlusSign && amount > 0 ? '+' : '');
  
  // Handle very small amounts
  if (absAmount > 0 && absAmount < 0.01) {
    const symbol = getCurrencySymbol(currency, locale);
    return `<${symbol}0.01`;
  }

  // Compact formatting for large numbers
  if (compact) {
    if (absAmount >= 1_000_000_000) {
      return `${sign}${formatCurrencyValue(absAmount / 1_000_000_000, currency, locale, 2)}B`;
    }
    if (absAmount >= 1_000_000) {
      return `${sign}${formatCurrencyValue(absAmount / 1_000_000, currency, locale, 2)}M`;
    }
    if (absAmount >= 10_000) {
      return `${sign}${formatCurrencyValue(absAmount / 1_000, currency, locale, 1)}K`;
    }
  }

  // Standard formatting
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: minimumFractionDigits ?? (absAmount < 1 ? 2 : absAmount < 100 ? 2 : 0),
    maximumFractionDigits: maximumFractionDigits ?? 2,
  });

  const formatted = formatter.format(absAmount);
  return amount < 0 ? `-${formatted}` : (showPlusSign && amount > 0 ? `+${formatted}` : formatted);
}

/**
 * Get currency symbol for a given currency code
 */
function getCurrencySymbol(currency: string, locale: string): string {
  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    // Format 0 and extract just the symbol
    const formatted = formatter.format(0);
    return formatted.replace(/[\d\s.,]/g, '').trim() || '$';
  } catch {
    return '$';
  }
}

/**
 * Format currency value without the full Intl formatting (for compact display)
 */
function formatCurrencyValue(
  value: number,
  currency: string,
  locale: string,
  decimals: number
): string {
  const symbol = getCurrencySymbol(currency, locale);
  const formatted = value.toFixed(decimals);
  // Remove trailing zeros after decimal point
  const cleaned = formatted.replace(/\.?0+$/, '') || '0';
  return `${symbol}${cleaned}`;
}

/**
 * Format tokens with appropriate suffix (K, M, B)
 */
export function formatTokens(tokens: number | null | undefined): string {
  if (tokens === null || tokens === undefined) return '—';
  if (tokens < 0) return '—';

  if (tokens >= 1_000_000_000) {
    return `${(tokens / 1_000_000_000).toFixed(1)}B`;
  }
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}k`;
  }
  return tokens.toString();
}

/**
 * Provider metadata for model display
 */
export const MODEL_PROVIDERS: Record<string, { name: string; logo: string }> = {
  anthropic: { name: 'Anthropic', logo: '/provider-logos/anthropic.svg' },
  openai: { name: 'OpenAI', logo: '/provider-logos/openai.svg' },
  google: { name: 'Google', logo: '/provider-logos/google.svg' },
  meta: { name: 'Meta', logo: '/provider-logos/meta.svg' },
  'meta-llama': { name: 'Meta', logo: '/provider-logos/meta.svg' },
  mistral: { name: 'Mistral', logo: '/provider-logos/mistral.svg' },
  mistralai: { name: 'Mistral', logo: '/provider-logos/mistral.svg' },
  cohere: { name: 'Cohere', logo: '/provider-logos/cohere.svg' },
  deepseek: { name: 'DeepSeek', logo: '/provider-logos/deepseek.svg' },
  xai: { name: 'xAI', logo: '/provider-logos/xai.svg' },
  'x-ai': { name: 'xAI', logo: '/provider-logos/xai.svg' },
  perplexity: { name: 'Perplexity', logo: '/provider-logos/perplexity.svg' },
  groq: { name: 'Groq', logo: '/provider-logos/groq.svg' },
  amazon: { name: 'Amazon', logo: '/provider-logos/amazon.svg' },
  fireworks: { name: 'Fireworks', logo: '/provider-logos/fireworks.svg' },
  deepinfra: { name: 'DeepInfra', logo: '/provider-logos/deepinfra.svg' },
  microsoft: { name: 'Microsoft', logo: '/provider-logos/microsoft.svg' },
};

/**
 * Get provider logo path from model string
 */
export function getProviderLogo(model: string): string | null {
  const modelLower = model.toLowerCase();

  // Check for provider prefix first (e.g., "anthropic/claude-3")
  const prefixMatch = model.match(/^([^/]+)\//);
  if (prefixMatch) {
    const prefix = prefixMatch[1].toLowerCase();
    if (MODEL_PROVIDERS[prefix]) {
      return MODEL_PROVIDERS[prefix].logo;
    }
  }

  // Fall back to model name pattern matching
  if (modelLower.includes('claude')) return '/provider-logos/anthropic.svg';
  if (modelLower.includes('gpt') || modelLower.includes('o1')) return '/provider-logos/openai.svg';
  if (modelLower.includes('gemini')) return '/provider-logos/google.svg';
  if (modelLower.includes('llama')) return '/provider-logos/meta.svg';
  if (modelLower.includes('mistral') || modelLower.includes('mixtral')) return '/provider-logos/mistral.svg';
  if (modelLower.includes('command')) return '/provider-logos/cohere.svg';
  if (modelLower.includes('deepseek')) return '/provider-logos/deepseek.svg';
  if (modelLower.includes('grok')) return '/provider-logos/xai.svg';
  if (modelLower.includes('nova')) return '/provider-logos/nova.svg';
  if (modelLower.includes('titan')) return '/provider-logos/amazon.svg';

  return null;
}

/**
 * Extract provider name from model string
 */
export function getProviderFromModel(model: string): string {
  // Check for explicit provider prefix
  const prefixMatch = model.match(/^([^/]+)\//);
  if (prefixMatch) {
    const prefix = prefixMatch[1].toLowerCase();
    return MODEL_PROVIDERS[prefix]?.name || prefix.charAt(0).toUpperCase() + prefix.slice(1);
  }

  // Infer from model name
  const modelLower = model.toLowerCase();
  if (modelLower.includes('claude')) return 'Anthropic';
  if (modelLower.includes('gpt') || modelLower.includes('o1') || modelLower.includes('o3')) return 'OpenAI';
  if (modelLower.includes('gemini')) return 'Google';
  if (modelLower.includes('llama')) return 'Meta';
  if (modelLower.includes('mistral') || modelLower.includes('mixtral')) return 'Mistral';
  if (modelLower.includes('command')) return 'Cohere';
  if (modelLower.includes('deepseek')) return 'DeepSeek';
  if (modelLower.includes('grok')) return 'xAI';

  return 'Other';
}

/**
 * Format model name for display
 */
export function formatModelName(model: string): string {
  // Handle paths like "anthropic/claude-3-opus" or "openai/gpt-4"
  const lastPart = model.split('/').pop() || model;
  // Clean up and format
  return lastPart
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/(\d+)([a-z])/gi, '$1 $2') // Add space between numbers and letters
    .trim();
}
