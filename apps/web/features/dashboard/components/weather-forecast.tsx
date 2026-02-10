'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Cloud, CloudRain, CloudSnow, Sun, CloudSun, Droplets, Thermometer, Wind } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ForecastPoint {
  /** Minutes offset from "now" */
  minutesFromNow: number;
  /** Fractional hour (0-23.99) in wall-clock time */
  fractionalHour: number;
  label: string;
  temp: number;
  precipChance: number;
  condition: 'clear' | 'partly-cloudy' | 'cloudy' | 'rain' | 'snow' | 'drizzle';
  windSpeed: number;
}

interface WeatherData {
  current: {
    temp: number;
    condition: string;
    high: number;
    low: number;
    feelsLike: number;
    humidity: number;
  };
  points: ForecastPoint[];
}

// ---------------------------------------------------------------------------
// Mock data — realistic NYC 24h forecast at 10-min resolution
// ---------------------------------------------------------------------------

function generateNYCForecast(hours: number = 24): WeatherData {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // Use a seeded-ish approach: snap random noise per-hour so bars within
  // the same hour have smooth continuity.
  const hourNoise: number[] = Array.from({ length: 25 }, (_, i) => {
    // Deterministic-ish per hour-of-day so it doesn't jump on re-render
    const seed = ((currentHour + i) * 2654435761) >>> 0;
    return ((seed % 200) - 100) / 100; // -1..1
  });

  const INTERVAL_MINUTES = 10;
  const TOTAL_POINTS = hours * 6;

  const points: ForecastPoint[] = Array.from({ length: TOTAL_POINTS }, (_, i) => {
    const minutesFromNow = i * INTERVAL_MINUTES;
    const fractionalHour = ((currentHour + currentMinute / 60 + minutesFromNow / 60) % 24);
    const wholeHour = Math.floor(fractionalHour);
    const frac = fractionalHour - wholeHour;

    const isNight = wholeHour >= 20 || wholeHour < 6;
    const isMorning = wholeHour >= 6 && wholeHour < 12;
    const isAfternoon = wholeHour >= 12 && wholeHour < 17;

    // Temperature — smooth sinusoidal, peaks ~2pm, trough ~5am
    const hourAngle = ((fractionalHour - 14) / 24) * Math.PI * 2;
    const baseTemp = 38;
    const noise0 = hourNoise[Math.floor(i / 6) % 25] ?? 0;
    const temp = Math.round(baseTemp + Math.cos(hourAngle) * 8 + noise0 * 1.2);

    // Precipitation — rain band 1pm-6pm with smooth ramp
    let precipChance: number;
    if (fractionalHour >= 13 && fractionalHour <= 18) {
      precipChance = Math.min(
        95,
        Math.round(40 + Math.sin(((fractionalHour - 13) / 5) * Math.PI) * 55 + noise0 * 5)
      );
    } else if (fractionalHour >= 11 && fractionalHour < 13) {
      precipChance = Math.round(15 + ((fractionalHour - 11) / 2) * 25 + noise0 * 3);
    } else if (fractionalHour > 18 && fractionalHour <= 21) {
      precipChance = Math.round(Math.max(0, 20 - ((fractionalHour - 18) / 3) * 20 + noise0 * 4));
    } else {
      precipChance = Math.round(Math.max(0, 3 + noise0 * 3));
    }
    precipChance = Math.max(0, Math.min(100, precipChance));

    // Condition
    let condition: ForecastPoint['condition'];
    if (precipChance > 60) condition = 'rain';
    else if (precipChance > 30) condition = 'drizzle';
    else if (precipChance > 15) condition = 'cloudy';
    else if (isNight) condition = 'clear';
    else if (isMorning) condition = 'partly-cloudy';
    else condition = isAfternoon ? 'partly-cloudy' : 'clear';

    const windSpeed = Math.round(8 + Math.abs(noise0) * 10);

    // Label — only meaningful for hour boundaries
    let label: string;
    if (i === 0) {
      label = 'Now';
    } else {
      const totalMins = minutesFromNow;
      const h = Math.floor(totalMins / 60);
      const m = totalMins % 60;
      const wallHour = (currentHour + h + Math.floor((currentMinute + m) / 60)) % 24;
      const wallMin = (currentMinute + m) % 60;
      const ampm = wallHour >= 12 ? 'PM' : 'AM';
      const displayHour = wallHour === 0 ? 12 : wallHour > 12 ? wallHour - 12 : wallHour;
      label = wallMin === 0
        ? `${displayHour}${ampm}`
        : `${displayHour}:${String(wallMin).padStart(2, '0')}${ampm}`;
    }

    return { minutesFromNow, fractionalHour, label, temp, precipChance, condition, windSpeed };
  });

  const temps = points.map((p) => p.temp);
  const high = Math.max(...temps);
  const low = Math.min(...temps);

  return {
    current: {
      temp: points[0].temp,
      condition:
        points[0].condition === 'rain'
          ? 'Rainy'
          : points[0].condition === 'cloudy'
            ? 'Cloudy'
            : 'Partly Cloudy',
      high,
      low,
      feelsLike: points[0].temp - 4,
      humidity: 62,
    },
    points,
  };
}

// ---------------------------------------------------------------------------
// Condition icon
// ---------------------------------------------------------------------------

function ConditionIcon({ condition, className }: { condition: ForecastPoint['condition']; className?: string }) {
  const props = { className: className ?? 'h-3.5 w-3.5' };
  switch (condition) {
    case 'rain':
    case 'drizzle':
      return <CloudRain {...props} />;
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
// Color helpers
// ---------------------------------------------------------------------------

function getPrecipColor(chance: number): string {
  if (chance >= 70) return 'rgb(59, 130, 246)';
  if (chance >= 40) return 'rgb(96, 165, 250)';
  if (chance >= 20) return 'rgb(147, 197, 253)';
  if (chance >= 10) return 'rgb(191, 219, 254)';
  return 'rgb(219, 234, 254)';
}

function getTempColor(temp: number, low: number, high: number): string {
  const range = high - low || 1;
  const ratio = (temp - low) / range;
  if (ratio < 0.5) {
    const t = ratio * 2;
    const r = Math.round(96 + (163 - 96) * t);
    const g = Math.round(165 + (163 - 165) * t);
    const b = Math.round(250 + (163 - 250) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }
  const t = (ratio - 0.5) * 2;
  const r = Math.round(163 + (245 - 163) * t);
  const g = Math.round(163 + (158 - 163) * t);
  const b = Math.round(163 + (11 - 163) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

// ---------------------------------------------------------------------------
// WeatherForecast component
// ---------------------------------------------------------------------------

type ViewMode = 'precipitation' | 'temperature';

/** Fixed width per bar slot in px */
const BAR_SLOT = 6;

/**
 * Valid interval steps (in units of 10-min source points).
 * step=1 → every 10min (144 bars), step=6 → every 60min/hourly (24 bars).
 */
const DENSITY_STEPS = [1, 2, 3, 4, 6] as const; // 10m, 20m, 30m, 40m, 60m
const MIN_BARS = 24; // hourly = lowest density

export function WeatherForecast({ hours = 24 }: { hours?: number }) {
  const [data, setData] = useState<WeatherData | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('precipitation');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setData(generateNYCForecast(hours));
  }, [hours]);

  // Measure container width on mount + resize
  const measure = useCallback(() => {
    if (chartRef.current) {
      setContainerWidth(chartRef.current.clientWidth);
    }
  }, []);

  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (chartRef.current) observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, [measure]);

  const { tempLow, tempHigh } = useMemo(() => {
    if (!data) return { tempLow: 0, tempHigh: 100 };
    const temps = data.points.map((p) => p.temp);
    return { tempLow: Math.min(...temps), tempHigh: Math.max(...temps) };
  }, [data]);

  // Pick the highest density that fits within the container width.
  // If even hourly doesn't fit, we keep hourly and allow scroll.
  const { visiblePoints, needsScroll } = useMemo(() => {
    if (!data || containerWidth === 0) return { visiblePoints: [] as ForecastPoint[], needsScroll: false };

    const totalPoints = data.points.length;
    const maxBars = Math.floor(containerWidth / BAR_SLOT);

    // Try each density from highest (step=1) to lowest (step=6, hourly)
    for (const step of DENSITY_STEPS) {
      const count = Math.floor(totalPoints / step);
      if (count <= maxBars) {
        const pts = data.points.filter((_, i) => i % step === 0);
        return { visiblePoints: pts, needsScroll: false };
      }
    }

    // Even hourly doesn't fit — use hourly and scroll
    const pts = data.points.filter((_, i) => i % 6 === 0);
    return { visiblePoints: pts, needsScroll: true };
  }, [data, containerWidth]);

  // Determine which visible-point indices fall on hour boundaries (for labels)
  const hourLabelIndices = useMemo(() => {
    const indices = new Set<number>();
    let lastHour = -1;
    visiblePoints.forEach((p, i) => {
      const wh = Math.floor(p.fractionalHour);
      if (wh !== lastHour) {
        indices.add(i);
        lastHour = wh;
      }
    });
    return indices;
  }, [visiblePoints]);

  if (!data) {
    return <div className="h-[260px] skeleton rounded-lg" />;
  }

  const hovered = hoveredIndex !== null ? visiblePoints[hoveredIndex] : null;

  return (
    <div className="space-y-3">
      {/* Current conditions summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <ConditionIcon condition={data.points[0].condition} className="h-4 w-4 text-neutral-500" />
            <span className="text-2xl font-semibold text-neutral-900 tabular-nums tracking-tight">
              {data.current.temp}°
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-neutral-400">
            <span>H:{data.current.high}°</span>
            <span>L:{data.current.low}°</span>
          </div>
        </div>

        {/* View mode toggle */}
        <div className="pill-tabs">
          <button
            onClick={() => setViewMode('precipitation')}
            className={`pill-tab ${viewMode === 'precipitation' ? 'pill-tab-active' : ''}`}
          >
            <Droplets className="h-3 w-3 inline-block mr-1 -mt-px" />
            <span className="text-[11px]">Rain</span>
          </button>
          <button
            onClick={() => setViewMode('temperature')}
            className={`pill-tab ${viewMode === 'temperature' ? 'pill-tab-active' : ''}`}
          >
            <Thermometer className="h-3 w-3 inline-block mr-1 -mt-px" />
            <span className="text-[11px]">Temp</span>
          </button>
        </div>
      </div>

      {/* Hover detail band */}
      <div className="h-5 flex items-center">
        {hovered ? (
          <div className="flex items-center gap-3 text-[11px] animate-fade-in">
            <span className="font-medium text-neutral-700">{hovered.label}</span>
            <span className="text-neutral-400">
              {hovered.temp}° · {hovered.precipChance}% rain · {hovered.windSpeed} mph
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-neutral-400">
            {viewMode === 'precipitation'
              ? '24h precipitation forecast · NYC'
              : '24h temperature forecast · NYC'}
          </span>
        )}
      </div>

      {/* Chart area — adaptive density, scroll only as last resort */}
      {/* Measurement wrapper — always takes full width so ResizeObserver fires */}
      <div ref={chartRef} className="w-full">
      <div
        className={needsScroll ? 'overflow-x-auto -mx-4 px-4' : ''}
        style={needsScroll ? { scrollbarWidth: 'thin' } : undefined}
      >
        <div
          style={{
            width: needsScroll ? `${visiblePoints.length * BAR_SLOT + 24}px` : '100%',
            paddingLeft: '12px',
            paddingRight: '12px',
          }}
        >
          {/* Bars */}
          <div className="flex items-end" style={{ height: '110px', gap: 0 }}>
            {visiblePoints.map((point, i) => {
              const isHovered = hoveredIndex === i;
              const isNow = i === 0;

              const isPrecip = viewMode === 'precipitation';
              const barPct = isPrecip
                ? Math.max((point.precipChance / 100) * 100, 1)
                : Math.max(((point.temp - tempLow) / (tempHigh - tempLow || 1)) * 100, 2);
              const color = isPrecip
                ? getPrecipColor(point.precipChance)
                : getTempColor(point.temp, tempLow, tempHigh);

              return (
                <div
                  key={i}
                  className={`relative flex items-end justify-center ${needsScroll ? 'shrink-0' : 'flex-1'}`}
                  style={needsScroll ? { width: `${BAR_SLOT}px`, height: '110px' } : { minWidth: 0, height: '110px' }}
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  <div
                    className="rounded-full"
                    style={{
                      height: `${barPct}%`,
                      width: '4px',
                      backgroundColor: color,
                      opacity: isHovered ? 1 : isNow ? 0.95 : 0.5,
                      minHeight: '1px',
                      transition: 'opacity 0.1s',
                    }}
                  />
                  {isHovered && (
                    <div
                      className="absolute left-1/2 -translate-x-1/2 text-[9px] font-semibold tabular-nums whitespace-nowrap z-10"
                      style={{ color, bottom: `calc(${barPct}% + 4px)` }}
                    >
                      {isPrecip ? `${point.precipChance}%` : `${point.temp}°`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* X-axis time labels — positioned relative to bar positions */}
          <div className="relative" style={{ height: '16px' }}>
            {visiblePoints.map((point, i) => {
              const isNow = i === 0;
              const isHourBoundary = hourLabelIndices.has(i);
              if (!isNow && !isHourBoundary) return null;

              const leftPct = (i / visiblePoints.length) * 100;

              const wh = Math.floor(point.fractionalHour);
              const ampm = wh >= 12 ? 'p' : 'a';
              const dh = wh === 0 ? 12 : wh > 12 ? wh - 12 : wh;
              const label = isNow ? 'Now' : `${dh}${ampm}`;

              return (
                <span
                  key={i}
                  className={`absolute top-1 text-[9px] tabular-nums leading-none -translate-x-1/2 ${
                    isNow ? 'font-semibold text-neutral-900' : 'text-neutral-400'
                  }`}
                  style={{ left: `${leftPct}%` }}
                >
                  {label}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      </div>

      {/* Footer stats */}
      <div className="flex items-center justify-between pt-1 border-t border-neutral-100">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-[11px] text-neutral-400">
            <Droplets className="h-3 w-3" />
            <span>{data.current.humidity}%</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-neutral-400">
            <Wind className="h-3 w-3" />
            <span>{data.points[0].windSpeed} mph</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-neutral-400">
            <Thermometer className="h-3 w-3" />
            <span>Feels {data.current.feelsLike}°</span>
          </div>
        </div>
        <span className="text-[10px] text-neutral-300">New York City</span>
      </div>
    </div>
  );
}
