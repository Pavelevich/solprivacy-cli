#!/usr/bin/env node

// Force color support
process.env.FORCE_COLOR = '1';

import chalk from 'chalk';
import axios from 'axios';
import { select, input, confirm } from '@inquirer/prompts';
import autocomplete from 'inquirer-autocomplete-standalone';
import figures from 'figures';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  runAgent,
  quickAnalysis,
  deepAnalysis,
  compareWallets as agentCompareWallets,
  SUPPORTED_PROVIDERS,
  getProviderInfo,
  LLMConfig,
  LLMProvider,
  listCachedWallets,
  getCacheStats,
  clearAllCache,
  getWalletHistory,
} from './agent/index.js';

// API Configuration
const API_URL = process.env.SOLPRIVACY_API_URL || 'https://solprivacy.xyz';
const SOLPRIVACY_DIR = path.join(os.homedir(), '.solprivacy');
const CONFIG_FILE = path.join(SOLPRIVACY_DIR, 'config.json');
const SNAPSHOTS_DIR = path.join(SOLPRIVACY_DIR, 'snapshots');

// Ensure directories exist
if (!fs.existsSync(SOLPRIVACY_DIR)) {
  fs.mkdirSync(SOLPRIVACY_DIR, { recursive: true });
}
if (!fs.existsSync(SNAPSHOTS_DIR)) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

// Config management
interface AppConfig {
  heliusApiKey?: string;
  savedAt?: string;
  llm?: {
    provider: LLMProvider;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };
}

function loadConfig(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch {
    // Ignore errors, return empty config
  }
  return {};
}

function saveConfig(config: AppConfig): void {
  config.savedAt = new Date().toISOString();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function getHeliusApiKey(): string {
  // Priority: env var > saved config
  if (process.env.HELIUS_API_KEY) {
    return process.env.HELIUS_API_KEY;
  }
  const config = loadConfig();
  return config.heliusApiKey || '';
}

// Types
interface PrivacyAnalysis {
  advancedPrivacyScore: number;
  grade: string;
  riskLevel: string;
  entropy: { totalEntropy: number };
  mutualInformation: { totalMutualInformation: number };
  differentialPrivacy: { epsilon: number };
  kAnonymity: { kValue: number; kAnonymityScore: number };
  advancedClustering: { clusteringVulnerability: number };
  temporalAnalysis: {
    autocorrelation: number;
    periodicityScore?: number;
    detectedPeriods?: Array<{ period: string; confidence: number }>;
    burstinessCoefficient?: number;
    interArrivalEntropy?: number;
    timezoneConfidence?: number;
    estimatedTimezone?: string;
    interpretation?: string;
  };
  networkCentrality: { networkVisibility: number };
  mixerDetection: { mixerUsageProbability: number };
  crossChain: { bridgeUsageDetected: boolean; detectedBridges: string[] };
  dustAttack: {
    dustAttackDetected: boolean;
    dustVulnerability: number;
    dustTransactionsReceived: number;
    uniqueDustSenders: string[] | number;
    linkingRisk: string;
  };
  exchangeFingerprint: {
    kycExposure: number;
    traceabilityRisk: string;
    detectedExchanges: Array<{ name: string; type: string }>;
  };
  recommendations: Array<{
    action: string;
    impact: string;
    priority: string;
  }>;
}

interface AnalysisHistory {
  address: string;
  score: number;
  grade: string;
  timestamp: string;
}

// Storage
const analysisHistory: AnalysisHistory[] = [];
let lastAnalyzedWallet: string | null = null;
let lastAnalyzedData: PrivacyAnalysis | null = null;
let apiCallsThisSession = 0;

// ASCII Art Banner - SOLPRIVACY
const banner = `
${chalk.hex('#9945FF')('███████╗')}${chalk.hex('#14F195')(' ██████╗ ')}${chalk.hex('#9945FF')('██╗     ')}${chalk.hex('#14F195')('██████╗ ')}${chalk.hex('#9945FF')('██████╗ ')}${chalk.hex('#14F195')('██╗')}${chalk.hex('#9945FF')('██╗   ██╗')}${chalk.hex('#14F195')(' █████╗ ')}${chalk.hex('#9945FF')(' ██████╗')}${chalk.hex('#14F195')('██╗   ██╗')}
${chalk.hex('#9945FF')('██╔════╝')}${chalk.hex('#14F195')('██╔═══██╗')}${chalk.hex('#9945FF')('██║     ')}${chalk.hex('#14F195')('██╔══██╗')}${chalk.hex('#9945FF')('██╔══██╗')}${chalk.hex('#14F195')('██║')}${chalk.hex('#9945FF')('██║   ██║')}${chalk.hex('#14F195')('██╔══██╗')}${chalk.hex('#9945FF')('██╔════╝')}${chalk.hex('#14F195')('╚██╗ ██╔╝')}
${chalk.hex('#9945FF')('███████╗')}${chalk.hex('#14F195')('██║   ██║')}${chalk.hex('#9945FF')('██║     ')}${chalk.hex('#14F195')('██████╔╝')}${chalk.hex('#9945FF')('██████╔╝')}${chalk.hex('#14F195')('██║')}${chalk.hex('#9945FF')('██║   ██║')}${chalk.hex('#14F195')('███████║')}${chalk.hex('#9945FF')('██║     ')}${chalk.hex('#14F195')(' ╚████╔╝ ')}
${chalk.hex('#9945FF')('╚════██║')}${chalk.hex('#14F195')('██║   ██║')}${chalk.hex('#9945FF')('██║     ')}${chalk.hex('#14F195')('██╔═══╝ ')}${chalk.hex('#9945FF')('██╔══██╗')}${chalk.hex('#14F195')('██║')}${chalk.hex('#9945FF')('╚██╗ ██╔╝')}${chalk.hex('#14F195')('██╔══██║')}${chalk.hex('#9945FF')('██║     ')}${chalk.hex('#14F195')('  ╚██╔╝  ')}
${chalk.hex('#9945FF')('███████║')}${chalk.hex('#14F195')('╚██████╔╝')}${chalk.hex('#9945FF')('███████╗')}${chalk.hex('#14F195')('██║     ')}${chalk.hex('#9945FF')('██║  ██║')}${chalk.hex('#14F195')('██║')}${chalk.hex('#9945FF')(' ╚████╔╝ ')}${chalk.hex('#14F195')('██║  ██║')}${chalk.hex('#9945FF')('╚██████╗')}${chalk.hex('#14F195')('   ██║   ')}
${chalk.hex('#9945FF')('╚══════╝')}${chalk.hex('#14F195')(' ╚═════╝ ')}${chalk.hex('#9945FF')('╚══════╝')}${chalk.hex('#14F195')('╚═╝     ')}${chalk.hex('#9945FF')('╚═╝  ╚═╝')}${chalk.hex('#14F195')('╚═╝')}${chalk.hex('#9945FF')('  ╚═══╝  ')}${chalk.hex('#14F195')('╚═╝  ╚═╝')}${chalk.hex('#9945FF')(' ╚═════╝')}${chalk.hex('#14F195')('   ╚═╝   ')}
`;

// Icon definitions using figures (ESM import maps to figures object directly)
const icons = {
  analyze: figures.radioOn,        // ◉
  quick: figures.play,             // ▶
  compare: figures.arrowLeftRight, // ↔
  deanon: figures.warning,         // ⚠
  attack: figures.cross,           // ✘
  timezone: '◷',                   // clock
  fingerprint: figures.pointer,    // ❯
  taint: figures.arrowRight,       // →
  history: figures.line,           // ─
  leaderboard: figures.star,       // ★
  helius: figures.nodejs,          // ⬢
  export: figures.arrowDown,       // ↓
  batch: '☰',                      // hamburger
  watch: figures.bullet,           // ●
  graph: figures.lozenge,          // ◆
  diff: figures.notEqual,          // ≠
  trace: figures.pointerSmall,     // pointer for trace
  examples: figures.info,          // ℹ
  help: figures.circleQuestionMark,// ?○
  clear: figures.squareSmallFilled,// ◼
  exit: figures.cross,             // ✘
  success: figures.tick,           // ✔
  error: figures.cross,            // ✘
  warn: figures.warning,           // ⚠
  agent: figures.star,             // ★
  config: figures.hamburger,       // ☰
};

// Command definitions for interactive selector
const COMMANDS = [
  { value: '/analyze', name: `${icons.analyze} /analyze        Full privacy analysis`, description: 'Complete wallet privacy scan' },
  { value: '/quick', name: `${icons.quick} /quick          Quick privacy score`, description: 'Fast score lookup' },
  { value: '/compare', name: `${icons.compare} /compare        Compare two wallets`, description: 'Side-by-side comparison' },
  { value: '/deanon', name: `${icons.deanon} /deanon         Deanonymization risk`, description: 'Attack vector analysis' },
  { value: '/attack-sim', name: `${icons.attack} /attack-sim     Simulate attacks`, description: 'Forensics tool simulation' },
  { value: '/timezone', name: `${icons.timezone} /timezone       Timezone inference`, description: 'Infer geographic location' },
  { value: '/fingerprint', name: `${icons.fingerprint} /fingerprint    Behavioral fingerprint`, description: 'Wallet uniqueness analysis' },
  { value: '/taint', name: `${icons.taint} /taint          Taint flow analysis`, description: 'Fund contamination tracing' },
  { value: '/history', name: `${icons.history} /history        Analysis history`, description: 'Past analyses' },
  { value: '/leaderboard', name: `${icons.leaderboard} /leaderboard    Privacy ranking`, description: 'Top analyzed wallets' },
  { value: '/helius', name: `${icons.helius} /helius         Helius API stats`, description: 'API integration info' },
  { value: '/export', name: `${icons.export} /export         Export HTML report`, description: 'Generate report file' },
  { value: '/batch', name: `${icons.batch} /batch          Batch analyze`, description: 'Analyze multiple wallets from file' },
  { value: '/watch', name: `${icons.watch} /watch          Monitor wallet`, description: 'Real-time privacy monitoring' },
  { value: '/helius-direct', name: `${icons.helius} /helius-direct  Direct Helius API`, description: 'Analyze using your Helius key' },
  { value: '/graph-export', name: `${icons.graph} /graph-export   Export graph`, description: 'Export transaction graph DOT/GraphML' },
  { value: '/diff', name: `${icons.diff} /diff           Privacy diff`, description: 'Compare snapshots over time' },
  { value: '/trace', name: `${icons.trace} /trace          Trace stolen funds`, description: 'FIFO taint analysis for theft recovery' },
  { value: '/agent', name: `${icons.agent} /agent          AI Privacy Agent`, description: 'AI-powered privacy recommendations' },
  { value: '/config-llm', name: `${icons.config} /config-llm     Configure AI`, description: 'Set up LLM provider (OpenAI, Claude, Grok)' },
  { value: '/examples', name: `${icons.examples} /examples       Example wallets`, description: 'Test wallet addresses' },
  { value: '/help', name: `${icons.help} /help           Show all commands`, description: 'Display this menu' },
  { value: '/clear', name: `${icons.clear} /clear          Clear screen`, description: 'Clear terminal' },
  { value: '/exit', name: `${icons.exit} /exit           Exit CLI`, description: 'Quit program' },
];

// Helper to get wallet address
async function getWalletAddress(promptText: string = 'Wallet address'): Promise<string> {
  return input({
    message: promptText,
    theme: {
      prefix: chalk.hex('#9945FF')('  '),
      style: {
        message: (text: string) => chalk.cyan(text),
        answer: (text: string) => chalk.white(text),
      }
    }
  });
}

function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

// Validate wallet with detailed error messages
function validateWallet(address: string): { valid: boolean; error?: string } {
  const trimmed = address.trim();

  if (!trimmed) {
    return { valid: false, error: 'Wallet address cannot be empty' };
  }

  if (trimmed.length < 32) {
    return { valid: false, error: `Address too short (${trimmed.length} chars). Solana addresses are 32-44 characters` };
  }

  if (trimmed.length > 44) {
    return { valid: false, error: `Address too long (${trimmed.length} chars). Solana addresses are 32-44 characters` };
  }

  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed)) {
    return { valid: false, error: 'Invalid characters. Solana addresses use Base58 encoding (no 0, O, I, l)' };
  }

  return { valid: true };
}

function getScoreColor(score: number): chalk.Chalk {
  if (score >= 80) return chalk.green;
  if (score >= 60) return chalk.yellow;
  if (score >= 40) return chalk.hex('#FFA500'); // Orange
  return chalk.red;
}

function getRiskColor(risk: string): chalk.Chalk {
  switch (risk.toUpperCase()) {
    case 'MINIMAL':
    case 'LOW':
      return chalk.green;
    case 'MEDIUM':
      return chalk.yellow;
    case 'HIGH':
    case 'CRITICAL':
      return chalk.red;
    default:
      return chalk.white;
  }
}

function formatPercentage(value: number): string {
  return (value * 100).toFixed(1) + '%';
}

// API Functions
async function analyzeWallet(address: string): Promise<PrivacyAnalysis | null> {
  try {
    apiCallsThisSession++;
    const response = await axios.get(`${API_URL}/api/v3/analyze/${address}`, {
      timeout: 60000,
      headers: {
        'User-Agent': 'SolPrivacy-CLI/1.0.0',
        'Accept': 'application/json'
      }
    });

    if (response.data.success) {
      lastAnalyzedWallet = address;
      lastAnalyzedData = response.data.data;
      return response.data.data;
    }
    return null;
  } catch (error: any) {
    if (error.response?.status === 429) {
      console.log(chalk.red('\n[ERROR] Rate limit exceeded. Please wait a few minutes.'));
    } else if (error.response?.status === 400) {
      console.log(chalk.red('\n[ERROR] Invalid Solana address format.'));
    } else {
      console.log(chalk.red(`\n[ERROR] API Error: ${error.message}`));
    }
    return null;
  }
}

// Display Functions
function displayAnalysis(data: PrivacyAnalysis, address: string): void {
  const scoreColor = getScoreColor(data.advancedPrivacyScore);
  const riskColor = getRiskColor(data.riskLevel);

  console.log(chalk.cyan('\n' + '═'.repeat(70)));
  console.log(chalk.cyan.bold('                    PRIVACY ANALYSIS REPORT'));
  console.log(chalk.cyan('═'.repeat(70)));

  // Address
  console.log(chalk.gray('\n  Wallet: ') + chalk.white(address));

  // Score box - fixed 60 char width for cleaner display
  const W = 60;
  const line = (content: string, visibleLen: number) => {
    const pad = W - visibleLen;
    const left = Math.floor(pad / 2);
    const right = pad - left;
    return chalk.cyan('│') + ' '.repeat(left) + content + ' '.repeat(right) + chalk.cyan('│');
  };

  console.log(chalk.cyan('\n┌' + '─'.repeat(W) + '┐'));
  console.log(line('PRIVACY SCORE', 13));
  console.log(line('', 0));
  console.log(line(scoreColor.bold(data.advancedPrivacyScore.toString()), data.advancedPrivacyScore.toString().length));
  console.log(line('Grade: ' + scoreColor.bold(data.grade), 7 + data.grade.length));
  console.log(line('Risk: ' + riskColor.bold(data.riskLevel), 6 + data.riskLevel.length));
  console.log(chalk.cyan('└' + '─'.repeat(W) + '┘'));

  // Metrics
  console.log(chalk.hex('#9945FF').bold('\n  PRIVACY METRICS'));
  console.log(chalk.gray('  ' + '─'.repeat(66)));

  const metrics = [
    { name: 'Shannon Entropy', value: data.entropy.totalEntropy.toFixed(2), good: data.entropy.totalEntropy > 0.6 },
    { name: 'Mutual Information', value: data.mutualInformation.totalMutualInformation.toFixed(2), good: data.mutualInformation.totalMutualInformation < 0.3 },
    { name: 'Differential Privacy (ε)', value: data.differentialPrivacy.epsilon.toFixed(2), good: data.differentialPrivacy.epsilon < 3 },
    { name: 'k-Anonymity', value: data.kAnonymity.kValue.toString(), good: data.kAnonymity.kValue >= 50 },
    { name: 'Clustering Vulnerability', value: formatPercentage(data.advancedClustering.clusteringVulnerability), good: data.advancedClustering.clusteringVulnerability < 0.3 },
    { name: 'Temporal Patterns', value: data.temporalAnalysis.autocorrelation.toFixed(2), good: Math.abs(data.temporalAnalysis.autocorrelation) < 0.2 },
    { name: 'Network Centrality', value: data.networkCentrality.networkVisibility.toFixed(2), good: data.networkCentrality.networkVisibility < 0.5 },
    { name: 'Mixer Detection', value: formatPercentage(data.mixerDetection.mixerUsageProbability), good: true },
  ];

  metrics.forEach(m => {
    const valueColor = m.good ? chalk.green : chalk.yellow;
    console.log(`  ${chalk.white(m.name.padEnd(25))} ${valueColor(m.value.padStart(10))}`);
  });

  // Attack Detection
  console.log(chalk.hex('#14F195').bold('\n  ATTACK DETECTION'));
  console.log(chalk.gray('  ' + '─'.repeat(66)));

  // Dust Attack
  if (data.dustAttack.dustAttackDetected) {
    console.log(chalk.red('  ⚠ DUST ATTACK DETECTED'));
    console.log(chalk.gray(`    Transactions: ${data.dustAttack.dustTransactionsReceived}`));
    const senderCount = Array.isArray(data.dustAttack.uniqueDustSenders)
      ? data.dustAttack.uniqueDustSenders.length
      : data.dustAttack.uniqueDustSenders;
    console.log(chalk.gray(`    Unique Senders: ${senderCount}`));
    console.log(chalk.gray(`    Vulnerability: ${formatPercentage(data.dustAttack.dustVulnerability)}`));
    console.log(chalk.gray(`    Linking Risk: `) + getRiskColor(data.dustAttack.linkingRisk)(data.dustAttack.linkingRisk));
  } else {
    console.log(chalk.green('  ✓ No dust attack activity detected'));
  }

  // Cross-chain
  if (data.crossChain.bridgeUsageDetected) {
    console.log(chalk.yellow(`\n  ⚠ Cross-chain bridges detected: ${data.crossChain.detectedBridges.join(', ')}`));
  } else {
    console.log(chalk.green('\n  ✓ No cross-chain linkability detected'));
  }

  // Exchange Exposure
  console.log(chalk.hex('#9945FF').bold('\n  EXCHANGE EXPOSURE'));
  console.log(chalk.gray('  ' + '─'.repeat(66)));
  console.log(`  KYC Exposure:       ${formatPercentage(data.exchangeFingerprint.kycExposure)}`);
  console.log(`  Traceability Risk:  ${getRiskColor(data.exchangeFingerprint.traceabilityRisk)(data.exchangeFingerprint.traceabilityRisk)}`);

  if (data.exchangeFingerprint.detectedExchanges.length > 0) {
    console.log(chalk.gray('  Detected exchanges:'));
    data.exchangeFingerprint.detectedExchanges.forEach(ex => {
      const typeColor = ex.type === 'CEX' ? chalk.red : chalk.cyan;
      console.log(`    - ${ex.name} (${typeColor(ex.type)})`);
    });
  }

  // Recommendations
  if (data.recommendations.length > 0) {
    console.log(chalk.hex('#14F195').bold('\n  RECOMMENDATIONS'));
    console.log(chalk.gray('  ' + '─'.repeat(66)));

    data.recommendations.forEach((rec, i) => {
      const priorityColor = rec.priority === 'HIGH' ? chalk.red : rec.priority === 'MEDIUM' ? chalk.yellow : chalk.green;
      console.log(`  ${i + 1}. [${priorityColor(rec.priority)}] ${chalk.white(rec.action)}`);
      console.log(chalk.gray(`     Impact: ${rec.impact}`));
    });
  }

  console.log(chalk.cyan('\n' + '═'.repeat(70)));

  // Save to history
  analysisHistory.push({
    address,
    score: data.advancedPrivacyScore,
    grade: data.grade,
    timestamp: new Date().toISOString()
  });
}

function displayQuickAnalysis(data: PrivacyAnalysis, address: string): void {
  const scoreColor = getScoreColor(data.advancedPrivacyScore);
  const riskColor = getRiskColor(data.riskLevel);

  const W = 50;
  const qLine = (content: string, visibleLen: number) => {
    const pad = W - visibleLen;
    const left = Math.floor(pad / 2);
    const right = pad - left;
    return chalk.cyan('│') + ' '.repeat(left) + content + ' '.repeat(right) + chalk.cyan('│');
  };

  // Build the data line: "Score: 47/100  Grade: F  Risk: HIGH"
  const scoreNum = data.advancedPrivacyScore.toString();
  const dataText = `Score: ${scoreNum}/100  Grade: ${data.grade}  Risk: ${data.riskLevel}`;
  const dataContent = `Score: ${scoreColor.bold(scoreNum)}/100  Grade: ${scoreColor.bold(data.grade)}  Risk: ${riskColor.bold(data.riskLevel)}`;

  console.log(chalk.cyan('\n┌' + '─'.repeat(W) + '┐'));
  console.log(qLine('QUICK PRIVACY SCORE', 19));
  console.log(chalk.cyan('├' + '─'.repeat(W) + '┤'));
  console.log(qLine(dataContent, dataText.length));
  console.log(chalk.cyan('└' + '─'.repeat(W) + '┘'));

  if (data.dustAttack.dustAttackDetected) {
    console.log(chalk.red('  ⚠ WARNING: Dust attack activity detected!'));
  }

  // Save to history
  analysisHistory.push({
    address,
    score: data.advancedPrivacyScore,
    grade: data.grade,
    timestamp: new Date().toISOString()
  });
}

function displayHistory(): void {
  // Get persistent cache stats and wallets
  const stats = getCacheStats();
  const cachedWallets = listCachedWallets();

  console.log(chalk.hex('#9945FF').bold('\n  ANALYSIS HISTORY\n'));

  // Show cache stats
  console.log(chalk.gray('  Cache Statistics:'));
  console.log(chalk.gray(`    Wallets analyzed: ${stats.totalWallets}`));
  console.log(chalk.gray(`    Total analyses: ${stats.totalAnalyses}`));
  console.log(chalk.gray(`    Cache size: ${stats.cacheSize}`));
  if (stats.newestEntry) {
    console.log(chalk.gray(`    Last analysis: ${new Date(stats.newestEntry).toLocaleString()}`));
  }
  console.log('');

  if (cachedWallets.length === 0 && analysisHistory.length === 0) {
    console.log(chalk.yellow('  No analysis history yet. Analyze a wallet to get started.\n'));
    return;
  }

  // Show persistent history
  if (cachedWallets.length > 0) {
    console.log(chalk.cyan('  Saved Analyses (persistent):'));
    console.log(chalk.gray('  ' + '─'.repeat(70)));

    cachedWallets.slice(0, 10).forEach((item, i) => {
      const scoreColor = getScoreColor(item.lastScore);
      const date = new Date(item.lastSeen).toLocaleString();
      const count = item.analysisCount > 1 ? chalk.gray(` (${item.analysisCount}x)`) : '';
      console.log(
        `  ${i + 1}. ${chalk.gray(item.walletAddress.slice(0, 8))}...${chalk.gray(item.walletAddress.slice(-6))} | ` +
        `Score: ${scoreColor(item.lastScore.toString().padStart(2))} (${item.lastGrade})${count} | ` +
        `${chalk.gray(date)}`
      );
    });
  }

  // Show session history if different
  if (analysisHistory.length > 0) {
    console.log('');
    console.log(chalk.cyan('  This Session:'));
    console.log(chalk.gray('  ' + '─'.repeat(70)));

    analysisHistory.slice(-5).forEach((item, i) => {
      const scoreColor = getScoreColor(item.score);
      const date = new Date(item.timestamp).toLocaleString();
      console.log(
        `  ${i + 1}. ${chalk.gray(item.address.slice(0, 8))}...${chalk.gray(item.address.slice(-6))} | ` +
        `Score: ${scoreColor(item.score.toString().padStart(2))} (${item.grade}) | ` +
        `${chalk.gray(date)}`
      );
    });
  }

  console.log('');
}

async function compareWallets(): Promise<void> {
  const address1 = await getWalletAddress('First wallet address');
  const validation1 = validateWallet(address1);
  if (!validation1.valid) {
    console.log(chalk.red(`  [ERROR] ${validation1.error}`));
    return;
  }

  const address2 = await getWalletAddress('Second wallet address');
  const validation2 = validateWallet(address2);
  if (!validation2.valid) {
    console.log(chalk.red(`  [ERROR] ${validation2.error}`));
    return;
  }

  const addr1 = address1.trim();
  const addr2 = address2.trim();

  // Check if same wallet
  if (addr1 === addr2) {
    console.log(chalk.yellow('\n  [WARNING] Cannot compare a wallet with itself'));
    console.log(chalk.gray('  Please provide two different wallet addresses'));
    return;
  }

  console.log(chalk.yellow('\n  [ANALYZING] Comparing wallets...'));

  // Check if LLM is configured - use agent for smarter comparison
  const config = loadConfig();
  if (config.llm?.provider) {
    try {
      const llmConfig: LLMConfig = {
        provider: config.llm.provider,
        apiKey: config.llm.apiKey,
        model: config.llm.model,
        baseUrl: config.llm.baseUrl,
      };

      const result = await agentCompareWallets(addr1, addr2, { llmConfig });

      console.log(chalk.hex('#14F195').bold('\n  AI COMPARISON:\n'));
      console.log(chalk.white(result.text));

      if (result.toolCalls.length > 0) {
        console.log(chalk.gray('\n  ' + '─'.repeat(50)));
        console.log(chalk.gray('  Tools used:'));
        for (const tc of result.toolCalls) {
          console.log(chalk.gray(`    • ${tc.name}`));
        }
      }
      return;
    } catch (error) {
      console.log(chalk.yellow('  Agent comparison failed, falling back to API...'));
    }
  }

  // Fallback to API
  try {
    const response = await axios.get(`${API_URL}/api/v3/compare`, {
      params: { wallet1: addr1, wallet2: addr2 },
      timeout: 120000,
      headers: {
        'User-Agent': 'SolPrivacy-CLI/1.0.0',
        'Accept': 'application/json'
      }
    });

    if (response.data.success) {
      const { wallet1, wallet2, comparison } = response.data.data;

      console.log(chalk.cyan('\n  WALLET COMPARISON'));
      console.log(chalk.gray('  ' + '─'.repeat(50)));
      console.log(`  Wallet 1: ${chalk.gray(addr1.slice(0, 8))}...`);
      console.log(`    Score: ${getScoreColor(wallet1.score)(wallet1.score)} | Grade: ${wallet1.grade}`);
      console.log(`  Wallet 2: ${chalk.gray(addr2.slice(0, 8))}...`);
      console.log(`    Score: ${getScoreColor(wallet2.score)(wallet2.score)} | Grade: ${wallet2.grade}`);
      console.log(chalk.gray('  ' + '─'.repeat(50)));
      console.log(`  More Private: ${chalk.green(comparison.morePrivate === 'wallet1' ? 'Wallet 1' : 'Wallet 2')}`);
      console.log(`  Score Diff:   ${Math.abs(comparison.scoreDifference)} points`);
    }
  } catch (error: any) {
    console.log(chalk.red(`  [ERROR] ${error.message}`));
  }
}

// ============================================
// UNIQUE FEATURES - BEAT THE COMPETITION
// ============================================

// Deanonymization Probability Calculator
function displayDeanonProbability(data: PrivacyAnalysis, address: string): void {
  console.log(chalk.red.bold('\n  ⚠️  DEANONYMIZATION PROBABILITY CALCULATOR'));
  console.log(chalk.gray('  ' + '─'.repeat(60)));

  const attacks = [
    {
      name: 'Temporal Fingerprinting',
      prob: Math.min(95, 100 - Math.abs(data.temporalAnalysis.autocorrelation) * 50 - data.entropy.totalEntropy * 30),
      desc: 'Timezone inference from transaction timing patterns'
    },
    {
      name: 'Graph Topology Attack',
      prob: Math.min(90, data.advancedClustering.clusteringVulnerability * 100 + 20),
      desc: 'Wallet linking through counterparty network analysis'
    },
    {
      name: 'Exchange Correlation',
      prob: Math.min(95, data.exchangeFingerprint.kycExposure * 100 + 15),
      desc: 'Matching deposits/withdrawals to KYC\'d exchange accounts'
    },
    {
      name: 'Dust Attack Tracking',
      prob: data.dustAttack.dustAttackDetected
        ? Math.min(90, 50 + data.dustAttack.dustVulnerability * 40)
        : 10,
      desc: 'Tracking spending patterns of dust transactions'
    },
    {
      name: 'Amount Heuristics',
      prob: Math.min(80, 100 - data.entropy.totalEntropy * 60),
      desc: 'Round number patterns reveal behavioral fingerprints'
    },
    {
      name: 'Cross-chain Linkage',
      prob: data.crossChain.bridgeUsageDetected ? 75 : 5,
      desc: 'Bridge transactions link identities across chains'
    }
  ];

  console.log(chalk.white.bold('\n  Attack Vector Analysis:\n'));

  attacks.forEach(attack => {
    const prob = Math.max(0, Math.min(100, attack.prob));
    const barFilled = Math.floor(prob / 5);
    const barEmpty = 20 - barFilled;
    const probColor = prob >= 70 ? chalk.red : prob >= 40 ? chalk.yellow : chalk.green;

    console.log(`  ${chalk.white(attack.name.padEnd(25))} ${probColor(prob.toFixed(0).padStart(3) + '%')}`);
    console.log(`  ${probColor('█'.repeat(barFilled))}${chalk.gray('░'.repeat(barEmpty))}`);
    console.log(chalk.gray(`  ${attack.desc}\n`));
  });

  const combinedRisk = Math.min(99, attacks.reduce((sum, a) => sum + Math.max(0, a.prob), 0) / attacks.length + 15);
  const timeToDeAnon = combinedRisk > 70 ? '< 2 hours' : combinedRisk > 50 ? '< 1 day' : combinedRisk > 30 ? '< 1 week' : '> 1 month';

  console.log(chalk.gray('  ' + '─'.repeat(60)));
  console.log(chalk.white.bold('  COMBINED DEANONYMIZATION RISK: ') + chalk.red.bold(combinedRisk.toFixed(0) + '%'));
  console.log(chalk.gray('  Estimated time to identification: ') + chalk.yellow(timeToDeAnon));
  console.log('');
}

// Attack Simulation
async function displayAttackSimulation(data: PrivacyAnalysis, address: string): Promise<void> {
  console.log(chalk.red.bold(`\n  ${figures.radioOn} ADVERSARY ATTACK SIMULATION`));
  console.log(chalk.gray('  Simulating real-world blockchain forensics tools...\n'));

  const attacks = [
    { name: 'Chainalysis Reactor', success: data.advancedPrivacyScore < 60, time: '30 min', desc: 'Enterprise blockchain analytics' },
    { name: 'Elliptic Navigator', success: data.advancedPrivacyScore < 50, time: '1 hour', desc: 'Compliance & investigation' },
    { name: 'Arkham Intelligence', success: data.advancedPrivacyScore < 70, time: '15 min', desc: 'Entity identification' },
    { name: 'Nansen Query', success: data.exchangeFingerprint.kycExposure > 0.3, time: '5 min', desc: 'Smart money tracking' },
    { name: 'TRM Labs', success: data.advancedPrivacyScore < 55, time: '45 min', desc: 'Risk assessment' },
    { name: 'FBI Blockchain Unit', success: data.advancedPrivacyScore < 40, time: '2 hours', desc: 'Law enforcement' },
    { name: 'Crystal Blockchain', success: data.dustAttack.dustAttackDetected, time: '20 min', desc: 'Transaction monitoring' },
  ];

  console.log(chalk.white('  ' + 'Adversary Tool'.padEnd(25) + 'Result'.padEnd(20) + 'Time'));
  console.log(chalk.gray('  ' + '─'.repeat(55)));

  for (const attack of attacks) {
    await new Promise(r => setTimeout(r, 150)); // Dramatic effect
    const status = attack.success
      ? chalk.red('⚠️  IDENTIFIED')
      : chalk.green('✓ PROTECTED');
    console.log(`  ${chalk.white(attack.name.padEnd(25))} ${status.padEnd(20)} ${chalk.gray('(' + attack.time + ')')}`);
  }

  const successCount = attacks.filter(a => a.success).length;
  const vulnerabilityLevel = successCount >= 5 ? 'CRITICAL' : successCount >= 3 ? 'HIGH' : successCount >= 1 ? 'MEDIUM' : 'LOW';
  const vulnColor = successCount >= 5 ? chalk.red : successCount >= 3 ? chalk.yellow : chalk.green;

  console.log(chalk.gray('\n  ' + '─'.repeat(55)));
  console.log(chalk.white.bold('  VULNERABILITY RATING: ') + vulnColor.bold(`${successCount}/${attacks.length} attacks successful`));
  console.log(chalk.white.bold('  THREAT LEVEL: ') + vulnColor.bold(vulnerabilityLevel));

  if (successCount >= 3) {
    console.log(chalk.red('\n  ⚠️  RECOMMENDATION: Consider migrating to a fresh wallet'));
    console.log(chalk.gray('     and using privacy tools like Light Protocol'));
  }
  console.log('');
}

// ============================================
// ADVANCED ANALYSIS FEATURES
// Based on academic research papers
// ============================================

// Temporal Pattern Analysis
// Based on "Time Tells All" (2025) - arXiv:2508.21440
function displayTimezoneInference(data: PrivacyAnalysis, address: string): void {
  console.log(chalk.hex('#FF6B6B').bold('\n  🌍 TEMPORAL FINGERPRINT ANALYSIS'));
  console.log(chalk.gray('  Timing patterns can reveal your identity\n'));

  const temporal = data.temporalAnalysis;

  // Timezone Inference (REAL API data)
  console.log(chalk.white.bold('  Timezone Inference:\n'));
  console.log(chalk.gray('  ' + '─'.repeat(55)));

  if (temporal.estimatedTimezone && temporal.timezoneConfidence) {
    const tzConf = Math.round(temporal.timezoneConfidence * 100);
    const tzColor = tzConf >= 70 ? chalk.red : tzConf >= 50 ? chalk.yellow : chalk.green;

    console.log(`  ${chalk.white('Estimated Timezone:')}  ${chalk.hex('#14F195').bold(temporal.estimatedTimezone)}`);

    const tzBarLen = Math.floor(tzConf / 5);
    console.log(`  ${chalk.white('Confidence:')}          ${tzColor('█'.repeat(tzBarLen))}${chalk.gray('░'.repeat(20 - tzBarLen))} ${tzColor.bold(tzConf + '%')}`);
  } else {
    console.log(chalk.gray('  Timezone data not available'));
  }

  // Pattern Regularity (REAL API data)
  console.log(chalk.white.bold('\n  Pattern Regularity:\n'));

  const autocorr = temporal.autocorrelation;
  const absAutocorr = Math.abs(autocorr);
  const regularity = absAutocorr >= 0.5 ? 'Predictable' : absAutocorr >= 0.2 ? 'Semi-Regular' : 'Random';
  const regColor = absAutocorr >= 0.5 ? chalk.red : absAutocorr >= 0.2 ? chalk.yellow : chalk.green;

  console.log(`  ${chalk.white('Pattern Type:')}        ${regColor.bold(regularity)}`);
  console.log(`  ${chalk.white('Correlation:')}         ${regColor(autocorr.toFixed(3))}`);

  if (temporal.burstinessCoefficient !== undefined) {
    const burst = temporal.burstinessCoefficient;
    const burstLabel = burst >= 0.7 ? 'Bursty' : burst >= 0.3 ? 'Mixed' : 'Regular';
    console.log(`  ${chalk.white('Burstiness:')}          ${chalk.cyan(burst.toFixed(3))} (${burstLabel})`);
  }

  if (temporal.interArrivalEntropy !== undefined) {
    console.log(`  ${chalk.white('Inter-arrival Entropy:')} ${chalk.cyan(temporal.interArrivalEntropy.toFixed(3))}`);
  }

  // Detected Periods (REAL API data)
  if (temporal.detectedPeriods && temporal.detectedPeriods.length > 0) {
    console.log(chalk.white.bold('\n  Detected Patterns:\n'));

    temporal.detectedPeriods.forEach(p => {
      const conf = Math.round(p.confidence * 100);
      const barLen = Math.floor(conf / 5);
      const confColor = conf >= 90 ? chalk.red : conf >= 70 ? chalk.yellow : chalk.green;
      console.log(`  ${chalk.white(p.period.padEnd(10))} ${confColor('█'.repeat(barLen))}${chalk.gray('░'.repeat(20 - barLen))} ${confColor(conf + '%')}`);
    });
  }

  // Interpretation from API
  if (temporal.interpretation) {
    console.log(chalk.gray('\n  ' + '─'.repeat(55)));
    console.log(chalk.white.bold('\n  API Interpretation:\n'));
    console.log(chalk.gray('  ' + temporal.interpretation));
  }

  // Risk Assessment
  console.log(chalk.gray('\n  ' + '─'.repeat(55)));
  console.log(chalk.white.bold('\n  Privacy Risk:\n'));

  const tzConf = temporal.timezoneConfidence ? Math.round(temporal.timezoneConfidence * 100) : 0;

  if (tzConf >= 70 || absAutocorr >= 0.5) {
    console.log(chalk.red('  ⚠️  HIGH RISK: Your timing patterns reveal location'));
    console.log(chalk.gray('     Adversaries can likely determine your timezone'));
  } else if (tzConf >= 50 || absAutocorr >= 0.2) {
    console.log(chalk.yellow('  ⚠️  MEDIUM RISK: Some temporal patterns detected'));
    console.log(chalk.gray('     Partial timezone inference may be possible'));
  } else {
    console.log(chalk.green('  ✓ LOW RISK: Timing appears random'));
    console.log(chalk.gray('     Difficult to infer timezone from behavior'));
  }

  console.log(chalk.cyan('\n  Mitigation: Use random delays, vary transaction times\n'));
}

function getConfidenceColor(conf: number): chalk.Chalk {
  if (conf >= 80) return chalk.red;
  if (conf >= 60) return chalk.yellow;
  return chalk.green;
}

// Wallet Behavioral Fingerprint
// Based on Ishaana research & Applied Network Science
function displayBehavioralFingerprint(data: PrivacyAnalysis, address: string): void {
  console.log(chalk.hex('#9945FF').bold(`\n  ${figures.pointerSmall} WALLET BEHAVIORAL FINGERPRINT`));
  console.log(chalk.gray('  Analyzing patterns that make your wallet identifiable\n'));

  console.log(chalk.white.bold('  Raw Metrics (from API):\n'));
  console.log(chalk.gray('  ' + '─'.repeat(55)));

  // Show ACTUAL API values with their real meanings
  const metrics = [
    {
      name: 'Transaction Entropy',
      value: data.entropy.totalEntropy,
      display: data.entropy.totalEntropy.toFixed(3),
      risk: data.entropy.totalEntropy < 0.5 ? 'HIGH' : data.entropy.totalEntropy < 0.7 ? 'MEDIUM' : 'LOW',
      desc: 'Randomness of tx amounts (higher = more random = better)',
    },
    {
      name: 'Timing Autocorrelation',
      value: Math.abs(data.temporalAnalysis.autocorrelation),
      display: data.temporalAnalysis.autocorrelation.toFixed(4),
      risk: Math.abs(data.temporalAnalysis.autocorrelation) > 0.5 ? 'HIGH' : Math.abs(data.temporalAnalysis.autocorrelation) > 0.2 ? 'MEDIUM' : 'LOW',
      desc: 'Predictability of tx timing (closer to 0 = better)',
    },
    {
      name: 'Clustering Vulnerability',
      value: data.advancedClustering.clusteringVulnerability,
      display: (data.advancedClustering.clusteringVulnerability * 100).toFixed(1) + '%',
      risk: data.advancedClustering.clusteringVulnerability > 0.5 ? 'HIGH' : data.advancedClustering.clusteringVulnerability > 0.3 ? 'MEDIUM' : 'LOW',
      desc: 'How easily your addresses can be linked together',
    },
    {
      name: 'Network Visibility',
      value: data.networkCentrality.networkVisibility,
      display: data.networkCentrality.networkVisibility.toFixed(3),
      risk: data.networkCentrality.networkVisibility > 1.0 ? 'HIGH' : data.networkCentrality.networkVisibility > 0.5 ? 'MEDIUM' : 'LOW',
      desc: 'How central you are in the transaction graph',
    },
    {
      name: 'Differential Privacy (ε)',
      value: data.differentialPrivacy.epsilon,
      display: data.differentialPrivacy.epsilon.toFixed(2),
      risk: data.differentialPrivacy.epsilon > 5 ? 'HIGH' : data.differentialPrivacy.epsilon > 2 ? 'MEDIUM' : 'LOW',
      desc: 'Privacy guarantee level (lower = better, <1 is good)',
    },
  ];

  metrics.forEach(m => {
    const riskColor = m.risk === 'HIGH' ? chalk.red : m.risk === 'MEDIUM' ? chalk.yellow : chalk.green;
    console.log(`  ${chalk.white(m.name.padEnd(24))} ${chalk.cyan(m.display.padStart(10))}  ${riskColor('[' + m.risk + ']')}`);
    console.log(chalk.gray(`  ${' '.repeat(24)} ${m.desc}`));
  });

  // Calculate composite score from REAL metrics
  const entropyScore = Math.min(100, data.entropy.totalEntropy * 100);
  const timingScore = Math.max(0, 100 - Math.abs(data.temporalAnalysis.autocorrelation) * 100);
  const clusterScore = Math.max(0, 100 - data.advancedClustering.clusteringVulnerability * 100);
  const networkScore = Math.max(0, 100 - Math.min(100, data.networkCentrality.networkVisibility * 50));
  const epsilonScore = Math.max(0, 100 - data.differentialPrivacy.epsilon * 10);

  const compositeScore = Math.round((entropyScore + timingScore + clusterScore + networkScore + epsilonScore) / 5);

  console.log(chalk.gray('\n  ' + '─'.repeat(55)));
  console.log(chalk.white.bold('\n  Composite Privacy Score:\n'));

  const scoreColor = compositeScore >= 70 ? chalk.green : compositeScore >= 40 ? chalk.yellow : chalk.red;
  const scoreLabel = compositeScore >= 70 ? 'GOOD PRIVACY' : compositeScore >= 40 ? 'MODERATE RISK' : 'HIGH RISK';

  const barLen = Math.floor(compositeScore / 5);
  console.log(`  ${scoreColor('█'.repeat(barLen))}${chalk.gray('░'.repeat(20 - barLen))} ${scoreColor.bold(compositeScore + '/100')} ${scoreColor('(' + scoreLabel + ')')}`);

  console.log(chalk.white.bold('\n  Breakdown:'));
  console.log(chalk.gray(`  • Entropy:     ${Math.round(entropyScore)}%`));
  console.log(chalk.gray(`  • Timing:      ${Math.round(timingScore)}%`));
  console.log(chalk.gray(`  • Clustering:  ${Math.round(clusterScore)}%`));
  console.log(chalk.gray(`  • Network:     ${Math.round(networkScore)}%`));
  console.log(chalk.gray(`  • ε-Privacy:   ${Math.round(epsilonScore)}%`));

  console.log(chalk.cyan('\n  Mitigation: Randomize amounts, timing, and counterparties\n'));
}

function centerText(text: string, width: number, visibleLen?: number): string {
  const len = visibleLen ?? text.length;
  const pad = width - len;
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return ' '.repeat(left) + text + ' '.repeat(right);
}

// Taint Flow Analysis
// Based on Applied Network Science money flow research
function displayTaintAnalysis(data: PrivacyAnalysis, address: string): void {
  console.log(chalk.hex('#FF4444').bold('\n  ☣️  TAINT FLOW ANALYSIS'));
  console.log(chalk.gray('  Entity exposure based on detected interactions\n'));

  // Get REAL data from API
  const kycExposure = data.exchangeFingerprint.kycExposure;
  const traceabilityRisk = data.exchangeFingerprint.traceabilityRisk;
  const exchanges = data.exchangeFingerprint.detectedExchanges || [];
  const hasBridge = data.crossChain.bridgeUsageDetected;
  const detectedBridges = data.crossChain.detectedBridges || [];
  const mixerProb = data.mixerDetection.mixerUsageProbability;

  console.log(chalk.white.bold('  KYC Exposure (from API):\n'));
  console.log(chalk.gray('  ' + '─'.repeat(55)));

  // Show actual KYC exposure with visual bar
  const kycPct = Math.round(kycExposure * 100);
  const kycColor = kycPct >= 50 ? chalk.red : kycPct >= 20 ? chalk.yellow : chalk.green;
  const kycBarLen = Math.floor(kycPct / 5);

  console.log(`  ${chalk.white('KYC Exposure:')}       ${kycColor('█'.repeat(kycBarLen))}${chalk.gray('░'.repeat(20 - kycBarLen))} ${kycColor.bold(kycPct + '%')}`);
  console.log(`  ${chalk.white('Traceability Risk:')} ${getRiskColor(traceabilityRisk).bold(traceabilityRisk)}`);

  // Detected Exchanges (REAL data)
  console.log(chalk.white.bold('\n  Detected Exchanges:\n'));

  if (exchanges.length === 0) {
    console.log(chalk.green('  ✓ No exchange interactions detected'));
  } else {
    exchanges.forEach((ex: { name: string; type: string }) => {
      const typeColor = ex.type === 'CEX' ? chalk.red : chalk.cyan;
      const riskLabel = ex.type === 'CEX' ? '[KYC RISK]' : '[DEX]';
      console.log(`  • ${chalk.white(ex.name.padEnd(20))} ${typeColor(ex.type.padEnd(5))} ${typeColor(riskLabel)}`);
    });
  }

  // Cross-chain bridges (REAL data)
  console.log(chalk.white.bold('\n  Cross-Chain Activity:\n'));

  if (!hasBridge) {
    console.log(chalk.green('  ✓ No cross-chain bridge usage detected'));
  } else {
    console.log(chalk.yellow('  ⚠️  Bridge usage detected - cross-chain linkability risk'));
    if (detectedBridges.length > 0) {
      detectedBridges.forEach((bridge: string) => {
        console.log(chalk.gray(`     • ${bridge}`));
      });
    }
  }

  // Mixer/Privacy protocol detection (REAL data)
  console.log(chalk.white.bold('\n  Privacy Protocol Usage:\n'));

  const mixerPct = Math.round(mixerProb * 100);
  if (mixerPct < 10) {
    console.log(chalk.gray('  No privacy protocol usage detected'));
  } else {
    const mixerColor = mixerPct >= 50 ? chalk.green : chalk.yellow;
    console.log(`  ${chalk.white('Mixer Probability:')}  ${mixerColor(mixerPct + '%')}`);
    console.log(chalk.gray('  (Indicates possible use of mixing/tumbling services)'));
  }

  // Summary based on REAL metrics
  console.log(chalk.gray('\n  ' + '─'.repeat(55)));
  console.log(chalk.white.bold('\n  Traceability Summary:\n'));

  const cexCount = exchanges.filter((ex: { type: string }) => ex.type === 'CEX').length;
  const dexCount = exchanges.filter((ex: { type: string }) => ex.type === 'DEX').length;

  console.log(chalk.gray(`  • CEX interactions: ${cexCount > 0 ? chalk.red(cexCount + ' detected') : chalk.green('None')}`));
  console.log(chalk.gray(`  • DEX interactions: ${dexCount > 0 ? chalk.cyan(dexCount + ' detected') : chalk.gray('None')}`));
  console.log(chalk.gray(`  • Bridge usage: ${hasBridge ? chalk.yellow('Yes') : chalk.green('No')}`));
  console.log(chalk.gray(`  • KYC exposure: ${kycColor(kycPct + '%')}`));

  // Risk assessment
  if (kycPct >= 50 || cexCount >= 2) {
    console.log(chalk.red.bold('\n  ⚠️  HIGH RISK: Significant KYC exposure'));
    console.log(chalk.gray('  Blockchain forensics can likely identify you'));
  } else if (kycPct >= 20 || cexCount >= 1) {
    console.log(chalk.yellow('\n  ⚠️  MEDIUM RISK: Some KYC exposure'));
    console.log(chalk.gray('  Partial traceability to verified identity'));
  } else {
    console.log(chalk.green('\n  ✓ LOW RISK: Minimal KYC exposure'));
    console.log(chalk.gray('  Limited traceability to verified identity'));
  }

  console.log(chalk.cyan('\n  Mitigation: Avoid CEX deposits, use DEXs, break tx chains\n'));
}

// Helius Integration Stats
function displayHeliusStats(): void {
  console.log(chalk.hex('#E84142').bold('\n  ═══════════════════════════════════════════════════════'));
  console.log(chalk.hex('#E84142').bold('              HELIUS API INTEGRATION STATS'));
  console.log(chalk.hex('#E84142').bold('  ═══════════════════════════════════════════════════════\n'));

  console.log(chalk.white('  API Calls This Session:  ') + chalk.cyan(apiCallsThisSession.toString()));
  console.log(chalk.white('  Wallets Analyzed:        ') + chalk.cyan(analysisHistory.length.toString()));
  console.log(chalk.white('  API Endpoint:            ') + chalk.gray('solprivacy.xyz/api/v3'));
  console.log(chalk.white('  Backend Infrastructure:  ') + chalk.hex('#E84142')('Helius Enhanced API'));

  console.log(chalk.gray('\n  Helius Endpoints Powering SolPrivacy:'));
  console.log(chalk.gray('  ' + '─'.repeat(50)));
  console.log(chalk.white('  • /addresses/{addr}/transactions  ') + chalk.gray('Enhanced Transactions'));
  console.log(chalk.white('  • getAssetsByOwner                ') + chalk.gray('DAS API'));
  console.log(chalk.white('  • mainnet.helius-rpc.com          ') + chalk.gray('RPC'));

  console.log(chalk.hex('#E84142').bold('\n  Without Helius, there is no SolPrivacy.'));
  console.log(chalk.gray('  https://helius.dev\n'));
}

// Privacy Leaderboard
function displayLeaderboard(): void {
  console.log(chalk.hex('#14F195').bold('\n  🏆 PRIVACY LEADERBOARD'));
  console.log(chalk.gray('  ' + '─'.repeat(55)));

  if (analysisHistory.length === 0) {
    console.log(chalk.yellow('  No wallets analyzed yet. Use /analyze to add wallets.\n'));
    return;
  }

  const sorted = [...analysisHistory].sort((a, b) => b.score - a.score);

  console.log(chalk.gray('  Rank  Wallet                   Score    Grade'));
  console.log(chalk.gray('  ' + '─'.repeat(55)));

  sorted.slice(0, 10).forEach((item, i) => {
    const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${(i + 1).toString().padStart(2)}.`;
    const scoreColor = getScoreColor(item.score);
    const shortAddr = item.address.slice(0, 8) + '...' + item.address.slice(-4);
    console.log(`  ${rank.padEnd(4)}  ${chalk.gray(shortAddr.padEnd(22))} ${scoreColor(item.score.toString().padStart(3))}      ${item.grade}`);
  });

  console.log('');
}

// Export HTML Report
function exportHtmlReport(data: PrivacyAnalysis, address: string): void {
  const scoreClass = data.advancedPrivacyScore >= 70 ? 'good' : data.advancedPrivacyScore >= 40 ? 'medium' : 'bad';

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>SolPrivacy Report - ${address.slice(0, 8)}</title>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'SF Mono', 'Monaco', 'Consolas', monospace; background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%); color: #fff; min-height: 100vh; padding: 40px; }
    .container { max-width: 900px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 50px; }
    .header h1 { font-size: 48px; background: linear-gradient(90deg, #9945FF, #14F195); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 10px; }
    .header p { color: #666; }
    .address { font-family: monospace; color: #888; font-size: 14px; margin-top: 15px; }
    .score-container { text-align: center; margin: 40px 0; padding: 40px; background: rgba(255,255,255,0.05); border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); }
    .score { font-size: 120px; font-weight: 900; }
    .score.good { color: #22c55e; }
    .score.medium { color: #eab308; }
    .score.bad { color: #ef4444; }
    .grade { font-size: 24px; color: #888; margin-top: 10px; }
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 40px 0; }
    .metric { background: rgba(255,255,255,0.05); padding: 25px; border-radius: 15px; border: 1px solid rgba(255,255,255,0.1); }
    .metric-value { font-size: 28px; font-weight: bold; color: #00d4ff; }
    .metric-label { color: #888; font-size: 12px; margin-top: 5px; }
    .section-title { font-size: 18px; color: #9945FF; margin: 40px 0 20px; border-bottom: 1px solid rgba(153, 69, 255, 0.3); padding-bottom: 10px; }
    .alert { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 10px; padding: 15px; margin: 10px 0; color: #ef4444; }
    .alert.success { background: rgba(34, 197, 94, 0.1); border-color: rgba(34, 197, 94, 0.3); color: #22c55e; }
    .footer { text-align: center; margin-top: 60px; padding-top: 30px; border-top: 1px solid rgba(255,255,255,0.1); }
    .footer a { color: #14F195; text-decoration: none; }
    .helius { color: #E84142; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>SOLPRIVACY</h1>
      <p>Wallet Privacy Analysis Report</p>
      <p class="address">${address}</p>
    </div>

    <div class="score-container">
      <div class="score ${scoreClass}">${data.advancedPrivacyScore}</div>
      <div class="grade">Grade: ${data.grade} | Risk Level: ${data.riskLevel}</div>
    </div>

    <div class="metrics">
      <div class="metric"><div class="metric-value">${data.kAnonymity.kValue}</div><div class="metric-label">K-Anonymity</div></div>
      <div class="metric"><div class="metric-value">${data.entropy.totalEntropy.toFixed(2)}</div><div class="metric-label">Entropy</div></div>
      <div class="metric"><div class="metric-value">${data.differentialPrivacy.epsilon.toFixed(2)}</div><div class="metric-label">Epsilon (ε)</div></div>
      <div class="metric"><div class="metric-value">${formatPercentage(data.exchangeFingerprint.kycExposure)}</div><div class="metric-label">KYC Exposure</div></div>
      <div class="metric"><div class="metric-value">${formatPercentage(data.advancedClustering.clusteringVulnerability)}</div><div class="metric-label">Clustering Vuln.</div></div>
      <div class="metric"><div class="metric-value">${data.temporalAnalysis.autocorrelation.toFixed(2)}</div><div class="metric-label">Temporal Pattern</div></div>
    </div>

    <div class="section-title">Attack Detection</div>
    ${data.dustAttack.dustAttackDetected
      ? `<div class="alert">⚠️ Dust Attack Detected - ${data.dustAttack.dustTransactionsReceived} suspicious transactions</div>`
      : '<div class="alert success">✓ No dust attack activity detected</div>'}
    ${data.crossChain.bridgeUsageDetected
      ? `<div class="alert">⚠️ Cross-chain bridges detected - Identity may be linked across chains</div>`
      : '<div class="alert success">✓ No cross-chain linkability</div>'}

    <div class="footer">
      <p>Generated by <a href="https://solprivacy.xyz">SolPrivacy</a></p>
      <p style="margin-top: 10px; color: #666;">Powered by <span class="helius">Helius</span> | Solana Privacy Hackathon 2026</p>
    </div>
  </div>
</body>
</html>`;

  const filename = `solprivacy-report-${Date.now()}.html`;
  fs.writeFileSync(filename, html);
  console.log(chalk.green(`\n  ✓ Report exported: ${chalk.cyan(filename)}`));
  console.log(chalk.gray(`    Open in browser to view the full report\n`));
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW CLI-EXCLUSIVE FEATURES - Unique value for hackathon
// ═══════════════════════════════════════════════════════════════════════════════

// 1. BATCH ANALYSIS - Analyze multiple wallets from a file
async function batchAnalyze(): Promise<void> {
  console.log(chalk.hex('#FF6B00').bold('\n  📦 BATCH WALLET ANALYSIS'));
  console.log(chalk.gray('  Analyze multiple wallets at once\n'));

  const filePath = await input({
    message: 'Path to wallet list file (one address per line)',
    theme: { prefix: chalk.hex('#9945FF')('  ') },
  });

  if (!fs.existsSync(filePath)) {
    console.log(chalk.red(`  [ERROR] File not found: ${filePath}`));
    return;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const wallets = content.split('\n').map(w => w.trim()).filter(w => w.length > 0 && !w.startsWith('#'));

  if (wallets.length === 0) {
    console.log(chalk.red('  [ERROR] No valid wallet addresses found in file'));
    return;
  }

  console.log(chalk.yellow(`\n  Found ${wallets.length} wallets to analyze...`));
  console.log(chalk.gray('  ' + '─'.repeat(70)));

  const results: Array<{ address: string; score: number; grade: string; risk: string; error?: string }> = [];
  let processed = 0;

  for (const wallet of wallets) {
    processed++;
    const validation = validateWallet(wallet);

    if (!validation.valid) {
      results.push({ address: wallet, score: 0, grade: 'ERR', risk: 'ERROR', error: validation.error });
      console.log(chalk.red(`  [${processed}/${wallets.length}] ${wallet.slice(0, 12)}... ERROR: ${validation.error}`));
      continue;
    }

    try {
      process.stdout.write(chalk.yellow(`  [${processed}/${wallets.length}] ${wallet.slice(0, 12)}... `));
      const response = await axios.get(`${API_URL}/api/v3/analyze/${wallet}`, { timeout: 60000 });
      apiCallsThisSession++;

      if (response.data.success) {
        const data = response.data.data;
        results.push({
          address: wallet,
          score: data.advancedPrivacyScore,
          grade: data.grade,
          risk: data.riskLevel,
        });

        const scoreColor = getScoreColor(data.advancedPrivacyScore);
        console.log(scoreColor(`Score: ${data.advancedPrivacyScore} (${data.grade})`));

        // Save snapshot for each wallet
        saveSnapshot(wallet, data);
      } else {
        results.push({ address: wallet, score: 0, grade: 'ERR', risk: 'ERROR', error: 'API error' });
        console.log(chalk.red('API Error'));
      }
    } catch (error) {
      results.push({ address: wallet, score: 0, grade: 'ERR', risk: 'ERROR', error: 'Request failed' });
      console.log(chalk.red('Request failed'));
    }

    // Rate limiting - 500ms between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Summary
  console.log(chalk.gray('\n  ' + '═'.repeat(70)));
  console.log(chalk.hex('#FF6B00').bold(`\n  ${figures.lozenge} BATCH ANALYSIS SUMMARY\n`));

  const successful = results.filter(r => !r.error);
  const failed = results.filter(r => r.error);

  console.log(chalk.white(`  Total wallets: ${results.length}`));
  console.log(chalk.green(`  Successful:    ${successful.length}`));
  console.log(chalk.red(`  Failed:        ${failed.length}`));

  if (successful.length > 0) {
    const avgScore = Math.round(successful.reduce((sum, r) => sum + r.score, 0) / successful.length);
    const highRisk = successful.filter(r => r.risk === 'HIGH' || r.risk === 'CRITICAL').length;
    const lowRisk = successful.filter(r => r.risk === 'LOW').length;

    console.log(chalk.cyan(`\n  Average score: ${avgScore}`));
    console.log(chalk.red(`  High risk:     ${highRisk} wallets`));
    console.log(chalk.green(`  Low risk:      ${lowRisk} wallets`));

    // Top 5 best and worst
    const sorted = [...successful].sort((a, b) => b.score - a.score);

    console.log(chalk.white.bold('\n  Top 5 Most Private:'));
    sorted.slice(0, 5).forEach((r, i) => {
      console.log(chalk.green(`  ${i + 1}. ${r.address.slice(0, 20)}... Score: ${r.score} (${r.grade})`));
    });

    console.log(chalk.white.bold('\n  Top 5 Least Private:'));
    sorted.slice(-5).reverse().forEach((r, i) => {
      console.log(chalk.red(`  ${i + 1}. ${r.address.slice(0, 20)}... Score: ${r.score} (${r.grade})`));
    });
  }

  // Export CSV
  const exportCsv = await confirm({
    message: 'Export results to CSV?',
    default: true,
    theme: { prefix: chalk.hex('#9945FF')('  ') },
  });

  if (exportCsv) {
    const csvContent = [
      'address,score,grade,risk,error',
      ...results.map(r => `${r.address},${r.score},${r.grade},${r.risk},${r.error || ''}`)
    ].join('\n');

    const csvFile = `batch-analysis-${Date.now()}.csv`;
    fs.writeFileSync(csvFile, csvContent);
    console.log(chalk.green(`\n  ✓ Results exported to: ${chalk.cyan(csvFile)}\n`));
  }
}

// 2. WALLET MONITOR - Real-time privacy monitoring
async function watchWallet(): Promise<void> {
  console.log(chalk.hex('#00D4FF').bold('\n  👁️  WALLET PRIVACY MONITOR'));
  console.log(chalk.gray('  Real-time monitoring with alerts\n'));

  const address = await getWalletAddress('Wallet to monitor');
  const validation = validateWallet(address);
  if (!validation.valid) {
    console.log(chalk.red(`  [ERROR] ${validation.error}`));
    return;
  }

  const intervalStr = await input({
    message: 'Check interval in seconds (min: 30)',
    default: '60',
    theme: { prefix: chalk.hex('#9945FF')('  ') },
  });

  const interval = Math.max(30, parseInt(intervalStr) || 60) * 1000;

  console.log(chalk.yellow(`\n  Starting monitor for ${address.slice(0, 12)}...`));
  console.log(chalk.gray(`  Checking every ${interval / 1000} seconds. Press Ctrl+C to stop.\n`));
  console.log(chalk.gray('  ' + '─'.repeat(60)));

  let lastScore: number | null = null;
  let checkCount = 0;

  const monitor = async () => {
    checkCount++;
    const timestamp = new Date().toLocaleTimeString();

    try {
      const response = await axios.get(`${API_URL}/api/v3/analyze/${address}`, { timeout: 60000 });
      apiCallsThisSession++;

      if (response.data.success) {
        const data = response.data.data;
        const score = data.advancedPrivacyScore;
        const scoreColor = getScoreColor(score);

        if (lastScore === null) {
          console.log(chalk.gray(`  [${timestamp}] `) + chalk.white('Initial: ') + scoreColor(`${score} (${data.grade})`));
          lastScore = score;
        } else {
          const diff = score - lastScore;
          let diffStr = '';

          if (diff > 0) {
            diffStr = chalk.green(` ▲ +${diff}`);
          } else if (diff < 0) {
            diffStr = chalk.red(` ▼ ${diff}`);
            // Alert on significant drop
            if (diff <= -5) {
              console.log(chalk.red.bold(`\n  ⚠️  ALERT: Privacy score dropped by ${Math.abs(diff)} points!`));
              console.log(chalk.yellow(`     Previous: ${lastScore} → Current: ${score}`));
              console.log(chalk.gray(`     Check for new transactions that may have exposed your wallet.\n`));
            }
          } else {
            diffStr = chalk.gray(' ═ 0');
          }

          console.log(chalk.gray(`  [${timestamp}] `) + chalk.white('Score: ') + scoreColor(`${score}`) + diffStr);
          lastScore = score;
        }

        // Alert on specific conditions
        if (data.dustAttack?.dustAttackDetected) {
          console.log(chalk.red.bold(`  ⚠️  DUST ATTACK DETECTED!`));
        }
        if (data.exchangeFingerprint?.kycExposure > 0.5) {
          console.log(chalk.yellow(`  ⚠️  High KYC exposure: ${Math.round(data.exchangeFingerprint.kycExposure * 100)}%`));
        }

        // Save snapshot
        saveSnapshot(address, data);
      }
    } catch (error) {
      console.log(chalk.gray(`  [${timestamp}] `) + chalk.red('Request failed'));
    }
  };

  // Initial check
  await monitor();

  // Set up interval
  const intervalId = setInterval(monitor, interval);

  // Handle stop
  const cleanup = () => {
    clearInterval(intervalId);
    console.log(chalk.hex('#00D4FF')(`\n  Monitor stopped after ${checkCount} checks.\n`));
  };

  process.on('SIGINT', cleanup);

  // Keep running until user stops
  await new Promise(() => {}); // This will run until Ctrl+C
}

// 3. HELIUS DIRECT - Direct API calls with user's key
async function heliusDirect(): Promise<void> {
  console.log(chalk.hex('#E84142').bold('\n  🔥 HELIUS DIRECT API ANALYSIS'));
  console.log(chalk.gray('  Direct Helius calls + local privacy calculations\n'));

  let apiKey = getHeliusApiKey();
  const savedKey = apiKey;

  if (!apiKey) {
    apiKey = await input({
      message: 'Enter your Helius API key',
      theme: { prefix: chalk.hex('#9945FF')('  ') },
    });
  } else {
    console.log(chalk.gray(`  Using saved API key: ${apiKey.slice(0, 8)}...`));
  }

  if (!apiKey || apiKey.length < 10) {
    console.log(chalk.red('  [ERROR] Invalid API key'));
    console.log(chalk.gray('  Get your key at: https://dev.helius.xyz\n'));
    return;
  }

  // Save API key if new
  if (apiKey !== savedKey) {
    const config = loadConfig();
    config.heliusApiKey = apiKey;
    saveConfig(config);
    console.log(chalk.green('  ✓ API key saved'));
  }

  const address = await getWalletAddress();
  const validation = validateWallet(address);
  if (!validation.valid) {
    console.log(chalk.red(`  [ERROR] ${validation.error}`));
    return;
  }

  console.log(chalk.yellow('\n  Fetching data directly from Helius...'));
  console.log(chalk.gray('  (This may take up to 60 seconds for large wallets)\n'));

  try {
    // 1. Get enhanced transactions (with retry)
    console.log(chalk.gray('  → Fetching enhanced transactions...'));
    let transactions: any[] = [];
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const txResponse = await axios.get(
          `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${apiKey}&limit=50`,
          { timeout: 60000 }
        );
        transactions = txResponse.data || [];
        break;
      } catch (retryErr: any) {
        if (attempt === 2) throw retryErr;
        console.log(chalk.yellow(`  ⚠ Retry ${attempt}/2...`));
      }
    }

    // 2. Get assets (with retry)
    console.log(chalk.gray('  → Fetching assets (DAS API)...'));
    let assets: any[] = [];
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const assetsResponse = await axios.post(
          `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
          {
            jsonrpc: '2.0',
            id: 'solprivacy',
            method: 'getAssetsByOwner',
            params: { ownerAddress: address, page: 1, limit: 100 },
          },
          { timeout: 60000 }
        );
        assets = assetsResponse.data?.result?.items || [];
        break;
      } catch (retryErr: any) {
        if (attempt === 2) throw retryErr;
        console.log(chalk.yellow(`  ⚠ Retry ${attempt}/2...`));
      }
    }

    console.log(chalk.green(`\n  ✓ Fetched ${transactions.length} transactions, ${assets.length} assets`));
    console.log(chalk.gray('  ' + '─'.repeat(60)));

    // LOCAL PRIVACY CALCULATIONS
    console.log(chalk.hex('#E84142').bold(`\n  ${figures.lozenge} LOCAL PRIVACY ANALYSIS\n`));

    // Calculate entropy from transaction amounts
    const amounts = transactions
      .filter((tx: any) => tx.nativeTransfers)
      .flatMap((tx: any) => tx.nativeTransfers.map((t: any) => t.amount));

    const amountEntropy = calculateEntropy(amounts);

    // Calculate timing entropy
    const timestamps = transactions.map((tx: any) => tx.timestamp).filter(Boolean);
    const timeDiffs = timestamps.slice(1).map((t: number, i: number) => t - timestamps[i]);
    const timeEntropy = calculateEntropy(timeDiffs);

    // Unique counterparties
    const counterparties = new Set<string>();
    transactions.forEach((tx: any) => {
      if (tx.nativeTransfers) {
        tx.nativeTransfers.forEach((t: any) => {
          if (t.fromUserAccount !== address) counterparties.add(t.fromUserAccount);
          if (t.toUserAccount !== address) counterparties.add(t.toUserAccount);
        });
      }
    });

    // Detect exchanges (simple pattern matching)
    const knownExchanges = ['binance', 'coinbase', 'ftx', 'kraken', 'okx', 'bybit', 'kucoin', 'gate', 'huobi'];
    const exchangeInteractions = transactions.filter((tx: any) => {
      const desc = (tx.description || '').toLowerCase();
      return knownExchanges.some(ex => desc.includes(ex));
    });

    // Calculate autocorrelation from timing
    let autocorrelation = 0;
    if (timeDiffs.length > 1) {
      const mean = timeDiffs.reduce((a: number, b: number) => a + b, 0) / timeDiffs.length;
      let num = 0, den = 0;
      for (let i = 0; i < timeDiffs.length - 1; i++) {
        num += (timeDiffs[i] - mean) * (timeDiffs[i + 1] - mean);
        den += Math.pow(timeDiffs[i] - mean, 2);
      }
      autocorrelation = den > 0 ? num / den : 0;
    }

    // Hour distribution for timezone inference
    const hourCounts = new Array(24).fill(0);
    timestamps.forEach((ts: number) => {
      const hour = new Date(ts * 1000).getUTCHours();
      hourCounts[hour]++;
    });
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
    const estimatedOffset = (12 - peakHour + 24) % 24 - 12;

    // Calculate composite score
    const entropyScore = Math.min(100, (amountEntropy + timeEntropy) * 50);
    const counterpartyScore = Math.min(100, counterparties.size * 2);
    const autocorrPenalty = Math.abs(autocorrelation) * 30;
    const exchangePenalty = exchangeInteractions.length * 10;

    const compositeScore = Math.max(0, Math.min(100, Math.round(
      (entropyScore * 0.3) +
      (counterpartyScore * 0.3) +
      (50 - autocorrPenalty) +
      (50 - exchangePenalty)
    )));

    const grade = compositeScore >= 80 ? 'A' : compositeScore >= 60 ? 'B' : compositeScore >= 40 ? 'C' : compositeScore >= 20 ? 'D' : 'F';
    const scoreColor = getScoreColor(compositeScore);

    // Display results
    console.log(chalk.white('  Raw Helius Data:'));
    console.log(chalk.gray(`    Transactions:      ${transactions.length}`));
    console.log(chalk.gray(`    Assets:            ${assets.length}`));
    console.log(chalk.gray(`    Counterparties:    ${counterparties.size}`));
    console.log(chalk.gray(`    Exchange txs:      ${exchangeInteractions.length}`));

    console.log(chalk.white('\n  Local Calculations:'));
    console.log(chalk.gray(`    Amount Entropy:    ${amountEntropy.toFixed(4)}`));
    console.log(chalk.gray(`    Time Entropy:      ${timeEntropy.toFixed(4)}`));
    console.log(chalk.gray(`    Autocorrelation:   ${autocorrelation.toFixed(4)}`));
    console.log(chalk.gray(`    Peak Activity:     ${peakHour}:00 UTC`));
    console.log(chalk.gray(`    Est. Timezone:     UTC${estimatedOffset >= 0 ? '+' : ''}${estimatedOffset}`));

    console.log(chalk.gray('\n  ' + '─'.repeat(60)));
    console.log(chalk.white.bold('\n  Calculated Privacy Score:\n'));

    const barLen = Math.floor(compositeScore / 5);
    console.log(`  ${scoreColor('█'.repeat(barLen))}${chalk.gray('░'.repeat(20 - barLen))} ${scoreColor.bold(compositeScore + '/100')} (${grade})`);

    console.log(chalk.hex('#E84142').bold('\n  ✓ Analysis powered directly by Helius API'));
    console.log(chalk.gray('    No SolPrivacy backend used - 100% local calculations\n'));

  } catch (error: any) {
    console.log(chalk.red(`\n  [ERROR] Helius API request failed`));
    if (error.response?.status === 401) {
      console.log(chalk.gray('  Invalid API key. Get yours at: https://dev.helius.xyz'));
    } else {
      console.log(chalk.gray(`  ${error.message}`));
    }
    console.log('');
  }
}

// Helper: Calculate Shannon entropy
function calculateEntropy(values: number[]): number {
  if (values.length === 0) return 0;

  // Normalize values
  const total = values.reduce((a, b) => a + Math.abs(b), 0);
  if (total === 0) return 0;

  const probs = values.map(v => Math.abs(v) / total);

  return -probs.reduce((sum, p) => {
    if (p > 0) sum += p * Math.log2(p);
    return sum;
  }, 0) / Math.log2(values.length || 1);
}

// 4. GRAPH EXPORT - Export transaction graph
async function graphExport(): Promise<void> {
  console.log(chalk.hex('#9945FF').bold('\n  🕸️  TRANSACTION GRAPH EXPORT'));
  console.log(chalk.gray('  Export for visualization in Gephi/Cytoscape\n'));

  const address = await getWalletAddress();
  const validation = validateWallet(address);
  if (!validation.valid) {
    console.log(chalk.red(`  [ERROR] ${validation.error}`));
    return;
  }

  const format = await select({
    message: 'Export format',
    choices: [
      { value: 'dot', name: 'DOT (Graphviz)' },
      { value: 'graphml', name: 'GraphML (Gephi/yEd)' },
      { value: 'json', name: 'JSON (D3.js/custom)' },
    ],
    theme: { prefix: chalk.hex('#9945FF')('  ') },
  });

  console.log(chalk.yellow('\n  Fetching transaction data...'));

  try {
    const response = await axios.get(`${API_URL}/api/v3/analyze/${address}`, { timeout: 60000 });
    apiCallsThisSession++;

    if (!response.data.success) {
      console.log(chalk.red('  [ERROR] Failed to fetch data'));
      return;
    }

    // Also fetch transactions for graph building
    let apiKey = getHeliusApiKey();
    if (!apiKey) {
      apiKey = await input({
        message: 'Helius API key (for transaction data)',
        theme: { prefix: chalk.hex('#9945FF')('  ') },
      });
      // Save if provided
      if (apiKey && apiKey.length >= 10) {
        const config = loadConfig();
        config.heliusApiKey = apiKey;
        saveConfig(config);
        console.log(chalk.green('  ✓ API key saved'));
      }
    } else {
      console.log(chalk.gray(`  Using saved API key: ${apiKey.slice(0, 8)}...`));
    }

    if (!apiKey) {
      console.log(chalk.yellow('  [WARNING] No API key - using limited data from analysis'));
    }

    // Build graph from available data
    const nodes = new Map<string, { id: string; label: string; type: string }>();
    const edges: Array<{ source: string; target: string; weight: number }> = [];

    // Add main wallet
    nodes.set(address, { id: address, label: address.slice(0, 8), type: 'main' });

    // Try to get transactions if we have an API key
    if (apiKey) {
      try {
        const txResponse = await axios.get(
          `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${apiKey}&limit=50`,
          { timeout: 30000 }
        );

        const transactions = txResponse.data || [];

        transactions.forEach((tx: any) => {
          if (tx.nativeTransfers) {
            tx.nativeTransfers.forEach((transfer: any) => {
              const from = transfer.fromUserAccount;
              const to = transfer.toUserAccount;
              const amount = transfer.amount / 1e9; // Convert lamports to SOL

              if (from && !nodes.has(from)) {
                nodes.set(from, { id: from, label: from.slice(0, 8), type: from === address ? 'main' : 'external' });
              }
              if (to && !nodes.has(to)) {
                nodes.set(to, { id: to, label: to.slice(0, 8), type: to === address ? 'main' : 'external' });
              }

              if (from && to) {
                edges.push({ source: from, target: to, weight: amount });
              }
            });
          }
        });
      } catch {
        console.log(chalk.yellow('  [WARNING] Could not fetch transactions, using analysis data only'));
      }
    }

    // Add data from analysis (detected exchanges, etc.)
    const data = response.data.data;
    if (data.exchangeFingerprint?.detectedExchanges) {
      data.exchangeFingerprint.detectedExchanges.forEach((ex: { name: string; type: string }) => {
        const exId = `exchange_${ex.name}`;
        nodes.set(exId, { id: exId, label: ex.name, type: ex.type === 'CEX' ? 'cex' : 'dex' });
        edges.push({ source: address, target: exId, weight: 1 });
      });
    }

    console.log(chalk.green(`\n  ✓ Graph built: ${nodes.size} nodes, ${edges.length} edges`));

    // Export based on format
    let content = '';
    let extension = '';

    if (format === 'dot') {
      extension = 'dot';
      content = `digraph SolPrivacy {\n`;
      content += `  rankdir=LR;\n`;
      content += `  node [shape=ellipse];\n\n`;

      nodes.forEach((node) => {
        const color = node.type === 'main' ? 'green' : node.type === 'cex' ? 'red' : node.type === 'dex' ? 'blue' : 'gray';
        content += `  "${node.id}" [label="${node.label}" color="${color}"];\n`;
      });

      content += '\n';
      edges.forEach((edge) => {
        content += `  "${edge.source}" -> "${edge.target}" [weight=${edge.weight.toFixed(4)}];\n`;
      });

      content += '}\n';
    } else if (format === 'graphml') {
      extension = 'graphml';
      content = `<?xml version="1.0" encoding="UTF-8"?>\n`;
      content += `<graphml xmlns="http://graphml.graphdrawing.org/xmlns">\n`;
      content += `  <key id="label" for="node" attr.name="label" attr.type="string"/>\n`;
      content += `  <key id="type" for="node" attr.name="type" attr.type="string"/>\n`;
      content += `  <key id="weight" for="edge" attr.name="weight" attr.type="double"/>\n`;
      content += `  <graph id="G" edgedefault="directed">\n`;

      nodes.forEach((node) => {
        content += `    <node id="${node.id}">\n`;
        content += `      <data key="label">${node.label}</data>\n`;
        content += `      <data key="type">${node.type}</data>\n`;
        content += `    </node>\n`;
      });

      edges.forEach((edge, i) => {
        content += `    <edge id="e${i}" source="${edge.source}" target="${edge.target}">\n`;
        content += `      <data key="weight">${edge.weight}</data>\n`;
        content += `    </edge>\n`;
      });

      content += `  </graph>\n</graphml>\n`;
    } else {
      extension = 'json';
      content = JSON.stringify({
        nodes: Array.from(nodes.values()),
        edges: edges,
        meta: {
          wallet: address,
          timestamp: new Date().toISOString(),
          source: 'SolPrivacy CLI + Helius',
        }
      }, null, 2);
    }

    const filename = `graph-${address.slice(0, 8)}-${Date.now()}.${extension}`;
    fs.writeFileSync(filename, content);

    console.log(chalk.green(`  ✓ Graph exported: ${chalk.cyan(filename)}`));
    console.log(chalk.gray(`\n  Visualization tips:`));
    console.log(chalk.gray(`  • DOT: Use Graphviz (dot -Tpng ${filename} -o graph.png)`));
    console.log(chalk.gray(`  • GraphML: Open in Gephi or yEd`));
    console.log(chalk.gray(`  • JSON: Use D3.js or custom visualization\n`));

  } catch (error: any) {
    console.log(chalk.red(`\n  [ERROR] ${error.message}\n`));
  }
}

// 5. PRIVACY DIFF - Compare snapshots over time
async function privacyDiff(): Promise<void> {
  console.log(chalk.hex('#14F195').bold(`\n  ${figures.arrowUp} PRIVACY DIFF - TRACK CHANGES OVER TIME`));
  console.log(chalk.gray('  Compare current state with previous snapshots\n'));

  const address = await getWalletAddress();
  const validation = validateWallet(address);
  if (!validation.valid) {
    console.log(chalk.red(`  [ERROR] ${validation.error}`));
    return;
  }

  // Get snapshots for this wallet
  const snapshotFile = path.join(SNAPSHOTS_DIR, `${address}.json`);
  let snapshots: Array<{ timestamp: string; score: number; data: any }> = [];

  if (fs.existsSync(snapshotFile)) {
    try {
      snapshots = JSON.parse(fs.readFileSync(snapshotFile, 'utf-8'));
    } catch {
      snapshots = [];
    }
  }

  console.log(chalk.gray(`  Found ${snapshots.length} previous snapshots for this wallet`));

  // Fetch current data
  console.log(chalk.yellow('\n  Fetching current analysis...'));

  try {
    const response = await axios.get(`${API_URL}/api/v3/analyze/${address}`, { timeout: 60000 });
    apiCallsThisSession++;

    if (!response.data.success) {
      console.log(chalk.red('  [ERROR] Failed to fetch current data'));
      return;
    }

    const currentData = response.data.data;
    const currentScore = currentData.advancedPrivacyScore;

    // Save current snapshot
    saveSnapshot(address, currentData);

    if (snapshots.length === 0) {
      console.log(chalk.yellow('\n  No previous snapshots to compare.'));
      console.log(chalk.gray('  Run analysis again later to see changes.\n'));

      console.log(chalk.white.bold('  Current State:'));
      console.log(chalk.gray('  ' + '─'.repeat(50)));
      console.log(chalk.white(`  Score: `) + getScoreColor(currentScore)(`${currentScore} (${currentData.grade})`));
      console.log(chalk.white(`  Risk:  `) + chalk.gray(currentData.riskLevel));
      return;
    }

    // Compare with most recent and oldest
    const oldest = snapshots[0];
    const mostRecent = snapshots[snapshots.length - 1];

    console.log(chalk.gray('\n  ' + '─'.repeat(60)));
    console.log(chalk.hex('#14F195').bold(`\n  ${figures.lozenge} PRIVACY SCORE OVER TIME\n`));

    // Show timeline
    console.log(chalk.white('  Timeline:'));
    const allPoints = [...snapshots, { timestamp: new Date().toISOString(), score: currentScore, data: currentData }];

    allPoints.slice(-10).forEach((point, i) => {
      const date = new Date(point.timestamp).toLocaleDateString();
      const time = new Date(point.timestamp).toLocaleTimeString();
      const scoreColor = getScoreColor(point.score);
      const isLatest = i === allPoints.slice(-10).length - 1;

      const prefix = isLatest ? chalk.hex('#14F195')('→ ') : '  ';
      console.log(`${prefix}${chalk.gray(date + ' ' + time)}  ${scoreColor(point.score.toString().padStart(3))} ${isLatest ? chalk.hex('#14F195')('(current)') : ''}`);
    });

    // Calculate changes
    const recentDiff = currentScore - mostRecent.score;
    const totalDiff = currentScore - oldest.score;

    console.log(chalk.gray('\n  ' + '─'.repeat(60)));
    console.log(chalk.white.bold('\n  Changes:\n'));

    const diffColor = (diff: number) => diff > 0 ? chalk.green : diff < 0 ? chalk.red : chalk.gray;
    const diffSymbol = (diff: number) => diff > 0 ? '▲' : diff < 0 ? '▼' : '═';

    console.log(chalk.white('  Since last check:  ') + diffColor(recentDiff)(`${diffSymbol(recentDiff)} ${recentDiff > 0 ? '+' : ''}${recentDiff} points`));
    console.log(chalk.white('  Since first check: ') + diffColor(totalDiff)(`${diffSymbol(totalDiff)} ${totalDiff > 0 ? '+' : ''}${totalDiff} points`));

    // Detailed metric comparison with most recent
    if (mostRecent.data) {
      console.log(chalk.white.bold('\n  Metric Changes (vs last check):\n'));

      const metrics = [
        { name: 'Entropy', current: currentData.entropy?.totalEntropy || 0, previous: mostRecent.data.entropy?.totalEntropy || 0 },
        { name: 'K-Anonymity', current: currentData.kAnonymity?.kValue || 0, previous: mostRecent.data.kAnonymity?.kValue || 0 },
        { name: 'Clustering Vuln', current: (currentData.advancedClustering?.clusteringVulnerability || 0) * 100, previous: (mostRecent.data.advancedClustering?.clusteringVulnerability || 0) * 100 },
        { name: 'KYC Exposure', current: (currentData.exchangeFingerprint?.kycExposure || 0) * 100, previous: (mostRecent.data.exchangeFingerprint?.kycExposure || 0) * 100 },
      ];

      metrics.forEach(m => {
        const diff = m.current - m.previous;
        const improved = m.name === 'KYC Exposure' || m.name === 'Clustering Vuln' ? diff < 0 : diff > 0;
        const color = Math.abs(diff) < 0.01 ? chalk.gray : improved ? chalk.green : chalk.red;

        console.log(chalk.gray(`  ${m.name.padEnd(16)} `) + color(`${m.previous.toFixed(2)} → ${m.current.toFixed(2)}`));
      });
    }

    // Recommendations based on trend
    console.log(chalk.gray('\n  ' + '─'.repeat(60)));

    if (totalDiff >= 10) {
      console.log(chalk.green.bold('\n  ✓ IMPROVING: Your privacy score is trending up!'));
      console.log(chalk.gray('    Keep using privacy-enhancing practices.\n'));
    } else if (totalDiff <= -10) {
      console.log(chalk.red.bold('\n  ⚠️  DECLINING: Your privacy score is trending down!'));
      console.log(chalk.gray('    Review recent transactions for privacy leaks.\n'));
    } else {
      console.log(chalk.yellow('\n  ═ STABLE: Your privacy score is relatively unchanged.'));
      console.log(chalk.gray('    Continue monitoring for changes.\n'));
    }

  } catch (error: any) {
    console.log(chalk.red(`\n  [ERROR] ${error.message}\n`));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. TRACE STOLEN FUNDS - FIFO Taint Propagation Algorithm
// Based on: "Probing the Mystery of Cryptocurrency Theft" (2019)
// ═══════════════════════════════════════════════════════════════════════════════

// Known Solana CEX deposit addresses (real addresses from public sources)
const KNOWN_ENTITIES: Record<string, { name: string; type: 'CEX' | 'DEX' | 'BRIDGE' | 'MIXER' }> = {
  // === CENTRALIZED EXCHANGES (CEX) - KYC Required ===
  // Binance
  '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9': { name: 'Binance', type: 'CEX' },
  '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM': { name: 'Binance', type: 'CEX' },
  'BSwp6bEBihVLdqJRKGgzjcGLHkcTuzmSo1TQkHepzH8p': { name: 'Binance', type: 'CEX' },
  '2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S': { name: 'Binance', type: 'CEX' },
  // Coinbase
  'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS': { name: 'Coinbase', type: 'CEX' },
  'GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE': { name: 'Coinbase', type: 'CEX' },
  '2AQdpHJ2JpcEgPiATUXjQxA8QmafFegfQwSLWSprPicm': { name: 'Coinbase', type: 'CEX' },
  // Kraken
  'FWznbcNXWQuHTawe9RxvQ2LdCENssh12dsznf4RiouN5': { name: 'Kraken', type: 'CEX' },
  // OKX
  '5VCwKtCXgCJ6kit5FybXjvriW3xEPN2FGLFz2z4EJMk1': { name: 'OKX', type: 'CEX' },
  '5MFjN1i7tCvFesLV3f9qXtCvhKPMk2VVjERG8YpbgoPT': { name: 'OKX', type: 'CEX' },
  // Bybit
  'AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2': { name: 'Bybit', type: 'CEX' },
  // Gate.io
  'u6PJ8DtQuPFnfmwHbGFULQ4u4EgjDiyYKjVEsynXq2w': { name: 'Gate.io', type: 'CEX' },
  // KuCoin
  'BmFdpraQhkiDQE6SnfG5omcA1VwzqfXrwtNYBwWTymy6': { name: 'KuCoin', type: 'CEX' },
  // Crypto.com
  'AobVSwdW9BbpMdJvTqeCN4hPAmh4rHm7vwLnQ5ATSyrS': { name: 'Crypto.com', type: 'CEX' },
  // MEXC
  'ASTyfSima4LLAdDgoFGkgqoKowG1LZFDr9fAQrg7iaJZ': { name: 'MEXC', type: 'CEX' },
  // Huobi/HTX
  '88xTWZMeKfiTgbfEmPLdsUCQcZinwUfk25EBQZ21XMAZ': { name: 'Huobi', type: 'CEX' },

  // === DECENTRALIZED EXCHANGES (DEX) - Programs ===
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': { name: 'Jupiter v6', type: 'DEX' },
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB': { name: 'Jupiter v4', type: 'DEX' },
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': { name: 'Raydium AMM', type: 'DEX' },
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK': { name: 'Raydium CLMM', type: 'DEX' },
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': { name: 'Orca Whirlpool', type: 'DEX' },
  '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP': { name: 'Orca v2', type: 'DEX' },
  'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX': { name: 'Serum/OpenBook', type: 'DEX' },
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo': { name: 'Meteora DLMM', type: 'DEX' },
  'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB': { name: 'Meteora Pools', type: 'DEX' },
  'PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY': { name: 'Phoenix', type: 'DEX' },
  'FLUXubRmkEi2q6K3Y2pBhfTJFRgJQVxFYooL3A8B8r4t': { name: 'FluxBeam', type: 'DEX' },
  '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1': { name: 'Raydium Pool', type: 'DEX' },

  // === BRIDGES ===
  'wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb': { name: 'Wormhole', type: 'BRIDGE' },
  'worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth': { name: 'Wormhole v2', type: 'BRIDGE' },
  'Portal Bridge Token': { name: 'Portal', type: 'BRIDGE' },
  'allbridge': { name: 'Allbridge', type: 'BRIDGE' },
  'DeBridgeGate': { name: 'deBridge', type: 'BRIDGE' },

  // === MIXERS/PRIVACY ===
  'eLeN4F2oB4Ay9onMP9P4X8jCYvJYS1XhyoCg9hbrKv3': { name: 'Elusiv', type: 'MIXER' },
  'CLoUDKc4Ane7HeQcPpE3YHnznRxhMimJ4MyaUqyHFzAn': { name: 'Light Protocol', type: 'MIXER' },
};

// Known DEX program IDs for swap detection
const DEX_PROGRAMS = new Set([
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter v6
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB', // Jupiter v4
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', // Raydium CLMM
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', // Orca Whirlpool
  '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP', // Orca v2
  'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX', // Serum
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo', // Meteora
  'PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY', // Phoenix
]);

// Check if a transaction is a swap
function isSwapTransaction(tx: any): boolean {
  // Check transaction type from Helius
  if (tx.type === 'SWAP') return true;
  if (tx.type === 'JUPITER_SWAP') return true;

  // Check description
  const desc = (tx.description || '').toLowerCase();
  if (desc.includes('swap') || desc.includes('swapped')) return true;

  // Check source (common for DEX aggregators)
  if (tx.source === 'JUPITER' || tx.source === 'RAYDIUM') return true;

  // Check account keys for known DEX programs
  const accounts = tx.accountData?.map((a: any) => a.account) || [];
  for (const account of accounts) {
    if (DEX_PROGRAMS.has(account)) return true;
  }

  return false;
}

// Interface for taint tracking
interface TaintedOutput {
  address: string;
  amount: number;        // Amount transferred
  taintAmount: number;   // How much is tainted
  taintPercent: number;  // Percentage tainted
  signature: string;
  timestamp: number;
  hop: number;
  entity?: { name: string; type: string };
  // Token-specific fields
  isToken: boolean;
  tokenMint?: string;
  tokenSymbol?: string;
}

interface TraceResult {
  totalStolen: number;
  traced: number;
  recovered: number;
  endpoints: TaintedOutput[];
  flowGraph: TaintedOutput[];
  summary: {
    cexReached: number;
    dexUsed: number;
    bridgeUsed: number;
    untraced: number;
    swapped: number;
  };
  // Token info
  isTokenTrace: boolean;
  tokenMint?: string;
  tokenSymbol?: string;
}

// Main trace function
async function traceStolen(): Promise<void> {
  console.log(chalk.hex('#FF0000').bold(`\n  ${figures.pointerSmall} STOLEN FUNDS TRACER`));
  console.log(chalk.gray('  FIFO Taint Propagation Algorithm\n'));
  console.log(chalk.gray('  Based on: "Probing the Mystery of Cryptocurrency Theft" (2019)\n'));

  // Get Helius API key (check saved config first)
  let apiKey = getHeliusApiKey();
  const savedKey = apiKey;

  if (!apiKey) {
    apiKey = await input({
      message: 'Helius API key (required for transaction data)',
      theme: { prefix: chalk.hex('#9945FF')('  ') },
    });
  } else {
    // Show that we're using saved key
    console.log(chalk.gray(`  Using saved API key: ${apiKey.slice(0, 8)}...`));
    const useNew = await confirm({
      message: 'Use different API key?',
      default: false,
      theme: { prefix: chalk.hex('#9945FF')('  ') },
    });
    if (useNew) {
      apiKey = await input({
        message: 'New Helius API key',
        theme: { prefix: chalk.hex('#9945FF')('  ') },
      });
    }
  }

  if (!apiKey || apiKey.length < 10) {
    console.log(chalk.red('  [ERROR] Valid Helius API key required'));
    console.log(chalk.gray('  Get your key at: https://dev.helius.xyz\n'));
    return;
  }

  // Save API key if new
  if (apiKey !== savedKey) {
    const config = loadConfig();
    config.heliusApiKey = apiKey;
    saveConfig(config);
    console.log(chalk.green('  ✓ API key saved to ~/.solprivacy/config.json'));
  }

  // Get stolen wallet address
  const stolenWallet = await getWalletAddress('Stolen wallet address');
  const validation = validateWallet(stolenWallet);
  if (!validation.valid) {
    console.log(chalk.red(`  [ERROR] ${validation.error}`));
    return;
  }

  // Ask what to trace: SOL or Tokens
  const traceType = await select({
    message: 'What was stolen?',
    choices: [
      { value: 'auto', name: 'Auto-detect (scan wallet for outgoing transfers)' },
      { value: 'sol', name: 'SOL (native token)' },
      { value: 'token', name: 'SPL Token (specify mint address)' },
    ],
    theme: { prefix: chalk.hex('#9945FF')('  ') },
  });

  let tokenMint: string | undefined;
  let stolenAmount = 0;

  if (traceType === 'token') {
    tokenMint = await input({
      message: 'Token mint address',
      theme: { prefix: chalk.hex('#9945FF')('  ') },
    });
    if (!tokenMint || tokenMint.length < 32) {
      console.log(chalk.red('  [ERROR] Invalid token mint address'));
      return;
    }
  }

  // Get stolen amount (optional)
  const amountStr = await input({
    message: `Stolen amount (leave empty to trace all outgoing)`,
    default: '',
    theme: { prefix: chalk.hex('#9945FF')('  ') },
  });
  stolenAmount = amountStr ? parseFloat(amountStr) : 0;

  // Get max hops
  const maxHopsStr = await input({
    message: 'Max hops to trace (1-10)',
    default: '3',
    theme: { prefix: chalk.hex('#9945FF')('  ') },
  });
  const maxHops = Math.min(10, Math.max(1, parseInt(maxHopsStr) || 3));

  console.log(chalk.yellow('\n  Fetching transaction history from Helius...\n'));

  try {
    // Fetch initial transactions
    const result = await traceFIFO(apiKey, stolenWallet, stolenAmount, maxHops, traceType, tokenMint);

    displayTraceResults(result, stolenWallet);

  } catch (error: any) {
    console.log(chalk.red(`\n  [ERROR] ${error.message}`));
    if (error.response?.status === 401) {
      console.log(chalk.gray('  Invalid API key'));
    }
    console.log('');
  }
}

// FIFO Taint Propagation Algorithm - Supports SOL and Tokens
async function traceFIFO(
  apiKey: string,
  sourceWallet: string,
  stolenAmount: number,
  maxHops: number,
  traceType: string = 'auto',
  tokenMint?: string
): Promise<TraceResult> {
  const flowGraph: TaintedOutput[] = [];
  const endpoints: TaintedOutput[] = [];
  const visited = new Set<string>();

  // Queue for BFS traversal
  const queue: Array<{ address: string; taint: number; hop: number; isToken: boolean; mint?: string }> = [];

  // Fetch initial outgoing transactions
  console.log(chalk.gray(`  → Fetching transactions for ${sourceWallet.slice(0, 8)}...`));

  const txResponse = await axios.get(
    `https://api.helius.xyz/v0/addresses/${sourceWallet}/transactions?api-key=${apiKey}&limit=100`,
    { timeout: 30000 }
  );

  const transactions = txResponse.data || [];

  if (transactions.length === 0) {
    console.log(chalk.yellow('  No transactions found for this wallet'));
    return {
      totalStolen: stolenAmount,
      traced: 0,
      recovered: 0,
      endpoints: [],
      flowGraph: [],
      summary: { cexReached: 0, dexUsed: 0, bridgeUsed: 0, untraced: stolenAmount, swapped: 0 },
      isTokenTrace: false,
    };
  }

  // Sort transactions by timestamp (oldest first for FIFO)
  const sortedTxs = [...transactions].sort((a: any, b: any) =>
    (a.timestamp || 0) - (b.timestamp || 0)
  );

  // Collect outgoing transfers (both SOL and tokens)
  interface OutgoingTx {
    to: string;
    amount: number;
    signature: string;
    timestamp: number;
    isToken: boolean;
    tokenMint?: string;
    tokenSymbol?: string;
  }

  const outgoingTxs: OutgoingTx[] = [];
  let totalOutgoingSol = 0;
  let totalOutgoingTokens = 0;
  let detectedTokenMint: string | undefined;
  let detectedTokenSymbol: string | undefined;

  // Extract outgoing transfers
  for (const tx of sortedTxs) {
    // Native SOL transfers
    if (tx.nativeTransfers) {
      for (const transfer of tx.nativeTransfers) {
        if (transfer.fromUserAccount === sourceWallet && transfer.toUserAccount !== sourceWallet) {
          const amount = transfer.amount / 1e9;
          totalOutgoingSol += amount;

          if (traceType === 'sol' || traceType === 'auto') {
            outgoingTxs.push({
              to: transfer.toUserAccount,
              amount,
              signature: tx.signature,
              timestamp: tx.timestamp || 0,
              isToken: false,
            });
          }
        }
      }
    }

    // Token transfers
    if (tx.tokenTransfers) {
      for (const transfer of tx.tokenTransfers) {
        if (transfer.fromUserAccount === sourceWallet && transfer.toUserAccount !== sourceWallet) {
          const amount = transfer.tokenAmount || 0;
          const mint = transfer.mint;

          // If specific token requested, only track that one
          if (traceType === 'token' && tokenMint && mint !== tokenMint) continue;

          totalOutgoingTokens += amount;

          // Auto-detect: remember the first significant token transfer
          if (traceType === 'auto' && amount > 0 && !detectedTokenMint) {
            detectedTokenMint = mint;
            // Try to get symbol from description
            const desc = tx.description || '';
            const match = desc.match(/transferred [\d,.]+ (\w+) to/);
            if (match) detectedTokenSymbol = match[1];
          }

          if (traceType === 'token' || traceType === 'auto') {
            outgoingTxs.push({
              to: transfer.toUserAccount,
              amount,
              signature: tx.signature,
              timestamp: tx.timestamp || 0,
              isToken: true,
              tokenMint: mint,
              tokenSymbol: detectedTokenSymbol,
            });
          }
        }
      }
    }
  }

  // Determine what we're tracing
  const isTokenTrace = traceType === 'token' || (traceType === 'auto' && totalOutgoingTokens > totalOutgoingSol * 1000);
  const tracingMint = tokenMint || detectedTokenMint;

  // Filter to only the type we're tracing
  const relevantTxs = isTokenTrace
    ? outgoingTxs.filter(tx => tx.isToken && (!tracingMint || tx.tokenMint === tracingMint))
    : outgoingTxs.filter(tx => !tx.isToken);

  const totalOutgoing = relevantTxs.reduce((sum, tx) => sum + tx.amount, 0);
  const taintTotal = stolenAmount > 0 ? stolenAmount : totalOutgoing;

  // Display what we're tracing
  if (isTokenTrace) {
    console.log(chalk.hex('#14F195')(`  Tracing: TOKEN transfers`));
    if (tracingMint) console.log(chalk.gray(`  Mint: ${tracingMint}`));
    if (detectedTokenSymbol) console.log(chalk.gray(`  Symbol: ${detectedTokenSymbol}`));
    console.log(chalk.white(`  Total outgoing: ${totalOutgoing.toLocaleString()} tokens`));
  } else {
    console.log(chalk.hex('#14F195')(`  Tracing: SOL transfers`));
    console.log(chalk.white(`  Total outgoing: ${totalOutgoing.toFixed(4)} SOL`));
  }
  console.log(chalk.white(`  Tracing taint:  ${isTokenTrace ? taintTotal.toLocaleString() + ' tokens' : taintTotal.toFixed(4) + ' SOL'}`));
  console.log(chalk.gray('  ' + '─'.repeat(60)));

  // FIFO: Apply taint to outgoing transactions in order
  let taintRemaining = taintTotal;

  for (const tx of relevantTxs) {
    if (taintRemaining <= 0) break;

    const taintForThis = Math.min(taintRemaining, tx.amount);
    const taintPercent = tx.amount > 0 ? (taintForThis / tx.amount) * 100 : 0;

    taintRemaining -= taintForThis;

    const entity = KNOWN_ENTITIES[tx.to];

    // Check if it's a swap (DEX) using the transaction data
    const txData = sortedTxs.find((t: any) => t.signature === tx.signature);
    const isSwap = isSwapTransaction(txData);

    // Determine entity for this output
    let outputEntity = entity;
    if (isSwap && !entity) {
      outputEntity = { name: 'DEX Swap', type: 'DEX' as const };
    }

    const output: TaintedOutput = {
      address: tx.to,
      amount: tx.amount,
      taintAmount: taintForThis,
      taintPercent,
      signature: tx.signature,
      timestamp: tx.timestamp,
      hop: 1,
      entity: outputEntity,
      isToken: tx.isToken,
      tokenMint: tx.tokenMint,
      tokenSymbol: tx.tokenSymbol,
    };

    flowGraph.push(output);

    if (entity && (entity.type === 'CEX' || entity.type === 'BRIDGE')) {
      endpoints.push(output);
    } else if (taintPercent > 10) {
      queue.push({ address: tx.to, taint: taintForThis, hop: 1, isToken: tx.isToken, mint: tx.tokenMint });
    }
  }

  // BFS to trace further hops
  while (queue.length > 0 && flowGraph.length < 200) {
    const current = queue.shift()!;

    if (current.hop >= maxHops) continue;
    if (visited.has(current.address)) continue;
    visited.add(current.address);

    await new Promise(resolve => setTimeout(resolve, 200));

    try {
      process.stdout.write(chalk.gray(`  → Hop ${current.hop + 1}: ${current.address.slice(0, 8)}...`));

      const nextTxResponse = await axios.get(
        `https://api.helius.xyz/v0/addresses/${current.address}/transactions?api-key=${apiKey}&limit=50`,
        { timeout: 30000 }
      );

      const nextTxs = nextTxResponse.data || [];
      const sortedNextTxs = [...nextTxs].sort((a: any, b: any) =>
        (a.timestamp || 0) - (b.timestamp || 0)
      );

      let hopTaintRemaining = current.taint;
      let foundOutputs = 0;

      for (const tx of sortedNextTxs) {
        if (hopTaintRemaining <= 0) break;

        // Check for swaps using enhanced detection
        const isSwap = isSwapTransaction(tx);

        // Handle token transfers if tracing tokens
        if (current.isToken && tx.tokenTransfers) {
          for (const transfer of tx.tokenTransfers) {
            if (transfer.fromUserAccount === current.address &&
                transfer.toUserAccount !== current.address &&
                (!current.mint || transfer.mint === current.mint)) {

              const amount = transfer.tokenAmount || 0;
              const taintForThis = Math.min(hopTaintRemaining, amount);
              const taintPercent = amount > 0 ? (taintForThis / amount) * 100 : 0;

              if (taintPercent < 1) continue;

              hopTaintRemaining -= taintForThis;

              const entity = KNOWN_ENTITIES[transfer.toUserAccount];
              let outputEntity = entity;
              if (isSwap && !entity) {
                outputEntity = { name: 'DEX Swap', type: 'DEX' as const };
              }

              const output: TaintedOutput = {
                address: transfer.toUserAccount,
                amount,
                taintAmount: taintForThis,
                taintPercent,
                signature: tx.signature,
                timestamp: tx.timestamp || 0,
                hop: current.hop + 1,
                entity: outputEntity,
                isToken: true,
                tokenMint: transfer.mint,
              };

              flowGraph.push(output);
              foundOutputs++;

              if (entity && (entity.type === 'CEX' || entity.type === 'BRIDGE')) {
                endpoints.push(output);
              } else if (taintPercent > 10 && current.hop + 1 < maxHops) {
                queue.push({ address: transfer.toUserAccount, taint: taintForThis, hop: current.hop + 1, isToken: true, mint: transfer.mint });
              }
            }
          }
        }

        // Handle native SOL transfers if tracing SOL
        if (!current.isToken && tx.nativeTransfers) {
          for (const transfer of tx.nativeTransfers) {
            if (transfer.fromUserAccount === current.address && transfer.toUserAccount !== current.address) {
              const amount = transfer.amount / 1e9;
              const taintForThis = Math.min(hopTaintRemaining, amount);
              const taintPercent = amount > 0 ? (taintForThis / amount) * 100 : 0;

              if (taintPercent < 1) continue;

              hopTaintRemaining -= taintForThis;

              const entity = KNOWN_ENTITIES[transfer.toUserAccount];
              let outputEntity = entity;
              if (isSwap && !entity) {
                outputEntity = { name: 'DEX Swap', type: 'DEX' as const };
              }

              const output: TaintedOutput = {
                address: transfer.toUserAccount,
                amount,
                taintAmount: taintForThis,
                taintPercent,
                signature: tx.signature,
                timestamp: tx.timestamp || 0,
                hop: current.hop + 1,
                entity: outputEntity,
                isToken: false,
              };

              flowGraph.push(output);
              foundOutputs++;

              if (entity && (entity.type === 'CEX' || entity.type === 'BRIDGE')) {
                endpoints.push(output);
              } else if (taintPercent > 10 && current.hop + 1 < maxHops) {
                queue.push({ address: transfer.toUserAccount, taint: taintForThis, hop: current.hop + 1, isToken: false });
              }
            }
          }
        }
      }

      console.log(chalk.gray(` ${foundOutputs} outputs`));

    } catch {
      console.log(chalk.red(' failed'));
    }
  }

  // Calculate summary - only count first hop amounts to avoid double counting
  const firstHopFlows = flowGraph.filter(e => e.hop === 1);
  const firstHopTotal = firstHopFlows.reduce((sum, e) => sum + e.taintAmount, 0);

  // CEX reached - any hop
  const cexReached = flowGraph.filter(e => e.entity?.type === 'CEX')
    .reduce((sum, e) => sum + e.taintAmount, 0);

  // Bridge used - any hop
  const bridgeUsed = flowGraph.filter(e => e.entity?.type === 'BRIDGE')
    .reduce((sum, e) => sum + e.taintAmount, 0);

  // DEX swaps detected - look for SWAP type or swap in description
  const dexSwaps = flowGraph.filter(e =>
    e.entity?.type === 'DEX' ||
    e.entity?.name === 'DEX Swap'
  );
  const dexUsed = dexSwaps.reduce((sum, e) => sum + e.taintAmount, 0);

  // Amount successfully traced = first hop total (this is what left the victim wallet)
  const traced = firstHopTotal;

  // Find leaf nodes (endpoints of the trace - no further outputs)
  const addressesWithOutputs = new Set(flowGraph.map(f => f.address));
  const leafNodes = flowGraph.filter(f => {
    // Check if this address has any outgoing flows (appears as a source in later hops)
    const hasOutgoing = flowGraph.some(other =>
      other.hop > f.hop &&
      flowGraph.some(prev => prev.address === f.address && prev.hop === f.hop)
    );
    return !hasOutgoing || f.entity;
  });

  // Untraced = amount that reached unknown wallets (no entity, leaf node)
  const untracedLeaves = flowGraph.filter(f =>
    !f.entity &&
    !flowGraph.some(other => other.hop === f.hop + 1)
  );
  const untraced = untracedLeaves.reduce((sum, e) => sum + e.taintAmount, 0);

  // Swapped = DEX transactions
  const swapped = dexUsed;

  return {
    totalStolen: taintTotal,
    traced,
    recovered: cexReached,
    endpoints,
    flowGraph,
    summary: {
      cexReached,
      dexUsed,
      bridgeUsed,
      untraced: Math.max(0, traced - cexReached - dexUsed - bridgeUsed),
      swapped,
    },
    isTokenTrace,
    tokenMint: tracingMint,
    tokenSymbol: detectedTokenSymbol,
  };
}

// Helper: Format timestamp
function formatTimestamp(ts: number): string {
  if (!ts) return 'Unknown';
  const date = new Date(ts * 1000);
  return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

// Display trace results
function displayTraceResults(result: TraceResult, sourceWallet: string): void {
  console.log(chalk.gray('\n  ' + '═'.repeat(70)));
  console.log(chalk.hex('#FF0000').bold(`\n  ${figures.lozenge} TRACE RESULTS - LAW ENFORCEMENT READY\n`));

  // Determine asset type for display
  const assetSymbol = result.isTokenTrace
    ? (result.tokenSymbol || result.tokenMint?.slice(0, 8) || 'TOKEN')
    : 'SOL';

  // === SUMMARY SECTION ===
  console.log(chalk.white.bold('  SUMMARY:'));
  console.log(chalk.gray('  ' + '─'.repeat(68)));
  console.log(chalk.white(`  Victim Wallet:     ${sourceWallet}`));
  if (result.isTokenTrace) {
    console.log(chalk.cyan(`  Asset Stolen:      ${assetSymbol} (SPL Token)`));
    if (result.tokenMint) {
      console.log(chalk.gray(`  Token Mint:        ${result.tokenMint}`));
    }
  } else {
    console.log(chalk.white(`  Asset Stolen:      SOL (Native)`));
  }
  console.log(chalk.white(`  Total Stolen:      ${result.totalStolen.toLocaleString(undefined, {maximumFractionDigits: 4})} ${assetSymbol}`));
  console.log(chalk.white(`  Traced Amount:     ${result.traced.toLocaleString(undefined, {maximumFractionDigits: 4})} ${assetSymbol}`));
  console.log(chalk.white(`  Hops Traced:       ${result.flowGraph.length}`));

  // === RECOVERY ANALYSIS ===
  const recoveryPercent = result.totalStolen > 0
    ? (result.summary.cexReached / result.totalStolen) * 100
    : 0;

  console.log(chalk.white.bold('\n  RECOVERY PROBABILITY:'));
  console.log(chalk.gray('  ' + '─'.repeat(68)));

  const recoveryColor = recoveryPercent >= 50 ? chalk.green : recoveryPercent >= 20 ? chalk.yellow : chalk.red;
  const barLen = Math.floor(recoveryPercent / 5);
  console.log(`  ${recoveryColor('█'.repeat(barLen))}${chalk.gray('░'.repeat(20 - barLen))} ${recoveryColor.bold(recoveryPercent.toFixed(1) + '%')}`);

  console.log('');
  console.log(chalk.green(`  ${figures.tick} CEX (KYC - recoverable):   ${result.summary.cexReached.toLocaleString(undefined, {maximumFractionDigits: 4})} ${assetSymbol}`));
  console.log(chalk.yellow(`  ${figures.warning} DEX (swapped):             ${result.summary.dexUsed.toLocaleString(undefined, {maximumFractionDigits: 4})} ${assetSymbol}`));
  if (result.summary.swapped > 0) {
    console.log(chalk.magenta(`  ↔ Token Swaps:               ${result.summary.swapped.toLocaleString(undefined, {maximumFractionDigits: 4})} ${assetSymbol}`));
  }
  console.log(chalk.red(`  ✗ Bridge (cross-chain):      ${result.summary.bridgeUsed.toLocaleString(undefined, {maximumFractionDigits: 4})} ${assetSymbol}`));
  console.log(chalk.gray(`  ? Untraced:                  ${result.summary.untraced.toLocaleString(undefined, {maximumFractionDigits: 4})} ${assetSymbol}`));

  // === ASCII FLOW VISUALIZATION ===
  console.log(chalk.white.bold('\n  FUND FLOW VISUALIZATION:'));
  console.log(chalk.gray('  ' + '─'.repeat(68)));

  // Group flows by hop
  const maxHop = Math.max(...result.flowGraph.map(f => f.hop), 0);

  // Build visual flow - no boxes, clean format
  console.log('');
  const stolenAmt = result.totalStolen.toLocaleString(undefined, {maximumFractionDigits: 2});

  // Victim
  console.log(chalk.red(`  ${figures.warning} VICTIM`));
  console.log(chalk.red(`  ${sourceWallet}`));
  console.log(chalk.red(`  ${stolenAmt} ${assetSymbol} STOLEN`));
  console.log(chalk.gray('        │'));
  console.log(chalk.gray('        ▼'));

  for (let hop = 1; hop <= Math.min(maxHop, 5); hop++) {
    const hopsAtLevel = result.flowGraph.filter(f => f.hop === hop);
    if (hopsAtLevel.length === 0) continue;

    console.log(chalk.white.bold(`\n  ─── HOP ${hop} ───\n`));

    for (const flow of hopsAtLevel.slice(0, 5)) { // Max 5 per hop
      const entityColor = flow.entity?.type === 'CEX' ? chalk.green :
                         flow.entity?.type === 'DEX' ? chalk.yellow :
                         flow.entity?.type === 'BRIDGE' ? chalk.magenta : chalk.gray;
      const entityIcon = flow.entity?.type === 'CEX' ? figures.tick :
                        flow.entity?.type === 'DEX' ? figures.warning :
                        flow.entity?.type === 'BRIDGE' ? figures.arrowRight : figures.bullet;
      const entityLabel = flow.entity?.name || 'Unknown Wallet';
      const amtStr = flow.taintAmount.toLocaleString(undefined, {maximumFractionDigits: 2});

      console.log(entityColor(`  ${entityIcon} ${entityLabel}`));
      console.log(chalk.cyan(`  ${flow.address}`));
      console.log(entityColor(`  ${amtStr} ${assetSymbol} (${flow.taintPercent.toFixed(0)}% tainted)`));

      if (hop < maxHop) {
        console.log(chalk.gray('        │'));
        console.log(chalk.gray('        ▼'));
      }
      console.log('');
    }
    if (hopsAtLevel.length > 5) {
      console.log(chalk.gray(`  ... +${hopsAtLevel.length - 5} more destinations at hop ${hop}`));
    }
  }

  // Legend
  console.log(chalk.gray('  Legend:'));
  console.log(chalk.green(`    ${figures.tick} CEX = Exchange (KYC - recoverable)`));
  console.log(chalk.yellow(`    ${figures.warning} DEX = Swap (harder to trace)`));
  console.log(chalk.magenta(`    ${figures.arrowRight} Bridge = Cross-chain`));
  console.log(chalk.gray(`    ${figures.bullet} Unknown = Unidentified wallet`));
  console.log('');

  // === DETAILED FUND FLOW (Full Info for Law Enforcement) ===
  console.log(chalk.white.bold('\n  DETAILED FUND FLOW:'));
  console.log(chalk.gray('  ' + '─'.repeat(68)));
  console.log(chalk.gray('  Copy addresses and signatures below for police reports\n'));

  result.flowGraph.forEach((flow, i) => {
    const entityStr = flow.entity ? chalk.cyan(`[${flow.entity.type}] ${flow.entity.name}`) : chalk.gray('[Unknown Wallet]');
    const taintColor = flow.taintPercent >= 80 ? chalk.red : flow.taintPercent >= 50 ? chalk.yellow : chalk.white;
    const flowSymbol = flow.isToken ? (flow.tokenSymbol || assetSymbol) : 'SOL';
    const timestamp = formatTimestamp(flow.timestamp);

    console.log(chalk.white.bold(`  ─── HOP ${flow.hop} ───`));
    console.log(chalk.white(`  To Wallet:    `) + chalk.cyan(flow.address));
    console.log(chalk.white(`  Amount:       `) + taintColor(`${flow.amount.toLocaleString(undefined, {maximumFractionDigits: 4})} ${flowSymbol}`));
    console.log(chalk.white(`  Taint:        `) + taintColor(`${flow.taintPercent.toFixed(1)}%`));
    console.log(chalk.white(`  Timestamp:    `) + chalk.gray(timestamp));
    console.log(chalk.white(`  Tx Signature: `) + chalk.gray(flow.signature));
    console.log(chalk.white(`  Solscan:      `) + chalk.blue.underline(`https://solscan.io/tx/${flow.signature}`));
    console.log(chalk.white(`  Entity:       `) + entityStr);
    console.log('');
  });

  // === ENDPOINTS (KYC Entities Reached) ===
  if (result.endpoints.length > 0) {
    console.log(chalk.white.bold('  KYC ENDPOINTS (Contact These Exchanges):'));
    console.log(chalk.gray('  ' + '─'.repeat(68)));

    result.endpoints.forEach((ep, i) => {
      const typeColor = ep.entity?.type === 'CEX' ? chalk.green : chalk.yellow;
      const entityName = ep.entity?.name || 'Unknown';
      const typeLabel = ep.entity?.type || '???';
      const epSymbol = ep.isToken ? (ep.tokenSymbol || assetSymbol) : 'SOL';

      console.log(chalk.white.bold(`  ${i + 1}. ${entityName} (${typeLabel})`));
      console.log(chalk.white(`     Deposit Address: `) + chalk.cyan(ep.address));
      console.log(chalk.white(`     Amount:          `) + typeColor(`${ep.taintAmount.toLocaleString(undefined, {maximumFractionDigits: 4})} ${epSymbol}`));
      console.log(chalk.white(`     Tx Signature:    `) + chalk.gray(ep.signature));
      console.log(chalk.white(`     Timestamp:       `) + chalk.gray(formatTimestamp(ep.timestamp)));
      console.log('');
    });
  }

  // Recommendations
  console.log(chalk.gray('\n  ' + '─'.repeat(50)));
  console.log(chalk.white.bold('\n  Recommendations:\n'));

  if (result.summary.cexReached > 0) {
    console.log(chalk.green('  ✓ Funds reached CEX with KYC - Contact exchanges with:'));
    console.log(chalk.gray('    • Police report / FIR number'));
    console.log(chalk.gray('    • Transaction signatures'));
    console.log(chalk.gray('    • Wallet ownership proof'));

    // List specific exchanges
    const exchanges = [...new Set(result.endpoints
      .filter(e => e.entity?.type === 'CEX')
      .map(e => e.entity?.name))];
    if (exchanges.length > 0) {
      console.log(chalk.cyan(`    • Contact: ${exchanges.join(', ')}`));
    }
  }

  if (result.isTokenTrace && result.summary.swapped > 0) {
    console.log(chalk.magenta('\n  ⚠️  Tokens were swapped via DEX'));
    console.log(chalk.gray('    • Thief converted tokens to SOL or other assets'));
    console.log(chalk.gray('    • Run /trace again on destination wallets with SOL type'));
  }

  if (result.summary.bridgeUsed > 0) {
    console.log(chalk.yellow('\n  ⚠️  Funds crossed bridge - Requires cross-chain investigation'));
    console.log(chalk.gray('    • Check destination chain for further tracing'));
  }

  if (result.summary.untraced > result.totalStolen * 0.5) {
    console.log(chalk.red('\n  ⚠️  Significant funds untraced'));
    console.log(chalk.gray('    • May have been mixed or sent to unknown wallets'));
    console.log(chalk.gray('    • Consider professional forensics services'));
  }

  if (result.summary.cexReached === 0 && result.summary.bridgeUsed === 0) {
    console.log(chalk.red('\n  ❌ No KYC endpoints found'));
    console.log(chalk.gray('    • Funds remain in self-custody wallets'));
    console.log(chalk.gray('    • Monitor endpoints for future CEX deposits'));
  }

  // Export option
  console.log(chalk.gray('\n  ' + '─'.repeat(50)));
  console.log(chalk.gray('  Use /graph-export to export full flow graph for visualization\n'));
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI PRIVACY AGENT
// ═══════════════════════════════════════════════════════════════════════════════

// Configure LLM provider
// Fetch available Ollama models
async function getOllamaModels(baseUrl: string): Promise<Array<{ name: string; size: number; modified: string }>> {
  try {
    // Ollama API endpoint for listing models (without /v1)
    const apiUrl = baseUrl.replace('/v1', '').replace(/\/$/, '');
    const response = await axios.get(`${apiUrl}/api/tags`, { timeout: 5000 });

    if (response.data?.models) {
      return response.data.models.map((m: any) => ({
        name: m.name,
        size: m.size || 0,
        modified: m.modified_at || '',
      }));
    }
    return [];
  } catch {
    return [];
  }
}

// Recommend best Ollama model for privacy analysis
function recommendOllamaModel(models: Array<{ name: string; size: number }>): string | null {
  if (models.length === 0) return null;

  // Priority: models that support tool/function calling (required for agent)
  // llama3.x and mistral support tools, qwen/codellama often don't
  const preferredModels = [
    'llama3.2',         // Best tool support, good reasoning
    'llama3.1',         // Excellent tool support
    'llama3:',          // Tool support
    'mistral',          // Good tool support
    'qwen2.5',          // May work with tools
    'deepseek',         // May work
  ];

  // Find best match from preferred models (prefer larger sizes)
  for (const preferred of preferredModels) {
    const matches = models
      .filter(m => m.name.toLowerCase().includes(preferred))
      .sort((a, b) => b.size - a.size); // Prefer larger models

    if (matches.length > 0) {
      return matches[0].name;
    }
  }

  // Fallback: return largest model
  const sorted = [...models].sort((a, b) => b.size - a.size);
  return sorted[0]?.name || null;
}

async function configureLLM(): Promise<void> {
  console.log(chalk.hex('#9945FF').bold(`\n  ${icons.config} CONFIGURE AI PROVIDER\n`));
  console.log(chalk.gray('  Set up your preferred LLM for the AI Privacy Agent\n'));

  const config = loadConfig();
  const currentProvider = config.llm?.provider;

  if (currentProvider) {
    const info = getProviderInfo(currentProvider);
    console.log(chalk.gray(`  Current: ${info.name} (${config.llm?.model || 'default model'})\n`));
  }

  // Select provider
  const providerChoices = SUPPORTED_PROVIDERS.map(p => {
    const info = getProviderInfo(p);
    return {
      value: p,
      name: `${info.name}${!info.requiresKey ? ' (no API key required)' : ''}`,
    };
  });

  const provider = await select({
    message: 'Select LLM Provider',
    choices: providerChoices,
  }) as LLMProvider;

  const providerInfo = getProviderInfo(provider);
  let apiKey: string | undefined;
  let model: string | undefined;
  let baseUrl: string | undefined;

  // Get API key if required
  if (providerInfo.requiresKey) {
    apiKey = await input({
      message: `${providerInfo.name} API Key`,
      default: config.llm?.provider === provider ? config.llm?.apiKey : undefined,
    });

    if (!apiKey) {
      console.log(chalk.red(`\n  ${icons.error} API key is required for ${providerInfo.name}`));
      return;
    }
  }

  // For Ollama, detect models and let user choose
  if (provider === 'ollama') {
    baseUrl = await input({
      message: 'Ollama base URL',
      default: 'http://localhost:11434/v1',
    });

    console.log(chalk.gray('\n  Detecting available models...'));
    const models = await getOllamaModels(baseUrl);

    if (models.length === 0) {
      console.log(chalk.yellow(`\n  ${icons.warn} Could not detect Ollama models. Is Ollama running?`));
      console.log(chalk.gray('  Using default model: llama3.2\n'));
      model = 'llama3.2';
    } else {
      const recommended = recommendOllamaModel(models);

      // Models known to support tool/function calling
      const toolSupportModels = ['llama3.2', 'llama3.1', 'llama3:', 'mistral'];
      const supportsTools = (name: string) =>
        toolSupportModels.some(m => name.toLowerCase().includes(m));

      // Build choices with size and tool support info
      const modelChoices = models.map(m => {
        const sizeGB = (m.size / 1e9).toFixed(1);
        const isRecommended = m.name === recommended;
        const hasTools = supportsTools(m.name);
        const toolBadge = hasTools ? chalk.cyan(' [tools]') : chalk.gray(' [no tools]');
        return {
          value: m.name,
          name: `${m.name} (${sizeGB}GB)${toolBadge}${isRecommended ? chalk.green(' ← recommended') : ''}`,
        };
      });

      // Sort: recommended first, then tool support, then by size
      modelChoices.sort((a, b) => {
        if (a.value === recommended) return -1;
        if (b.value === recommended) return 1;
        const aTools = supportsTools(a.value);
        const bTools = supportsTools(b.value);
        if (aTools && !bTools) return -1;
        if (!aTools && bTools) return 1;
        return 0;
      });

      console.log(chalk.green(`\n  ${icons.success} Found ${models.length} models`));
      console.log(chalk.gray('  Note: Agent requires models with [tools] support\n'));

      model = await select({
        message: 'Select Ollama model',
        choices: modelChoices,
      });

      // Warning for small models
      const isSmallModel = model && (
        model.includes(':1b') ||
        model.includes(':3b') ||
        model.includes('3.2:3b') ||
        model.includes(':0.') ||
        model.match(/:\d+m/i)  // models in millions of params
      );

      if (isSmallModel) {
        console.log(chalk.yellow(`\n  ${icons.warn} Small Model Warning:`));
        console.log(chalk.gray('  Models under 7B parameters may struggle with:'));
        console.log(chalk.gray('    - Following complex instructions'));
        console.log(chalk.gray('    - Answering follow-up questions correctly'));
        console.log(chalk.gray('    - Staying focused (may repeat full analysis)'));
        console.log(chalk.gray('  For better results, use 7B+ models or cloud providers (xAI, OpenAI, Claude)\n'));
      }
    }
  } else {
    // For other providers, optional custom model
    const useCustomModel = await confirm({
      message: 'Use a custom model? (default is recommended)',
      default: false,
    });

    if (useCustomModel) {
      model = await input({
        message: 'Model name (e.g., gpt-4o, claude-3-opus)',
      });
    }
  }

  // Save config
  config.llm = {
    provider,
    apiKey,
    model,
    baseUrl,
  };
  saveConfig(config);

  console.log(chalk.green(`\n  ${icons.success} AI Provider configured: ${providerInfo.name}${model ? ` (${model})` : ''}`));
  console.log(chalk.gray('  You can now use /agent to get AI-powered recommendations\n'));
}

// Run AI Privacy Agent
async function runPrivacyAgent(): Promise<void> {
  console.log(chalk.hex('#9945FF').bold(`\n  ${icons.agent} SOLPRIVACY AI AGENT\n`));

  const config = loadConfig();

  // Check if LLM is configured
  if (!config.llm?.provider) {
    console.log(chalk.yellow(`  ${icons.warn} AI not configured. Running /config-llm first...\n`));
    await configureLLM();
    return;
  }

  const providerInfo = getProviderInfo(config.llm.provider);
  console.log(chalk.gray(`  Provider: ${providerInfo.name} (${config.llm.model || 'default'})\n`));

  // Warn about small model limitations for follow-ups
  const modelName = config.llm.model || '';
  const isSmallOllama = config.llm.provider === 'ollama' && (
    modelName.includes(':1b') ||
    modelName.includes(':3b') ||
    modelName.includes('3.2:3b') ||
    modelName.includes(':0.')
  );
  if (isSmallOllama) {
    console.log(chalk.yellow(`  ${icons.warn} Note: Small models may not handle follow-up questions well.`));
    console.log(chalk.gray('  Consider using 7B+ models or /config-llm to switch to xAI/OpenAI.\n'));
  }

  // Get wallet address
  const address = await getWalletAddress();
  const validation = validateWallet(address);
  if (!validation.valid) {
    console.log(chalk.red(`  ${icons.error} ${validation.error}`));
    return;
  }

  console.log(chalk.gray('  Analyzing wallet and consulting AI...\n'));

  // Prepare LLM config
  const llmConfig: LLMConfig = {
    provider: config.llm.provider,
    apiKey: config.llm.apiKey,
    model: config.llm.model,
    baseUrl: config.llm.baseUrl,
  };

  try {
    // Run quick analysis
    const result = await quickAnalysis(address, { llmConfig });

    // Display results
    console.log(chalk.hex('#14F195').bold('  AI ANALYSIS:\n'));
    console.log(chalk.white(result.text));

    // Show tool calls for transparency
    if (result.toolCalls.length > 0) {
      console.log(chalk.gray('\n  ' + '─'.repeat(50)));
      console.log(chalk.gray('  Tools used:'));
      for (const tc of result.toolCalls) {
        console.log(chalk.gray(`    • ${tc.name}`));
      }
    }

    // Interactive follow-up
    let continueChat = true;
    const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [
      { role: 'user', content: `Analyze wallet ${address}` },
      { role: 'assistant', content: result.text },
    ];

    while (continueChat) {
      console.log('');
      const followUp = await select({
        message: 'What next?',
        choices: [
          { value: 'question', name: 'Ask a follow-up question' },
          { value: 'reanalyze', name: 'Re-analyze wallet' },
          { value: 'exit', name: 'Exit agent' },
        ],
      });

      if (followUp === 'exit') {
        continueChat = false;
      } else if (followUp === 'reanalyze') {
        console.log(chalk.gray('\n  Re-analyzing...\n'));
        const reResult = await quickAnalysis(address, { llmConfig });
        console.log(chalk.hex('#14F195').bold('  AI ANALYSIS:\n'));
        console.log(chalk.white(reResult.text));
      } else if (followUp === 'question') {
        const question = await input({
          message: 'Your question',
        });

        console.log(chalk.gray('\n  Thinking...\n'));

        const response = await runAgent(question, { llmConfig }, conversationHistory);
        console.log(chalk.hex('#14F195').bold('  AI RESPONSE:\n'));
        console.log(chalk.white(response.text));

        conversationHistory.push(
          { role: 'user', content: question },
          { role: 'assistant', content: response.text }
        );
      }
    }

    console.log(chalk.gray('\n  Agent session ended.\n'));

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.log(chalk.red(`\n  ${icons.error} Agent error: ${errorMsg}`));
    console.log(chalk.gray('  Make sure your API key is valid and you have internet connection.\n'));
  }
}

// Helper: Save snapshot
function saveSnapshot(address: string, data: any): void {
  const snapshotFile = path.join(SNAPSHOTS_DIR, `${address}.json`);
  let snapshots: Array<{ timestamp: string; score: number; data: any }> = [];

  if (fs.existsSync(snapshotFile)) {
    try {
      snapshots = JSON.parse(fs.readFileSync(snapshotFile, 'utf-8'));
    } catch {
      snapshots = [];
    }
  }

  // Add new snapshot (keep last 100)
  snapshots.push({
    timestamp: new Date().toISOString(),
    score: data.advancedPrivacyScore,
    data: {
      entropy: data.entropy,
      kAnonymity: data.kAnonymity,
      advancedClustering: data.advancedClustering,
      exchangeFingerprint: data.exchangeFingerprint,
      dustAttack: data.dustAttack,
      grade: data.grade,
      riskLevel: data.riskLevel,
    },
  });

  if (snapshots.length > 100) {
    snapshots = snapshots.slice(-100);
  }

  fs.writeFileSync(snapshotFile, JSON.stringify(snapshots, null, 2));
}

// Main Menu
function showMenu(): void {
  console.log(chalk.hex('#9945FF').bold('\n  COMMANDS:'));
  console.log(chalk.gray('  ' + '─'.repeat(50)));
  console.log(chalk.white('  /analyze        ') + chalk.gray('- Full privacy analysis of a wallet'));
  console.log(chalk.white('  /quick          ') + chalk.gray('- Quick privacy score check'));
  console.log(chalk.white('  /compare        ') + chalk.gray('- Compare two wallets'));
  console.log(chalk.hex('#14F195')('  /deanon         ') + chalk.gray('- Deanonymization probability'));
  console.log(chalk.hex('#14F195')('  /attack-sim     ') + chalk.gray('- Simulate adversary attacks'));
  console.log(chalk.hex('#FF6B6B')('  /timezone       ') + chalk.gray('- Timezone inference attack'));
  console.log(chalk.hex('#9945FF')('  /fingerprint    ') + chalk.gray('- Behavioral fingerprint analysis'));
  console.log(chalk.hex('#FF4444')('  /taint          ') + chalk.gray('- Taint flow analysis'));
  console.log(chalk.gray('  ' + '─'.repeat(50)));
  console.log(chalk.hex('#FF6B00').bold('  CLI-EXCLUSIVE FEATURES:'));
  console.log(chalk.hex('#FF6B00')('  /batch          ') + chalk.gray('- Batch analyze multiple wallets'));
  console.log(chalk.hex('#00D4FF')('  /watch          ') + chalk.gray('- Real-time privacy monitoring'));
  console.log(chalk.hex('#E84142')('  /helius-direct  ') + chalk.gray('- Direct Helius API analysis'));
  console.log(chalk.hex('#9945FF')('  /graph-export   ') + chalk.gray('- Export transaction graph'));
  console.log(chalk.hex('#14F195')('  /diff           ') + chalk.gray('- Compare snapshots over time'));
  console.log(chalk.hex('#FF0000')('  /trace          ') + chalk.gray('- Trace stolen funds (FIFO algorithm)'));
  console.log(chalk.gray('  ' + '─'.repeat(50)));
  console.log(chalk.white('  /history        ') + chalk.gray('- View analysis history'));
  console.log(chalk.white('  /leaderboard    ') + chalk.gray('- Privacy ranking'));
  console.log(chalk.hex('#E84142')('  /helius         ') + chalk.gray('- Helius API stats'));
  console.log(chalk.white('  /export         ') + chalk.gray('- Export HTML report'));
  console.log(chalk.white('  /examples       ') + chalk.gray('- Show example wallets'));
  console.log(chalk.white('  /help           ') + chalk.gray('- Show this menu'));
  console.log(chalk.white('  /clear          ') + chalk.gray('- Clear screen'));
  console.log(chalk.red('  /exit           ') + chalk.gray('- Exit CLI'));
  console.log('');
}

function showExamples(): void {
  console.log(chalk.cyan('\n  EXAMPLE WALLETS FOR TESTING:'));
  console.log(chalk.gray('  ' + '─'.repeat(60)));
  console.log(chalk.white('  1. ') + chalk.gray('vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg'));
  console.log(chalk.gray('     Solana Foundation - High activity'));
  console.log(chalk.white('  2. ') + chalk.gray('4nepvZMsEGfK7GhFA4738VGTnQucnWwngN76Wem1EB4F'));
  console.log(chalk.gray('     Test wallet with dust attack activity'));
  console.log(chalk.white('  3. ') + chalk.gray('AQFnRFkK8Jrxi91h2HCxQrdtdayWPSHKvAURR85ZeLWG'));
  console.log(chalk.gray('     Another test wallet'));
}

// Autocomplete input - shows commands when typing /
async function getUserInput(): Promise<{ type: 'command' | 'wallet' | 'empty'; value: string }> {
  const result = await autocomplete({
    message: chalk.hex('#9945FF')('solprivacy>'),
    source: async (input: string | undefined) => {
      const term = input || '';

      // If starts with /, show filtered commands
      if (term.startsWith('/')) {
        const search = term.toLowerCase();
        const filtered = COMMANDS.filter(c =>
          c.value.toLowerCase().includes(search) ||
          c.description.toLowerCase().includes(search.slice(1))
        );
        return filtered.map(c => ({
          value: c.value,
          name: c.name,
          description: c.description,
        }));
      }

      // If looks like wallet address, show option to analyze
      if (term.length > 30 && isValidSolanaAddress(term)) {
        return [{
          value: `wallet:${term}`,
          name: `Analyze wallet: ${term.slice(0, 20)}...`,
          description: 'Quick privacy analysis',
        }];
      }

      // Empty or short input - show hint
      if (term.length === 0) {
        return [{
          value: '__prompt__',
          name: chalk.gray('Type / for commands or paste wallet address'),
          description: '',
        }];
      }

      return [];
    },
  });

  const resultStr = String(result || '');

  if (!resultStr || resultStr === '__prompt__') {
    return { type: 'empty', value: '' };
  }

  // Check if wallet
  if (resultStr.startsWith('wallet:')) {
    return { type: 'wallet', value: resultStr.slice(7) };
  }

  // Command
  if (resultStr.startsWith('/')) {
    return { type: 'command', value: resultStr };
  }

  return { type: 'empty', value: '' };
}

// Main CLI Loop
async function main(): Promise<void> {
  // Debug: immediate output to verify startup
  process.stdout.write('\n');

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log(chalk.hex('#14F195')('\n\n  Goodbye! Stay private. 🛡️\n'));
    process.exit(0);
  });

  // Show banner
  console.log('\n');
  console.log(banner);
  console.log(chalk.gray('         Solana Wallet Privacy Analyzer • Powered by TETSUO'));
  console.log(chalk.gray('         https://solprivacy.xyz • v1.0.0\n'));
  console.log(chalk.hex('#14F195')('  Type / for commands, or paste a wallet address\n'));

  let running = true;

  while (running) {
    try {
      const userInput = await getUserInput();

      // Empty input - continue loop
      if (userInput.type === 'empty') {
        continue;
      }

      // Handle wallet - quick analyze
      if (userInput.type === 'wallet') {
        console.log(chalk.yellow('\n  Analyzing wallet...'));
        const data = await analyzeWallet(userInput.value);
        if (data) {
          displayQuickAnalysis(data, userInput.value);
        }
        continue;
      }

      // Handle command
      const command = userInput.value;

      switch (command) {
        case '/analyze': {
          const address = await getWalletAddress();
          const validation = validateWallet(address);
          if (!validation.valid) {
            console.log(chalk.red(`  [ERROR] ${validation.error}`));
            break;
          }
          console.log(chalk.yellow('\n  [ANALYZING] This may take up to 30 seconds...'));
          const data = await analyzeWallet(address.trim());
          if (data) {
            displayAnalysis(data, address.trim());
          }
          break;
        }

        case '/quick': {
          const address = await getWalletAddress();
          const validation = validateWallet(address);
          if (!validation.valid) {
            console.log(chalk.red(`  [ERROR] ${validation.error}`));
            break;
          }
          console.log(chalk.yellow('\n  [ANALYZING] Checking...'));
          const data = await analyzeWallet(address.trim());
          if (data) {
            displayQuickAnalysis(data, address.trim());
          }
          break;
        }

        case '/compare':
          await compareWallets();
          break;

        case '/deanon': {
          if (!lastAnalyzedData || !lastAnalyzedWallet) {
            console.log(chalk.yellow('  [INFO] No wallet analyzed yet. Analyzing one first...'));
            const addr = await getWalletAddress();
            const validation = validateWallet(addr);
            if (!validation.valid) {
              console.log(chalk.red(`  [ERROR] ${validation.error}`));
              break;
            }
            console.log(chalk.yellow('\n  [ANALYZING] Please wait...'));
            const data = await analyzeWallet(addr.trim());
            if (data) {
              displayDeanonProbability(data, addr.trim());
            }
          } else {
            displayDeanonProbability(lastAnalyzedData, lastAnalyzedWallet);
          }
          break;
        }

        case '/attack-sim': {
          if (!lastAnalyzedData || !lastAnalyzedWallet) {
            console.log(chalk.yellow('  [INFO] No wallet analyzed yet. Analyzing one first...'));
            const addr = await getWalletAddress();
            const validation = validateWallet(addr);
            if (!validation.valid) {
              console.log(chalk.red(`  [ERROR] ${validation.error}`));
              break;
            }
            console.log(chalk.yellow('\n  [ANALYZING] Please wait...'));
            const data = await analyzeWallet(addr.trim());
            if (data) {
              await displayAttackSimulation(data, addr.trim());
            }
          } else {
            await displayAttackSimulation(lastAnalyzedData, lastAnalyzedWallet);
          }
          break;
        }

        case '/timezone': {
          if (!lastAnalyzedData || !lastAnalyzedWallet) {
            console.log(chalk.yellow('  [INFO] No wallet analyzed yet. Analyzing one first...'));
            const addr = await getWalletAddress();
            const validation = validateWallet(addr);
            if (!validation.valid) {
              console.log(chalk.red(`  [ERROR] ${validation.error}`));
              break;
            }
            console.log(chalk.yellow('\n  [ANALYZING] Please wait...'));
            const data = await analyzeWallet(addr.trim());
            if (data) {
              displayTimezoneInference(data, addr.trim());
            }
          } else {
            displayTimezoneInference(lastAnalyzedData, lastAnalyzedWallet);
          }
          break;
        }

        case '/fingerprint': {
          if (!lastAnalyzedData || !lastAnalyzedWallet) {
            console.log(chalk.yellow('  [INFO] No wallet analyzed yet. Analyzing one first...'));
            const addr = await getWalletAddress();
            const validation = validateWallet(addr);
            if (!validation.valid) {
              console.log(chalk.red(`  [ERROR] ${validation.error}`));
              break;
            }
            console.log(chalk.yellow('\n  [ANALYZING] Please wait...'));
            const data = await analyzeWallet(addr.trim());
            if (data) {
              displayBehavioralFingerprint(data, addr.trim());
            }
          } else {
            displayBehavioralFingerprint(lastAnalyzedData, lastAnalyzedWallet);
          }
          break;
        }

        case '/taint': {
          if (!lastAnalyzedData || !lastAnalyzedWallet) {
            console.log(chalk.yellow('  [INFO] No wallet analyzed yet. Analyzing one first...'));
            const addr = await getWalletAddress();
            const validation = validateWallet(addr);
            if (!validation.valid) {
              console.log(chalk.red(`  [ERROR] ${validation.error}`));
              break;
            }
            console.log(chalk.yellow('\n  [ANALYZING] Please wait...'));
            const data = await analyzeWallet(addr.trim());
            if (data) {
              displayTaintAnalysis(data, addr.trim());
            }
          } else {
            displayTaintAnalysis(lastAnalyzedData, lastAnalyzedWallet);
          }
          break;
        }

        case '/helius':
          displayHeliusStats();
          break;

        case '/leaderboard':
          displayLeaderboard();
          break;

        case '/export': {
          if (!lastAnalyzedData || !lastAnalyzedWallet) {
            console.log(chalk.red('  [ERROR] No wallet analyzed yet. Use /analyze first.'));
          } else {
            exportHtmlReport(lastAnalyzedData, lastAnalyzedWallet);
          }
          break;
        }

        // CLI-EXCLUSIVE FEATURES
        case '/batch':
          await batchAnalyze();
          break;

        case '/watch':
          await watchWallet();
          break;

        case '/helius-direct':
          await heliusDirect();
          break;

        case '/graph-export':
          await graphExport();
          break;

        case '/diff':
          await privacyDiff();
          break;

        case '/trace':
          await traceStolen();
          break;

        case '/agent':
          await runPrivacyAgent();
          break;

        case '/config-llm':
          await configureLLM();
          break;

        case '/history':
          displayHistory();
          break;

        case '/examples':
          showExamples();
          break;

        case '/help':
          showMenu();
          break;

        case '/clear':
          console.clear();
          console.log(banner);
          console.log(chalk.gray('         Solana Wallet Privacy Analyzer • Powered by TETSUO\n'));
          break;

        case '/exit':
          running = false;
          console.log(chalk.hex('#14F195')('\n  Goodbye! Stay private. 🛡️\n'));
          break;
      }
    } catch (error: any) {
      // Handle Ctrl+C during prompts
      if (error.message?.includes('User force closed')) {
        console.log(chalk.hex('#14F195')('\n\n  Goodbye! Stay private. 🛡️\n'));
        process.exit(0);
      }
      throw error;
    }
  }

  process.exit(0);
}

main().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
