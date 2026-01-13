/**
 * SolPrivacy Agent Tools
 * Tools the AI agent can use to analyze wallets and generate recommendations
 */

import { tool } from 'ai';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  getCachedAnalysis,
  cacheAnalysis,
  getWalletHistory,
  listCachedWallets,
  compareAnalyses,
  type CachedAnalysis,
} from './cache.js';

// Privacy analysis result type
export interface PrivacyAnalysis {
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
}

// In-memory cache (session only) - persistent cache is in cache.ts
const sessionCache: Map<string, PrivacyAnalysis> = new Map();

// Load Helius API key from config
function getHeliusApiKey(): string | undefined {
  try {
    const configPath = path.join(os.homedir(), '.solprivacy', 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return config.heliusApiKey;
    }
  } catch {}
  return process.env.HELIUS_API_KEY;
}

/**
 * Core analysis function - can be called directly by other tools
 */
export async function analyzeWalletCore(
  walletAddress: string,
  forceRefresh?: boolean
): Promise<PrivacyAnalysis | { error: true; message: string }> {
  // Check persistent cache first (unless forced refresh)
  if (!forceRefresh) {
    const cached = getCachedAnalysis(walletAddress);
    if (cached) {
      return {
        ...cached.analysis,
        _cached: true,
        _cachedAt: new Date(cached.timestamp).toISOString(),
      } as PrivacyAnalysis;
    }
  }

  // Check session cache
  if (sessionCache.has(walletAddress)) {
    return sessionCache.get(walletAddress)!;
  }

  const heliusKey = getHeliusApiKey();
  if (!heliusKey) {
    return {
      error: true,
      message: 'Helius API key not configured. Use /config-llm or set HELIUS_API_KEY environment variable.',
    };
  }

  try {
    // Fetch real transactions from Helius
    const response = await fetch(
      `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${heliusKey}&limit=100`
    );

    if (!response.ok) {
      throw new Error(`Helius API error: ${response.status}`);
    }

    const transactions = await response.json() as any[];

    if (!transactions || transactions.length === 0) {
      return {
        error: true,
        message: 'No transactions found for this wallet.',
      };
    }

    // Analyze transactions for privacy metrics
    const amounts = transactions
      .flatMap((tx: any) => tx.nativeTransfers || [])
      .map((t: any) => t.amount / 1e9)
      .filter((a: number) => a > 0);

    const timestamps = transactions
      .map((tx: any) => tx.timestamp)
      .filter((t: number) => t > 0);

    // Calculate entropy from amounts
    const amountEntropy = calculateEntropy(amounts);

    // Calculate timing entropy from intervals
    const intervals = timestamps.slice(1).map((t: number, i: number) => t - timestamps[i]);
    const timingEntropy = calculateEntropy(intervals.map(Math.abs));

    // Count CEX interactions
    const allAddresses = transactions.flatMap((tx: any) =>
      (tx.nativeTransfers || []).flatMap((t: any) => [t.fromUserAccount, t.toUserAccount])
    ).filter(Boolean);
    const cexCount = allAddresses.filter((a: string) => KNOWN_CEX.has(a)).length;
    const kycExposure = Math.min(1, cexCount / Math.max(1, allAddresses.length));

    // Detect dust attacks (tiny transfers < 0.001 SOL)
    const dustTransfers = transactions
      .flatMap((tx: any) => tx.nativeTransfers || [])
      .filter((t: any) => t.amount > 0 && t.amount < 1000000); // < 0.001 SOL

    // Calculate k-anonymity estimate
    const uniqueCounterparties = new Set(allAddresses).size;

    // Calculate overall score
    const totalEntropy = (amountEntropy + timingEntropy) / 2;
    let score = 50; // Base score
    score += totalEntropy * 30; // Up to +30 for high entropy
    score -= kycExposure * 40; // Up to -40 for CEX exposure
    score -= dustTransfers.length * 2; // -2 per dust
    score = Math.max(0, Math.min(100, Math.round(score)));

    const analysis: PrivacyAnalysis = {
      advancedPrivacyScore: score,
      grade: score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F',
      riskLevel: score >= 70 ? 'LOW' : score >= 40 ? 'MEDIUM' : 'HIGH',
      entropy: {
        totalEntropy: Math.round(totalEntropy * 100) / 100,
        amountEntropy: Math.round(amountEntropy * 100) / 100,
        timingEntropy: Math.round(timingEntropy * 100) / 100,
      },
      kAnonymity: {
        kValue: uniqueCounterparties,
        clusterSize: transactions.length,
      },
      advancedClustering: {
        linkedAddresses: uniqueCounterparties,
        clusterRisk: score < 40 ? 'HIGH' : score < 60 ? 'MEDIUM' : 'LOW',
      },
      exchangeFingerprint: {
        kycExposure: Math.round(kycExposure * 100) / 100,
        exchangeInteractions: cexCount,
      },
      dustAttack: {
        dustAttackDetected: dustTransfers.length > 3,
        suspiciousInputs: dustTransfers.length,
      },
      temporalAnalysis: {
        regularityScore: Math.round(timingEntropy * 100) / 100,
        activeHours: getActiveHours(timestamps),
      },
      recommendations: generateRecommendations(score, kycExposure, totalEntropy, dustTransfers.length),
    };

    // Cache in session and persist to disk
    sessionCache.set(walletAddress, analysis);
    cacheAnalysis(walletAddress, analysis);

    return analysis;
  } catch (error) {
    return {
      error: true,
      message: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// Known CEX addresses for KYC exposure calculation
const KNOWN_CEX = new Set([
  '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9', // Binance
  '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', // Binance
  'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS', // Coinbase
  'FWznbcNXWQuHTawe9RxvQ2LdCENssh12dsznf4RiouN5', // Kraken
  '2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S', // FTX
]);

/**
 * Tool: Analyze wallet privacy using Helius API
 */
export const analyzeWalletTool = tool({
  description: 'Analyze a Solana wallet address for privacy vulnerabilities using real blockchain data. Returns privacy score, risk level, and detected issues.',
  inputSchema: z.object({
    walletAddress: z.string().describe('The Solana wallet address to analyze'),
    forceRefresh: z.boolean().optional().describe('Force fresh analysis, ignore cache'),
  }),
  execute: async ({ walletAddress, forceRefresh }) => {
    return analyzeWalletCore(walletAddress, forceRefresh);
  },
});

// Helper: Calculate Shannon entropy
function calculateEntropy(values: number[]): number {
  if (values.length === 0) return 0;
  const total = values.reduce((a, b) => a + Math.abs(b), 0);
  if (total === 0) return 0;
  const probs = values.map(v => Math.abs(v) / total);
  return -probs.reduce((e, p) => e + (p > 0 ? p * Math.log2(p) : 0), 0) / Math.log2(values.length || 1);
}

// Helper: Get active hours from timestamps
function getActiveHours(timestamps: number[]): number[] {
  const hours = timestamps.map(t => new Date(t * 1000).getUTCHours());
  const counts = new Map<number, number>();
  hours.forEach(h => counts.set(h, (counts.get(h) || 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([h]) => h);
}

// Helper: Generate recommendations based on analysis
function generateRecommendations(score: number, kycExposure: number, entropy: number, dustCount: number): Array<{ action: string; priority: string; impact: string }> {
  const recs: Array<{ action: string; priority: string; impact: string }> = [];

  if (kycExposure > 0.3) {
    recs.push({
      action: 'Reduce CEX exposure - Use Jupiter DEX for swaps instead of centralized exchanges',
      priority: 'HIGH',
      impact: '+15-25 points',
    });
  }

  if (entropy < 0.5) {
    recs.push({
      action: 'Use Light Protocol for shielded transactions to increase entropy',
      priority: 'HIGH',
      impact: '+20-30 points',
    });
  }

  if (dustCount > 0) {
    recs.push({
      action: 'Avoid interacting with dust tokens - consider using a fresh wallet',
      priority: dustCount > 5 ? 'HIGH' : 'MEDIUM',
      impact: '+5-10 points',
    });
  }

  if (score < 60) {
    recs.push({
      action: 'Randomize transaction timing to reduce temporal patterns',
      priority: 'MEDIUM',
      impact: '+10 points',
    });
  }

  if (recs.length === 0) {
    recs.push({
      action: 'Maintain current privacy practices - your wallet has good privacy hygiene',
      priority: 'LOW',
      impact: 'Maintain score',
    });
  }

  return recs;
}

// Define improvement types
const improvementSchema = z.enum([
  'use_light_protocol',
  'use_dex_swaps',
  'randomize_timing',
  'split_amounts',
  'new_wallet',
  'avoid_cex',
]);

/**
 * Tool: Project privacy score after improvements
 */
export const projectScoreTool = tool({
  description: 'Calculate projected privacy score if user implements specific privacy improvements. Use this to show the user potential benefits of each recommendation.',
  inputSchema: z.object({
    currentScore: z.number().describe('Current privacy score (0-100)'),
    improvements: z.array(improvementSchema).describe('List of improvements to apply'),
  }),
  execute: async ({ currentScore, improvements }) => {
    // Score improvements per action (based on privacy research)
    const scoreImprovements: Record<string, number> = {
      use_light_protocol: 25,
      use_dex_swaps: 15,
      randomize_timing: 10,
      split_amounts: 8,
      new_wallet: 20,
      avoid_cex: 12,
    };

    let projectedScore = currentScore;
    const appliedImprovements: Array<{ action: string; scoreGain: number }> = [];

    for (const improvement of improvements) {
      const gain = scoreImprovements[improvement] || 0;
      const actualGain = Math.round(gain * (1 - projectedScore / 150));
      projectedScore = Math.min(95, projectedScore + actualGain);
      appliedImprovements.push({ action: improvement, scoreGain: actualGain });
    }

    return {
      currentScore,
      projectedScore,
      totalImprovement: projectedScore - currentScore,
      appliedImprovements,
      grade: projectedScore >= 80 ? 'A' : projectedScore >= 60 ? 'B' : projectedScore >= 40 ? 'C' : 'D',
      riskLevel: projectedScore >= 70 ? 'LOW' : projectedScore >= 40 ? 'MEDIUM' : 'HIGH',
    };
  },
});

// Tool type schema
const toolTypeSchema = z.enum(['shield', 'swap', 'bridge', 'mixer', 'all']);

interface PrivacyToolInfo {
  name: string;
  url: string;
  description: string;
  benefit: string;
}

const privacyToolsData: Record<'shield' | 'swap' | 'bridge' | 'mixer', PrivacyToolInfo[]> = {
  shield: [
    {
      name: 'Light Protocol',
      url: 'https://shield.lightprotocol.com',
      description: 'ZK-powered shielded transactions on Solana',
      benefit: 'Breaks on-chain traceability using zero-knowledge proofs',
    },
  ],
  swap: [
    {
      name: 'Jupiter',
      url: 'https://jup.ag',
      description: 'DEX aggregator for best swap rates',
      benefit: 'Route swaps through multiple DEXes to break patterns',
    },
    {
      name: 'Raydium',
      url: 'https://raydium.io/swap',
      description: 'AMM DEX on Solana',
      benefit: 'Direct swaps without CEX KYC',
    },
  ],
  bridge: [
    {
      name: 'Wormhole',
      url: 'https://wormhole.com',
      description: 'Cross-chain bridge',
      benefit: 'Move assets across chains to increase k-anonymity',
    },
    {
      name: 'Allbridge',
      url: 'https://allbridge.io',
      description: 'Multi-chain bridge',
      benefit: 'Alternative cross-chain route',
    },
  ],
  mixer: [
    {
      name: 'Elusiv (Deprecated)',
      url: 'https://elusiv.io',
      description: 'Privacy protocol (note: service ended)',
      benefit: 'Was used for private transfers',
    },
  ],
};

/**
 * Tool: Get actionable links for privacy tools
 */
export const getPrivacyToolsTool = tool({
  description: 'Get actionable links to privacy tools that can help improve wallet privacy. Returns URLs the user can click to take action.',
  inputSchema: z.object({
    toolType: toolTypeSchema.describe('Type of privacy tool to get'),
  }),
  execute: async ({ toolType }) => {
    if (toolType === 'all') {
      return privacyToolsData;
    }
    return privacyToolsData[toolType];
  },
});

// Metric type schema
const metricSchema = z.enum(['entropy', 'k_anonymity', 'clustering', 'kyc_exposure', 'dust_attack', 'temporal_patterns']);

interface MetricExplanation {
  title: string;
  meaning: string;
  risk: string;
  solution: string;
}

const metricExplanations: Record<z.infer<typeof metricSchema>, MetricExplanation> = {
  entropy: {
    title: 'Transaction Entropy',
    meaning: 'Measures randomness in your transaction amounts and timing. Low entropy means predictable patterns.',
    risk: 'Predictable patterns make it easy to link your transactions together.',
    solution: 'Use varied amounts (not round numbers) and randomize transaction timing.',
  },
  k_anonymity: {
    title: 'K-Anonymity',
    meaning: 'Number of similar wallets your behavior matches. Higher K = harder to identify you.',
    risk: 'Low K-anonymity means your wallet stands out and is easily identifiable.',
    solution: 'Use common transaction patterns, popular DEXes, and avoid unique behaviors.',
  },
  clustering: {
    title: 'Address Clustering',
    meaning: 'How many addresses can be linked to your wallet through on-chain analysis.',
    risk: 'Linked addresses reveal your full activity even if you use multiple wallets.',
    solution: 'Use fresh wallets, avoid reusing addresses, use shielded transactions.',
  },
  kyc_exposure: {
    title: 'KYC Exposure',
    meaning: 'Percentage of transactions involving known KYC exchanges (Binance, Coinbase, etc.).',
    risk: 'High KYC exposure means your identity can be linked to your wallet via exchange records.',
    solution: 'Use DEXes instead of CEXes, withdraw to fresh wallets.',
  },
  dust_attack: {
    title: 'Dust Attack Detection',
    meaning: 'Tiny unsolicited token transfers used to track your wallet activity.',
    risk: 'Attackers send dust to monitor when you move funds, linking your addresses.',
    solution: 'Never interact with unknown dust tokens, use a separate wallet.',
  },
  temporal_patterns: {
    title: 'Temporal Patterns',
    meaning: 'Regularity in when you make transactions (e.g., always at 9am UTC).',
    risk: 'Reveals your timezone and daily schedule, aids in deanonymization.',
    solution: 'Randomize transaction times, use scheduled transactions.',
  },
};

/**
 * Tool: Explain privacy metric
 */
export const explainMetricTool = tool({
  description: 'Explain what a specific privacy metric means and why it matters. Use this when the user asks about a specific metric.',
  inputSchema: z.object({
    metric: metricSchema.describe('The privacy metric to explain'),
  }),
  execute: async ({ metric }) => {
    return metricExplanations[metric];
  },
});

/**
 * Tool: Get wallet analysis history
 */
export const getWalletHistoryTool = tool({
  description: 'Get the analysis history for a wallet address. Shows previous scores and changes over time.',
  inputSchema: z.object({
    walletAddress: z.string().describe('The Solana wallet address to get history for'),
  }),
  execute: async ({ walletAddress }) => {
    const history = getWalletHistory(walletAddress);

    if (!history) {
      return {
        found: false,
        message: 'No previous analyses found for this wallet.',
      };
    }

    const analyses = history.analyses.map(a => ({
      date: new Date(a.timestamp).toISOString(),
      score: a.analysis.advancedPrivacyScore,
      grade: a.analysis.grade,
      riskLevel: a.analysis.riskLevel,
    }));

    // Compare first and last if multiple analyses
    let comparison = null;
    if (history.analyses.length > 1) {
      const first = history.analyses[0];
      const last = history.analyses[history.analyses.length - 1];
      comparison = compareAnalyses(first, last);
    }

    return {
      found: true,
      walletAddress: history.walletAddress,
      analysisCount: history.analyses.length,
      firstAnalyzed: new Date(history.firstSeen).toISOString(),
      lastAnalyzed: new Date(history.lastSeen).toISOString(),
      scoreChange: history.scoreChange,
      analyses,
      comparison,
    };
  },
});

/**
 * Tool: List all analyzed wallets
 */
export const listAnalyzedWalletsTool = tool({
  description: 'List all wallets that have been analyzed previously. Returns summary with last scores.',
  inputSchema: z.object({}),
  execute: async () => {
    const wallets = listCachedWallets();

    if (wallets.length === 0) {
      return {
        count: 0,
        message: 'No wallets have been analyzed yet.',
        wallets: [],
      };
    }

    return {
      count: wallets.length,
      wallets: wallets.map(w => ({
        address: w.walletAddress.slice(0, 8) + '...' + w.walletAddress.slice(-4),
        fullAddress: w.walletAddress,
        analysisCount: w.analysisCount,
        lastScore: w.lastScore,
        lastGrade: w.lastGrade,
        lastAnalyzed: w.lastSeen,
      })),
    };
  },
});

/**
 * Tool: Compare two wallets' privacy
 */
export const compareWalletsTool = tool({
  description: 'Compare the privacy scores and metrics of two Solana wallets. Returns which is more private and why.',
  inputSchema: z.object({
    wallet1: z.string().describe('First wallet address'),
    wallet2: z.string().describe('Second wallet address'),
  }),
  execute: async ({ wallet1, wallet2 }) => {
    // Analyze both wallets using core function
    const analysis1 = await analyzeWalletCore(wallet1);
    const analysis2 = await analyzeWalletCore(wallet2);

    // Check for errors
    if ('error' in analysis1) {
      return { error: true, message: `Failed to analyze wallet 1: ${analysis1.message}` };
    }
    if ('error' in analysis2) {
      return { error: true, message: `Failed to analyze wallet 2: ${analysis2.message}` };
    }

    const a1 = analysis1 as PrivacyAnalysis;
    const a2 = analysis2 as PrivacyAnalysis;

    // Determine winner
    const scoreDiff = a1.advancedPrivacyScore - a2.advancedPrivacyScore;
    const winner = scoreDiff > 0 ? 'wallet1' : scoreDiff < 0 ? 'wallet2' : 'tie';

    // Compare metrics
    const comparison = {
      winner,
      scoreDifference: Math.abs(scoreDiff),
      wallet1: {
        address: wallet1,
        score: a1.advancedPrivacyScore,
        grade: a1.grade,
        riskLevel: a1.riskLevel,
        entropy: a1.entropy.totalEntropy,
        linkedAddresses: a1.advancedClustering.linkedAddresses,
        dustAttacks: a1.dustAttack.suspiciousInputs,
        kycExposure: a1.exchangeFingerprint.kycExposure,
      },
      wallet2: {
        address: wallet2,
        score: a2.advancedPrivacyScore,
        grade: a2.grade,
        riskLevel: a2.riskLevel,
        entropy: a2.entropy.totalEntropy,
        linkedAddresses: a2.advancedClustering.linkedAddresses,
        dustAttacks: a2.dustAttack.suspiciousInputs,
        kycExposure: a2.exchangeFingerprint.kycExposure,
      },
      betterMetrics: {
        entropy: a1.entropy.totalEntropy > a2.entropy.totalEntropy ? 'wallet1' : 'wallet2',
        clustering: a1.advancedClustering.linkedAddresses < a2.advancedClustering.linkedAddresses ? 'wallet1' : 'wallet2',
        dustProtection: a1.dustAttack.suspiciousInputs < a2.dustAttack.suspiciousInputs ? 'wallet1' : 'wallet2',
        kycPrivacy: a1.exchangeFingerprint.kycExposure < a2.exchangeFingerprint.kycExposure ? 'wallet1' : 'wallet2',
      },
      recommendations: winner === 'wallet1'
        ? `Wallet 2 should implement: ${a2.recommendations.slice(0, 2).map(r => r.action).join('; ')}`
        : winner === 'wallet2'
        ? `Wallet 1 should implement: ${a1.recommendations.slice(0, 2).map(r => r.action).join('; ')}`
        : 'Both wallets have similar privacy levels.',
    };

    return comparison;
  },
});

// Attack simulation types
const attackTypeSchema = z.enum(['dust_attack', 'cluster_analysis', 'temporal_analysis', 'exchange_correlation']);

/**
 * Tool: Simulate privacy attack on wallet
 */
export const simulateAttackTool = tool({
  description: 'Simulate a privacy attack on a wallet to show potential vulnerabilities. Demonstrates what an attacker could learn.',
  inputSchema: z.object({
    walletAddress: z.string().describe('The wallet to simulate attack on'),
    attackType: attackTypeSchema.describe('Type of attack to simulate'),
  }),
  execute: async ({ walletAddress, attackType }) => {
    // First get the wallet analysis using core function
    const analysis = await analyzeWalletCore(walletAddress);

    if ('error' in analysis) {
      return { error: true, message: analysis.message };
    }

    const a = analysis as PrivacyAnalysis;

    switch (attackType) {
      case 'dust_attack': {
        const currentDust = a.dustAttack.suspiciousInputs;
        const vulnerability = currentDust > 0 ? 'HIGH' : a.advancedPrivacyScore < 50 ? 'MEDIUM' : 'LOW';

        return {
          attackType: 'Dust Attack Simulation',
          description: 'Attacker sends tiny amounts of tokens to track wallet activity and link addresses.',
          currentStatus: {
            existingDustInputs: currentDust,
            dustAttackDetected: a.dustAttack.dustAttackDetected,
            linkedAddresses: a.advancedClustering.linkedAddresses,
          },
          simulatedAttack: {
            scenario: 'Attacker sends 0.000001 SOL dust to your wallet',
            whatAttackerLearns: [
              'When you move funds (timing patterns)',
              'Which addresses you send to (link discovery)',
              'Your transaction frequency and amounts',
              currentDust > 5 ? 'You already interact with dust (high risk)' : 'Your dust hygiene is reasonable',
            ],
            riskLevel: vulnerability,
            potentialScoreImpact: vulnerability === 'HIGH' ? -15 : vulnerability === 'MEDIUM' ? -8 : -3,
          },
          defense: {
            immediate: 'Never interact with unsolicited tokens',
            recommended: 'Use a fresh wallet for sensitive transactions',
            tool: 'Light Protocol (https://shield.lightprotocol.com) for shielded transfers',
          },
        };
      }

      case 'cluster_analysis': {
        const linkedCount = a.advancedClustering.linkedAddresses;
        const clusterRisk = a.advancedClustering.clusterRisk;

        return {
          attackType: 'Cluster Analysis Simulation',
          description: 'Attacker uses on-chain patterns to link multiple addresses to the same entity.',
          currentStatus: {
            linkedAddresses: linkedCount,
            clusterRisk,
            kAnonymity: a.kAnonymity.kValue,
          },
          simulatedAttack: {
            scenario: 'Attacker runs graph analysis on your transaction history',
            whatAttackerLearns: [
              `${linkedCount} addresses potentially linked to you`,
              `Your anonymity set size: ${a.kAnonymity.kValue} similar wallets`,
              clusterRisk === 'HIGH' ? 'High confidence in linking your addresses' : 'Moderate difficulty linking addresses',
              'Transaction patterns reveal wallet relationships',
            ],
            riskLevel: clusterRisk,
            potentialScoreImpact: clusterRisk === 'HIGH' ? -20 : clusterRisk === 'MEDIUM' ? -10 : -5,
          },
          defense: {
            immediate: 'Use different wallets for different purposes',
            recommended: 'Break links with shielded transactions',
            tool: 'Jupiter (https://jup.ag) for pattern-breaking swaps',
          },
        };
      }

      case 'temporal_analysis': {
        const regularity = a.temporalAnalysis.regularityScore;
        const activeHours = a.temporalAnalysis.activeHours;
        const riskLevel = regularity > 0.7 ? 'HIGH' : regularity > 0.4 ? 'MEDIUM' : 'LOW';

        return {
          attackType: 'Temporal Analysis Simulation',
          description: 'Attacker analyzes transaction timing to identify timezone and behavior patterns.',
          currentStatus: {
            regularityScore: regularity,
            activeHours,
            predictability: regularity > 0.6 ? 'High' : regularity > 0.3 ? 'Medium' : 'Low',
          },
          simulatedAttack: {
            scenario: 'Attacker analyzes timestamps of your transactions',
            whatAttackerLearns: [
              `Most active hours: ${activeHours.slice(0, 3).join(', ')} UTC`,
              `Timing predictability: ${(regularity * 100).toFixed(0)}%`,
              regularity > 0.5 ? 'Can predict when you transact' : 'Transaction timing is reasonably random',
              'Potential timezone/location inference',
            ],
            riskLevel,
            potentialScoreImpact: riskLevel === 'HIGH' ? -12 : riskLevel === 'MEDIUM' ? -6 : -2,
          },
          defense: {
            immediate: 'Vary your transaction times',
            recommended: 'Use scheduled/delayed transactions',
            tool: 'Set random delays or use automation tools',
          },
        };
      }

      case 'exchange_correlation': {
        const kycExposure = a.exchangeFingerprint.kycExposure;
        const exchangeCount = a.exchangeFingerprint.exchangeInteractions;
        const riskLevel = kycExposure > 0.3 ? 'HIGH' : kycExposure > 0.1 ? 'MEDIUM' : 'LOW';

        return {
          attackType: 'Exchange Correlation Simulation',
          description: 'Attacker uses exchange data (via subpoena/hack) to link wallet to real identity.',
          currentStatus: {
            kycExposure: `${(kycExposure * 100).toFixed(1)}%`,
            exchangeInteractions: exchangeCount,
            identityRisk: riskLevel,
          },
          simulatedAttack: {
            scenario: 'Exchange data breach or legal subpoena reveals your transactions',
            whatAttackerLearns: [
              exchangeCount > 0 ? `${exchangeCount} transactions with KYC exchanges` : 'No direct KYC exchange exposure',
              kycExposure > 0.2 ? 'High likelihood of identity linkage' : 'Lower identity exposure',
              'Deposit/withdrawal patterns',
              'Connected wallet addresses',
            ],
            riskLevel,
            potentialScoreImpact: riskLevel === 'HIGH' ? -25 : riskLevel === 'MEDIUM' ? -12 : -4,
          },
          defense: {
            immediate: 'Minimize CEX usage',
            recommended: 'Use DEXes like Jupiter/Raydium instead',
            tool: 'Jupiter (https://jup.ag) or Raydium (https://raydium.io)',
          },
        };
      }

      default:
        return { error: true, message: 'Unknown attack type' };
    }
  },
});

// Export all tools
export const agentTools = {
  analyzeWallet: analyzeWalletTool,
  projectScore: projectScoreTool,
  getPrivacyTools: getPrivacyToolsTool,
  explainMetric: explainMetricTool,
  getWalletHistory: getWalletHistoryTool,
  listAnalyzedWallets: listAnalyzedWalletsTool,
  compareWallets: compareWalletsTool,
  simulateAttack: simulateAttackTool,
};
