'use client';

import { useState } from 'react';
import { MODELS, MODEL_PROVIDER_SLUGS } from '@scooby/schemas';
import { formatModelName, getProviderLogo, MODEL_PROVIDERS } from '@/lib/utils';
import { Check, ChevronDown, Cpu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

interface ModelPickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  allowClear?: boolean;
}

const ALIAS_OPTIONS = [
  { value: 'fast', label: 'Fast (auto)', description: 'Automatically selects the fastest model' },
  { value: 'slow', label: 'Slow (auto)', description: 'Automatically selects the most capable model' },
];

export function ModelPicker({ value, onChange, label, allowClear }: ModelPickerProps) {
  const [open, setOpen] = useState(false);

  // Group models by provider
  const grouped = new Map<string, typeof MODELS>();
  for (const model of MODELS) {
    if (model.type !== 'language') continue;
    const existing = grouped.get(model.owned_by) ?? [];
    existing.push(model);
    grouped.set(model.owned_by, existing);
  }

  const aliasMatch = ALIAS_OPTIONS.find((a) => a.value === value);
  const displayValue = aliasMatch?.label ?? (value ? formatModelName(value) : '');
  const providerLogo = value && !aliasMatch ? getProviderLogo(value) : null;

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-xs font-medium text-neutral-500">{label}</label>
      )}

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'w-full flex items-center gap-2 h-9 px-3 rounded-md border border-neutral-200 bg-white text-left',
          'hover:border-neutral-300 transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500',
        )}
      >
        <div className="h-5 w-5 rounded flex items-center justify-center shrink-0 overflow-hidden">
          {providerLogo ? (
            <img src={providerLogo} alt="" className="h-3.5 w-3.5 object-contain" />
          ) : (
            <Cpu className="h-3.5 w-3.5 text-neutral-400" />
          )}
        </div>
        <span className={cn(
          'flex-1 text-sm truncate',
          value ? 'text-neutral-900' : 'text-neutral-400',
        )}>
          {displayValue || 'Select model'}
        </span>
        {allowClear && value ? (
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            className="shrink-0 p-0.5 rounded hover:bg-neutral-100 transition-colors"
          >
            <X className="h-3 w-3 text-neutral-400" />
          </span>
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
        )}
      </button>

      {/* Searchable command dialog */}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command className="rounded-xl">
          <CommandInput placeholder="Search models or providers..." />
          <CommandList className="max-h-[400px]">
            <CommandEmpty>
              <div className="flex flex-col items-center gap-2 py-4">
                <Cpu className="h-5 w-5 text-neutral-400" />
                <span className="text-sm text-neutral-500">No models found</span>
              </div>
            </CommandEmpty>

            {/* Aliases */}
            <CommandGroup heading="Aliases">
              {ALIAS_OPTIONS.map((opt) => {
                const isSelected = value === opt.value;
                return (
                  <CommandItem
                    key={opt.value}
                    value={`alias ${opt.label} ${opt.description}`}
                    onSelect={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className="flex items-center gap-3 py-2 px-3 cursor-pointer"
                  >
                    <div className="h-6 w-6 rounded-md bg-neutral-100 flex items-center justify-center shrink-0">
                      <Cpu className="h-3.5 w-3.5 text-neutral-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-neutral-900">{opt.label}</span>
                      <p className="text-[11px] text-neutral-400 truncate">{opt.description}</p>
                    </div>
                    {isSelected && (
                      <div className="h-5 w-5 rounded-full bg-accent-100 flex items-center justify-center shrink-0">
                        <Check className="h-3 w-3 text-accent-600" />
                      </div>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>

            {/* Models grouped by provider */}
            {Array.from(grouped.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([provider, models]) => {
                const providerMeta = MODEL_PROVIDERS[provider];
                return (
                  <CommandGroup
                    key={provider}
                    heading={
                      <div className="flex items-center gap-1.5 px-1">
                        {providerMeta?.logo && (
                          <div className="h-4 w-4 rounded overflow-hidden flex items-center justify-center">
                            <img
                              src={providerMeta.logo}
                              alt={provider}
                              className="h-3.5 w-3.5 object-contain"
                            />
                          </div>
                        )}
                        <span>{providerMeta?.name ?? provider}</span>
                      </div>
                    }
                  >
                    {models.map((model) => {
                      const isSelected = value === model.id;
                      const modelLogo = getProviderLogo(model.id);
                      // Include provider name in search value so searching "anthropic" finds all Anthropic models
                      const searchValue = `${providerMeta?.name ?? provider} ${model.name} ${model.id}`;

                      return (
                        <CommandItem
                          key={model.id}
                          value={searchValue}
                          onSelect={() => {
                            onChange(model.id);
                            setOpen(false);
                          }}
                          className="flex items-center gap-3 py-2 px-3 cursor-pointer"
                        >
                          <div className="h-6 w-6 rounded-md bg-neutral-50 border border-neutral-200 flex items-center justify-center shrink-0 overflow-hidden">
                            {modelLogo ? (
                              <img src={modelLogo} alt="" className="h-3.5 w-3.5 object-contain" />
                            ) : (
                              <Cpu className="h-3.5 w-3.5 text-neutral-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-neutral-900 truncate block">
                              {model.name}
                            </span>
                            <span className="text-[11px] text-neutral-400 font-mono truncate block">
                              {model.id}
                            </span>
                          </div>
                          {isSelected && (
                            <div className="h-5 w-5 rounded-full bg-accent-100 flex items-center justify-center shrink-0">
                              <Check className="h-3 w-3 text-accent-600" />
                            </div>
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                );
              })}
          </CommandList>
        </Command>
      </CommandDialog>
    </div>
  );
}
