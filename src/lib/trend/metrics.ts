// Deterministic ranking/scoring maths for the Trend Engine.
// AUDIT-EXEMPT: pure functions over fetched volume/growth — no generative model call.
import type { TrendFeed, TrendObservation, TrendSignal } from "./types";

function round(value: number, places: number): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Composite momentum score in [0, 100]. Blends normalised volume against a
 * single feed's peak with the observation's growth, so a topic must be both
 * sizeable AND accelerating to rank near the top.
 *  - volumeShare: this topic's volume / the feed's max volume (0–1)
 *  - growthFactor: 1 + growth, floored at 0 so a collapsing topic scores ~0
 */
function scoreOf(obs: TrendObservation, maxVolume: number): number {
  const volumeShare = maxVolume > 0 ? obs.volume / maxVolume : 0;
  const growthFactor = Math.max(0, 1 + obs.growth);
  // 60% size, 40% momentum; growth capped at 3x so one viral spike can't dwarf all.
  const raw = volumeShare * 60 + clamp(growthFactor, 0, 3) * (40 / 3);
  return round(clamp(raw, 0, 100), 2);
}

/** Reduce a fetched feed to ranked, deterministic trend signals (highest score first). */
export function rankTrends(feed: TrendFeed): TrendSignal[] {
  const maxVolume = feed.observations.reduce((m, o) => Math.max(m, o.volume), 0);
  const signals: TrendSignal[] = feed.observations.map((o) => ({
    topic: o.topic,
    platform: feed.platform,
    volume: o.volume,
    growth: round(o.growth, 4),
    score: scoreOf(o, maxVolume),
    sampleRefs: o.sampleRefs ?? [],
  }));
  // Rank by score, ties broken by raw volume.
  return signals.sort((a, b) => b.score - a.score || b.volume - a.volume);
}
