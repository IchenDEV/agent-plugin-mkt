// Repository quality signals, computed from indexed repo metadata. The score
// is a transparent heuristic for browsing and comparison — it rewards
// maintenance activity and manifest completeness, never plugin behavior. It is
// NOT a security or code-quality verdict (the directory never executes code).

export interface QualitySignals {
  repoStars: number;
  repoForks: number;
  repoOpenIssues: number;
  repoPushedAt: Date | null;
  license: string | null;
  skillCount: number;
  mcpCount: number;
  hasDescription: boolean;
}

export interface QualityScore {
  /** 0–100 composite. */
  score: number;
  /** Coarse display tier derived from the score. */
  level: "high" | "medium" | "low";
  /** Per-signal 0–1 subscores, for tooltips and transparency. */
  parts: {
    activity: number;
    adoption: number;
    completeness: number;
    responsiveness: number;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 1.0 for a push within the last week, decaying to 0 after ~1 year. */
function activityScore(pushedAt: Date | null, now: number): number {
  if (!pushedAt) return 0;
  const ageDays = Math.max(0, (now - pushedAt.getTime()) / DAY_MS);
  return Math.max(0, 1 - ageDays / 365);
}

/** Log-scaled stars+forks: 10 → ~0.5, 100 → ~0.75, 1000 → ~1. */
function adoptionScore(stars: number, forks: number): number {
  const combined = stars + forks * 2;
  if (combined <= 0) return 0;
  const value = Math.log10(combined) / 3; // log10(1000) = 3
  return Math.min(1, Math.max(0, value));
}

/** Manifest completeness: components found, description present, license declared. */
function completenessScore(signals: QualitySignals): number {
  let score = 0;
  if (signals.skillCount > 0 || signals.mcpCount > 0) score += 0.5;
  if (signals.hasDescription) score += 0.25;
  if (signals.license) score += 0.25;
  return score;
}

/**
 * Open-issue ratio vs adoption. Only meaningful once a repo has real usage:
 * repos with <5 combined stars+forks get a neutral 0.5 so new projects are
 * not penalized for having no issues yet.
 */
function responsivenessScore(signals: QualitySignals): number {
  const adoption = signals.repoStars + signals.repoForks;
  if (adoption < 5) return 0.5;
  if (signals.repoOpenIssues === 0) return 1;
  const ratio = signals.repoOpenIssues / adoption;
  // ratio ≤ 0.05 is excellent; ≥ 0.5 scores 0.
  return Math.min(1, Math.max(0, 1 - (ratio - 0.05) / 0.45));
}

export function qualityScore(signals: QualitySignals, now: number = Date.now()): QualityScore {
  const parts = {
    activity: activityScore(signals.repoPushedAt, now),
    adoption: adoptionScore(signals.repoStars, signals.repoForks),
    completeness: completenessScore(signals),
    responsiveness: responsivenessScore(signals),
  };
  const score = Math.round(
    (parts.activity * 0.35 +
      parts.adoption * 0.3 +
      parts.completeness * 0.25 +
      parts.responsiveness * 0.1) *
      100,
  );
  return {
    score,
    level: score >= 65 ? "high" : score >= 35 ? "medium" : "low",
    parts,
  };
}

export function qualityLabel(level: QualityScore["level"], locale: string): string {
  if (locale === "zh-CN") {
    return level === "high" ? "维护活跃" : level === "medium" ? "状态一般" : "信号较少";
  }
  return level === "high" ? "Actively maintained" : level === "medium" ? "Moderate signals" : "Few signals";
}
