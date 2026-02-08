'use client';

import { useState, useEffect, useMemo } from 'react';
import { Clock, Calendar, Repeat, Code, ChevronDown, Info } from 'lucide-react';
import { Input } from './ui/input';
import { Badge } from './ui/badge';

export type ScheduleType = 'interval' | 'daily' | 'weekly' | 'cron';

export interface ScheduleValue {
  type: ScheduleType;
  // For interval
  intervalValue?: number;
  intervalUnit?: 'seconds' | 'minutes' | 'hours' | 'days';
  // For daily/weekly
  time?: string; // HH:MM format
  // For weekly
  days?: number[]; // 0-6, Sunday = 0
  // For cron
  cronExpression?: string;
}

interface SchedulePickerProps {
  value: ScheduleValue;
  onChange: (value: ScheduleValue) => void;
  compact?: boolean;
}

const SCHEDULE_TYPES: {
  id: ScheduleType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'interval', label: 'Interval', icon: Repeat },
  { id: 'daily', label: 'Daily', icon: Clock },
  { id: 'weekly', label: 'Weekly', icon: Calendar },
  { id: 'cron', label: 'Custom', icon: Code },
];

const INTERVAL_UNITS: { value: ScheduleValue['intervalUnit']; label: string; short: string }[] = [
  { value: 'seconds', label: 'Seconds', short: 's' },
  { value: 'minutes', label: 'Minutes', short: 'm' },
  { value: 'hours', label: 'Hours', short: 'h' },
  { value: 'days', label: 'Days', short: 'd' },
];

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday', short: 'S' },
  { value: 1, label: 'Monday', short: 'M' },
  { value: 2, label: 'Tuesday', short: 'T' },
  { value: 3, label: 'Wednesday', short: 'W' },
  { value: 4, label: 'Thursday', short: 'T' },
  { value: 5, label: 'Friday', short: 'F' },
  { value: 6, label: 'Saturday', short: 'S' },
];

const PRESET_INTERVALS = [
  { label: '5 min', value: 5, unit: 'minutes' as const },
  { label: '15 min', value: 15, unit: 'minutes' as const },
  { label: '30 min', value: 30, unit: 'minutes' as const },
  { label: '1 hour', value: 1, unit: 'hours' as const },
  { label: '6 hours', value: 6, unit: 'hours' as const },
  { label: '12 hours', value: 12, unit: 'hours' as const },
  { label: '1 day', value: 1, unit: 'days' as const },
];

const PRESET_TIMES = [
  { label: '6:00 AM', value: '06:00' },
  { label: '9:00 AM', value: '09:00' },
  { label: '12:00 PM', value: '12:00' },
  { label: '3:00 PM', value: '15:00' },
  { label: '6:00 PM', value: '18:00' },
  { label: '9:00 PM', value: '21:00' },
];

const CRON_PRESETS = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every day at midnight', value: '0 0 * * *' },
  { label: 'Every Monday at 9 AM', value: '0 9 * * 1' },
  { label: 'First of month at 9 AM', value: '0 9 1 * *' },
];

export function SchedulePicker({ value, onChange, compact }: SchedulePickerProps) {
  const [showUnitDropdown, setShowUnitDropdown] = useState(false);

  // Human-readable description of the schedule
  const scheduleDescription = useMemo(() => {
    return getScheduleDescription(value);
  }, [value]);

  const updateValue = (updates: Partial<ScheduleValue>) => {
    onChange({ ...value, ...updates });
  };

  return (
    <div className="space-y-4">
      {/* Schedule Type Selector */}
      <div>
        <label className="text-xs font-medium text-neutral-500 mb-2 block">Schedule Type</label>
        <div className="flex gap-1 p-1 bg-neutral-100 rounded-lg">
          {SCHEDULE_TYPES.map((type) => {
            const Icon = type.icon;
            const isActive = value.type === type.id;
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => updateValue({ type: type.id })}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                  isActive
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className={compact ? 'hidden sm:inline' : ''}>{type.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Interval Configuration */}
      {value.type === 'interval' && (
        <div className="space-y-3">
          <label className="text-xs font-medium text-neutral-500 block">Run every</label>

          {/* Preset buttons */}
          <div className="flex flex-wrap gap-2">
            {PRESET_INTERVALS.map((preset) => {
              const isActive =
                value.intervalValue === preset.value && value.intervalUnit === preset.unit;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() =>
                    updateValue({ intervalValue: preset.value, intervalUnit: preset.unit })
                  }
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                    isActive
                      ? 'bg-neutral-900 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Custom interval input */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type="number"
                min={1}
                value={value.intervalValue || ''}
                onChange={(e) => updateValue({ intervalValue: parseInt(e.target.value) || 1 })}
                placeholder="Enter value"
                className="pr-3"
              />
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowUnitDropdown(!showUnitDropdown)}
                className="h-10 px-4 flex items-center gap-2 bg-white border border-neutral-200 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors min-w-[120px] justify-between"
              >
                {INTERVAL_UNITS.find((u) => u.value === value.intervalUnit)?.label || 'Minutes'}
                <ChevronDown className="h-4 w-4 text-neutral-400" />
              </button>
              {showUnitDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowUnitDropdown(false)} />
                  <div className="absolute top-full left-0 mt-1 w-full bg-white border border-neutral-200 rounded-lg shadow-lg z-20 py-1">
                    {INTERVAL_UNITS.map((unit) => (
                      <button
                        key={unit.value}
                        type="button"
                        onClick={() => {
                          updateValue({ intervalUnit: unit.value });
                          setShowUnitDropdown(false);
                        }}
                        className={`w-full px-4 py-2 text-left text-sm hover:bg-neutral-50 transition-colors ${
                          value.intervalUnit === unit.value ? 'bg-neutral-100 font-medium' : ''
                        }`}
                      >
                        {unit.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Daily Configuration */}
      {value.type === 'daily' && (
        <div className="space-y-3">
          <label className="text-xs font-medium text-neutral-500 block">Run daily at</label>

          {/* Preset times */}
          <div className="flex flex-wrap gap-2">
            {PRESET_TIMES.map((preset) => {
              const isActive = value.time === preset.value;
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => updateValue({ time: preset.value })}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                    isActive
                      ? 'bg-neutral-900 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Custom time input */}
          <div className="flex gap-2 items-center">
            <Input
              type="time"
              value={value.time || '09:00'}
              onChange={(e) => updateValue({ time: e.target.value })}
              className="w-40"
            />
            <span className="text-sm text-neutral-500">local time</span>
          </div>
        </div>
      )}

      {/* Weekly Configuration */}
      {value.type === 'weekly' && (
        <div className="space-y-4">
          {/* Day selector */}
          <div>
            <label className="text-xs font-medium text-neutral-500 mb-2 block">
              Run on these days
            </label>
            <div className="flex gap-1">
              {DAYS_OF_WEEK.map((day) => {
                const isSelected = value.days?.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => {
                      const currentDays = value.days || [];
                      const newDays = isSelected
                        ? currentDays.filter((d) => d !== day.value)
                        : [...currentDays, day.value].sort();
                      updateValue({ days: newDays });
                    }}
                    className={`flex-1 h-10 flex items-center justify-center text-sm font-medium rounded-lg transition-all ${
                      isSelected
                        ? 'bg-neutral-900 text-white'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                    title={day.label}
                  >
                    {day.short}
                  </button>
                );
              })}
            </div>
            {/* Quick select buttons */}
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => updateValue({ days: [1, 2, 3, 4, 5] })}
                className="text-xs text-neutral-500 hover:text-neutral-700 underline"
              >
                Weekdays
              </button>
              <button
                type="button"
                onClick={() => updateValue({ days: [0, 6] })}
                className="text-xs text-neutral-500 hover:text-neutral-700 underline"
              >
                Weekends
              </button>
              <button
                type="button"
                onClick={() => updateValue({ days: [0, 1, 2, 3, 4, 5, 6] })}
                className="text-xs text-neutral-500 hover:text-neutral-700 underline"
              >
                Every day
              </button>
            </div>
          </div>

          {/* Time selector */}
          <div>
            <label className="text-xs font-medium text-neutral-500 mb-2 block">At what time</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {PRESET_TIMES.slice(0, 4).map((preset) => {
                const isActive = value.time === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => updateValue({ time: preset.value })}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                      isActive
                        ? 'bg-neutral-900 text-white'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 items-center">
              <Input
                type="time"
                value={value.time || '09:00'}
                onChange={(e) => updateValue({ time: e.target.value })}
                className="w-40"
              />
              <span className="text-sm text-neutral-500">local time</span>
            </div>
          </div>
        </div>
      )}

      {/* Custom Cron Configuration */}
      {value.type === 'cron' && (
        <div className="space-y-3">
          <label className="text-xs font-medium text-neutral-500 block">Cron Expression</label>

          {/* Preset cron expressions */}
          <div className="flex flex-wrap gap-2">
            {CRON_PRESETS.map((preset) => {
              const isActive = value.cronExpression === preset.value;
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => updateValue({ cronExpression: preset.value })}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                    isActive
                      ? 'bg-neutral-900 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Custom cron input */}
          <Input
            type="text"
            value={value.cronExpression || ''}
            onChange={(e) => updateValue({ cronExpression: e.target.value })}
            placeholder="* * * * * (min hour day month weekday)"
            className="font-mono"
          />

          {/* Cron help */}
          <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-100">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
              <div className="text-xs text-neutral-500 space-y-1">
                <p className="font-medium text-neutral-600">
                  Cron format: minute hour day month weekday
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-2">
                  <span>
                    <code className="text-neutral-700">*</code> = any value
                  </span>
                  <span>
                    <code className="text-neutral-700">*/5</code> = every 5
                  </span>
                  <span>
                    <code className="text-neutral-700">0-23</code> = range
                  </span>
                  <span>
                    <code className="text-neutral-700">1,15</code> = specific
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Preview */}
      {scheduleDescription && (
        <div className="pt-3 border-t border-neutral-100">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              {scheduleDescription}
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
}

// Convert ScheduleValue to API format
export function scheduleValueToApi(value: ScheduleValue): {
  schedule?: string;
  every?: string;
  at?: string;
} {
  switch (value.type) {
    case 'interval': {
      const unit = INTERVAL_UNITS.find((u) => u.value === value.intervalUnit);
      return { every: `${value.intervalValue || 1}${unit?.short || 'm'}` };
    }
    case 'daily': {
      const [hours, minutes] = (value.time || '09:00').split(':');
      return { schedule: `${minutes} ${hours} * * *` };
    }
    case 'weekly': {
      const [hours, minutes] = (value.time || '09:00').split(':');
      const days = value.days?.length ? value.days.join(',') : '*';
      return { schedule: `${minutes} ${hours} * * ${days}` };
    }
    case 'cron':
      return { schedule: value.cronExpression || '0 9 * * *' };
    default:
      return {};
  }
}

// Get human-readable description
function getScheduleDescription(value: ScheduleValue): string {
  switch (value.type) {
    case 'interval': {
      const unit = value.intervalUnit || 'minutes';
      const val = value.intervalValue || 1;
      const unitLabel = val === 1 ? unit.slice(0, -1) : unit;
      return `Every ${val} ${unitLabel}`;
    }
    case 'daily': {
      const time = formatTime(value.time || '09:00');
      return `Daily at ${time}`;
    }
    case 'weekly': {
      const time = formatTime(value.time || '09:00');
      const days = value.days || [];
      if (days.length === 0) return 'Select days';
      if (days.length === 7) return `Every day at ${time}`;
      if (arraysEqual(days, [1, 2, 3, 4, 5])) return `Weekdays at ${time}`;
      if (arraysEqual(days, [0, 6])) return `Weekends at ${time}`;
      const dayNames = days.map((d) => DAYS_OF_WEEK[d].label.slice(0, 3)).join(', ');
      return `${dayNames} at ${time}`;
    }
    case 'cron':
      return value.cronExpression ? `Cron: ${value.cronExpression}` : 'Enter cron expression';
    default:
      return '';
  }
}

function formatTime(time: string): string {
  const [hours, minutes] = time.split(':');
  const h = parseInt(hours);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

function arraysEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// Default schedule value
export function getDefaultScheduleValue(): ScheduleValue {
  return {
    type: 'interval',
    intervalValue: 1,
    intervalUnit: 'hours',
    time: '09:00',
    days: [1, 2, 3, 4, 5],
    cronExpression: '',
  };
}
