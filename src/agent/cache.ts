/**
 * SolPrivacy Wallet Analysis Cache
 * Persists analysis results to avoid redundant API calls
 * and enables historical comparisons
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Cache directory
const CACHE_DIR = path.join(os.homedir(), '.solprivacy', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'wallet-analyses.json');

// Cache entry structure
export interface CachedAnalysis {
  walletAddress: string;
  timestamp: number;
  analysis: {
    advancedPrivacyScore: number;
    grade: string;
    riskLevel: string;
    entropy: { totalEntropy: number; amountEntropy: number; timingEntropy: number };
    kAnonymity: { kValue: number; clusterSize: number };
    advancedClustering: { linkedAddresses: number; clusterRisk: string };
    exchangeFingerprint: { kycExposure: number; exchangeInteractions: number };
    dustAttack: { dustAttackDetected: boolean; suspiciousInputs: number };
    temporalAnalysis: { regularityScore: number; activeHours: number[] };
    recommendations: Array<{ action: string; priority: string; impact: string }>;
  };
}

export interface WalletHistory {
  walletAddress: string;
  analyses: CachedAnalysis[];
  firstSeen: number;
  lastSeen: number;
  scoreChange: number | null; // Difference between first and last score
}

// Cache storage
interface CacheData {
  version: number;
  entries: Record<string, CachedAnalysis[]>; // wallet -> array of analyses (for history)
}

// Default TTL: 1 hour (in milliseconds)
const DEFAULT_TTL = 60 * 60 * 1000;

/**
 * Ensure cache directory exists
 */
function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Load cache from disk
 */
function loadCache(): CacheData {
  try {
    ensureCacheDir();
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch {
    // Ignore errors, return empty cache
  }
  return { version: 1, entries: {} };
}

/**
 * Save cache to disk
 */
function saveCache(cache: CacheData): void {
  try {
    ensureCacheDir();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (error) {
    console.error('Failed to save cache:', error);
  }
}

/**
 * Get cached analysis for a wallet (if exists and not expired)
 */
export function getCachedAnalysis(
  walletAddress: string,
  ttl: number = DEFAULT_TTL
): CachedAnalysis | null {
  const cache = loadCache();
  const entries = cache.entries[walletAddress];

  if (!entries || entries.length === 0) {
    return null;
  }

  // Get most recent entry
  const latest = entries[entries.length - 1];
  const age = Date.now() - latest.timestamp;

  // Return if still valid
  if (age < ttl) {
    return latest;
  }

  return null;
}

/**
 * Store analysis in cache
 */
export function cacheAnalysis(
  walletAddress: string,
  analysis: CachedAnalysis['analysis']
): CachedAnalysis {
  const cache = loadCache();

  const entry: CachedAnalysis = {
    walletAddress,
    timestamp: Date.now(),
    analysis,
  };

  // Initialize or append to existing entries
  if (!cache.entries[walletAddress]) {
    cache.entries[walletAddress] = [];
  }

  // Keep max 10 historical entries per wallet
  if (cache.entries[walletAddress].length >= 10) {
    cache.entries[walletAddress].shift(); // Remove oldest
  }

  cache.entries[walletAddress].push(entry);
  saveCache(cache);

  return entry;
}

/**
 * Get all analyses for a wallet (history)
 */
export function getWalletHistory(walletAddress: string): WalletHistory | null {
  const cache = loadCache();
  const entries = cache.entries[walletAddress];

  if (!entries || entries.length === 0) {
    return null;
  }

  const first = entries[0];
  const last = entries[entries.length - 1];

  return {
    walletAddress,
    analyses: entries,
    firstSeen: first.timestamp,
    lastSeen: last.timestamp,
    scoreChange: entries.length > 1
      ? last.analysis.advancedPrivacyScore - first.analysis.advancedPrivacyScore
      : null,
  };
}

/**
 * Get list of all cached wallets with summary
 */
export function listCachedWallets(): Array<{
  walletAddress: string;
  analysisCount: number;
  lastScore: number;
  lastGrade: string;
  lastSeen: string;
}> {
  const cache = loadCache();

  return Object.entries(cache.entries)
    .filter(([_, entries]) => entries.length > 0)
    .map(([wallet, entries]) => {
      const latest = entries[entries.length - 1];
      return {
        walletAddress: wallet,
        analysisCount: entries.length,
        lastScore: latest.analysis.advancedPrivacyScore,
        lastGrade: latest.analysis.grade,
        lastSeen: new Date(latest.timestamp).toISOString(),
      };
    })
    .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
}

/**
 * Clear cache for a specific wallet
 */
export function clearWalletCache(walletAddress: string): boolean {
  const cache = loadCache();

  if (cache.entries[walletAddress]) {
    delete cache.entries[walletAddress];
    saveCache(cache);
    return true;
  }

  return false;
}

/**
 * Clear all cache
 */
export function clearAllCache(): number {
  const cache = loadCache();
  const count = Object.keys(cache.entries).length;

  cache.entries = {};
  saveCache(cache);

  return count;
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  totalWallets: number;
  totalAnalyses: number;
  cacheSize: string;
  oldestEntry: string | null;
  newestEntry: string | null;
} {
  const cache = loadCache();
  const entries = Object.values(cache.entries);

  let totalAnalyses = 0;
  let oldest: number | null = null;
  let newest: number | null = null;

  for (const walletEntries of entries) {
    totalAnalyses += walletEntries.length;
    for (const entry of walletEntries) {
      if (!oldest || entry.timestamp < oldest) oldest = entry.timestamp;
      if (!newest || entry.timestamp > newest) newest = entry.timestamp;
    }
  }

  // Get file size
  let cacheSize = '0 KB';
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const stats = fs.statSync(CACHE_FILE);
      cacheSize = `${(stats.size / 1024).toFixed(1)} KB`;
    }
  } catch {}

  return {
    totalWallets: entries.length,
    totalAnalyses,
    cacheSize,
    oldestEntry: oldest ? new Date(oldest).toISOString() : null,
    newestEntry: newest ? new Date(newest).toISOString() : null,
  };
}

/**
 * Compare two analyses (for showing improvement)
 */
export function compareAnalyses(
  older: CachedAnalysis,
  newer: CachedAnalysis
): {
  scoreChange: number;
  entropyChange: number;
  dustChange: number;
  clusteringChange: number;
  improved: string[];
  worsened: string[];
} {
  const scoreChange = newer.analysis.advancedPrivacyScore - older.analysis.advancedPrivacyScore;
  const entropyChange = newer.analysis.entropy.totalEntropy - older.analysis.entropy.totalEntropy;
  const dustChange = newer.analysis.dustAttack.suspiciousInputs - older.analysis.dustAttack.suspiciousInputs;
  const clusteringChange = newer.analysis.advancedClustering.linkedAddresses - older.analysis.advancedClustering.linkedAddresses;

  const improved: string[] = [];
  const worsened: string[] = [];

  if (scoreChange > 0) improved.push(`Score: +${scoreChange}`);
  else if (scoreChange < 0) worsened.push(`Score: ${scoreChange}`);

  if (entropyChange > 0.05) improved.push('Entropy improved');
  else if (entropyChange < -0.05) worsened.push('Entropy decreased');

  if (dustChange < 0) improved.push(`Dust inputs: ${dustChange}`);
  else if (dustChange > 0) worsened.push(`Dust inputs: +${dustChange}`);

  if (clusteringChange < 0) improved.push(`Linked addresses: ${clusteringChange}`);
  else if (clusteringChange > 0) worsened.push(`Linked addresses: +${clusteringChange}`);

  return {
    scoreChange,
    entropyChange,
    dustChange,
    clusteringChange,
    improved,
    worsened,
  };
}
