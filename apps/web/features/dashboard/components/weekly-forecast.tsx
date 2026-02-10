'use client';

import { useState, useEffect, useMemo } from 'react';
import { Cloud, CloudRain, CloudSnow, Sun, CloudSun, CloudDrizzle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DayForecast {
  day: string;
  date: string;
  condition: 'clear' | 'partly-cloudy' | 'cloudy' | 'rain' | 'snow' | 'drizzle';
  precipChance: number;
  low: number;
  high: number;
  isToday: boolean;
  currentTemp?: number;
}

// ---------------------------------------------------------------------------
// Mock data — realistic NYC 7-day forecast
// ---------------------------------------------------------------------------

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function generate7DayForecast(): DayForecast[] {
  const now = new Date();
  const currentDow = now.getDay();
  const currentHour = now.getHours();

  // Deterministic seed per day-of-week
  const seeds = [42, 17, 63, 88, 31, 55, 74];

  return Array.from({ length: 7 }, (_, i) => {
    const dow = (currentDow + i) % 7;
    const seed = seeds[dow];
    const noise = ((seed * 2654435761) >>> 0) % 100;

    // Base temp pattern — mid-winter NYC
    const baseLow = 28 + (noise % 10);
    const baseHigh = baseLow + 10 + (noise % 8);

    // Precipitation pattern — a couple rainy days mid-week
    let precipChance: number;
    let condition: DayForecast['condition'];
    if (i === 2 || i === 3) {
      precipChance = 55 + (noise % 25);
      condition = precipChance > 65 ? 'rain' : 'drizzle';
    } else if (i === 5) {
      precipChance = 30 + (noise % 20);
      condition = 'cloudy';
    } else if (i === 1 || i === 4) {
      precipChance = 10 + (noise % 10);
      condition = 'partly-cloudy';
    } else {
      precipChance = noise % 8;
      condition = 'clear';
    }

    const isToday = i === 0;

    // Current temp for today — interpolate between low/high based on hour
    let currentTemp: number | undefined;
    if (isToday) {
      const hourRatio = Math.sin(((currentHour - 5) / 19) * Math.PI);
      currentTemp = Math.round(baseLow + (baseHigh - baseLow) * Math.max(0, hourRatio));
    }

    const dateObj = new Date(now);
    dateObj.setDate(dateObj.getDate() + i);
    const date = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;

    return {
      day: isToday ? 'Today' : DAY_NAMES[dow],
      date,
      condition,
      precipChance,
      low: baseLow,
      high: baseHigh,
      isToday,
      currentTemp,
    };
  });
}

// ---------------------------------------------------------------------------
// Condition icon
// ---------------------------------------------------------------------------

function ConditionIcon({
  condition,
  className,
}: {
  condition: DayForecast['condition'];
  className?: string;
}) {
  const props = { className: className ?? 'h-4 w-4' };
  switch (condition) {
    case 'rain':
      return <CloudRain {...props} />;
    case 'drizzle':
      return <CloudDrizzle {...props} />;
    case 'snow':
      return <CloudSnow {...props} />;
    case 'cloudy':
      return <Cloud {...props} />;
    case 'partly-cloudy':
      return <CloudSun {...props} />;
    default:
      return <Sun {...props} />;
  }
}

// ---------------------------------------------------------------------------
// Temperature range bar — the key visual
// ---------------------------------------------------------------------------

function TempRangeBar({
  low,
  high,
  weekLow,
  weekHigh,
  currentTemp,
}: {
  low: number;
  high: number;
  weekLow: number;
  weekHigh: number;
  currentTemp?: number;
}) {
  const range = weekHigh - weekLow || 1;
  const leftPct = ((low - weekLow) / range) * 100;
  const rightPct = ((weekHigh - high) / range) * 100;
  const widthPct = 100 - leftPct - rightPct;

  // Gradient: cool blue on left → warm amber on right
  const coolColor = 'rgb(147, 197, 253)'; // blue-300
  const midColor = 'rgb(253, 186, 116)';  // orange-300
  const warmColor = 'rgb(251, 146, 60)';  // orange-400

  let dotLeftPct: number | null = null;
  if (currentTemp != null) {
    dotLeftPct = ((currentTemp - low) / (high - low || 1)) * 100;
    dotLeftPct = Math.max(0, Math.min(100, dotLeftPct));
  }

  return (
    <div className="relative h-1 w-full rounded-full bg-neutral-100">
      <div
        className="absolute h-1 rounded-full"
        style={{
          left: `${leftPct}%`,
          width: `${widthPct}%`,
          background: `linear-gradient(to right, ${coolColor}, ${midColor}, ${warmColor})`,
        }}
      />
      {dotLeftPct != null && (
        <div
          className="absolute top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-white border-2 border-neutral-900"
          style={{
            left: `${leftPct + (widthPct * dotLeftPct) / 100}%`,
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WeeklyForecast component
// ---------------------------------------------------------------------------

export function WeeklyForecast() {
  const [days, setDays] = useState<DayForecast[] | null>(null);

  useEffect(() => {
    setDays(generate7DayForecast());
  }, []);

  const { weekLow, weekHigh } = useMemo(() => {
    if (!days) return { weekLow: 0, weekHigh: 100 };
    return {
      weekLow: Math.min(...days.map((d) => d.low)),
      weekHigh: Math.max(...days.map((d) => d.high)),
    };
  }, [days]);

  if (!days) {
    return <div className="h-[280px] skeleton rounded-lg" />;
  }

  return (
    <div className="space-y-0.5">
      {days.map((day, i) => (
        <div
          key={i}
          className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-neutral-50 transition-colors"
        >
          {/* Day name */}
          <span
            className={`w-11 shrink-0 text-sm tabular-nums ${
              day.isToday ? 'font-semibold text-neutral-900' : 'text-neutral-500'
            }`}
          >
            {day.day}
          </span>

          {/* Condition icon + precip */}
          <div className="w-10 shrink-0 flex flex-col items-center gap-0.5">
            <ConditionIcon
              condition={day.condition}
              className={`h-4 w-4 ${
                day.condition === 'rain' || day.condition === 'drizzle'
                  ? 'text-blue-400'
                  : day.condition === 'cloudy'
                    ? 'text-neutral-400'
                    : 'text-amber-400'
              }`}
            />
            {day.precipChance >= 20 && (
              <span className="text-[10px] text-blue-400 font-medium tabular-nums leading-none">
                {day.precipChance}%
              </span>
            )}
          </div>

          {/* Low temp */}
          <span className="w-8 shrink-0 text-right text-[13px] text-neutral-400 tabular-nums">
            {day.low}°
          </span>

          {/* Temperature range bar */}
          <div className="flex-1 min-w-0 px-1">
            <TempRangeBar
              low={day.low}
              high={day.high}
              weekLow={weekLow}
              weekHigh={weekHigh}
              currentTemp={day.currentTemp}
            />
          </div>

          {/* High temp */}
          <span className="w-8 shrink-0 text-[13px] font-medium text-neutral-900 tabular-nums">
            {day.high}°
          </span>
        </div>
      ))}
    </div>
  );
}
