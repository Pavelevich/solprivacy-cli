#!/usr/bin/env node

import * as readline from 'readline';
import chalk from 'chalk';
import axios from 'axios';

// API Configuration
const API_URL = process.env.SOLPRIVACY_API_URL || 'https://solprivacy.xyz';

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
  temporalAnalysis: { autocorrelation: number };
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

// ASCII Art Banner - SOLPRIVACY
const banner = `
${chalk.hex('#9945FF')('███████╗')}${chalk.hex('#14F195')(' ██████╗ ')}${chalk.hex('#9945FF')('██╗     ')}${chalk.hex('#14F195')('██████╗ ')}${chalk.hex('#9945FF')('██████╗ ')}${chalk.hex('#14F195')('██╗')}${chalk.hex('#9945FF')('██╗   ██╗')}${chalk.hex('#14F195')(' █████╗ ')}${chalk.hex('#9945FF')(' ██████╗')}${chalk.hex('#14F195')('██╗   ██╗')}
${chalk.hex('#9945FF')('██╔════╝')}${chalk.hex('#14F195')('██╔═══██╗')}${chalk.hex('#9945FF')('██║     ')}${chalk.hex('#14F195')('██╔══██╗')}${chalk.hex('#9945FF')('██╔══██╗')}${chalk.hex('#14F195')('██║')}${chalk.hex('#9945FF')('██║   ██║')}${chalk.hex('#14F195')('██╔══██╗')}${chalk.hex('#9945FF')('██╔════╝')}${chalk.hex('#14F195')('╚██╗ ██╔╝')}
${chalk.hex('#9945FF')('███████╗')}${chalk.hex('#14F195')('██║   ██║')}${chalk.hex('#9945FF')('██║     ')}${chalk.hex('#14F195')('██████╔╝')}${chalk.hex('#9945FF')('██████╔╝')}${chalk.hex('#14F195')('██║')}${chalk.hex('#9945FF')('██║   ██║')}${chalk.hex('#14F195')('███████║')}${chalk.hex('#9945FF')('██║     ')}${chalk.hex('#14F195')(' ╚████╔╝ ')}
${chalk.hex('#9945FF')('╚════██║')}${chalk.hex('#14F195')('██║   ██║')}${chalk.hex('#9945FF')('██║     ')}${chalk.hex('#14F195')('██╔═══╝ ')}${chalk.hex('#9945FF')('██╔══██╗')}${chalk.hex('#14F195')('██║')}${chalk.hex('#9945FF')('╚██╗ ██╔╝')}${chalk.hex('#14F195')('██╔══██║')}${chalk.hex('#9945FF')('██║     ')}${chalk.hex('#14F195')('  ╚██╔╝  ')}
${chalk.hex('#9945FF')('███████║')}${chalk.hex('#14F195')('╚██████╔╝')}${chalk.hex('#9945FF')('███████╗')}${chalk.hex('#14F195')('██║     ')}${chalk.hex('#9945FF')('██║  ██║')}${chalk.hex('#14F195')('██║')}${chalk.hex('#9945FF')(' ╚████╔╝ ')}${chalk.hex('#14F195')('██║  ██║')}${chalk.hex('#9945FF')('╚██████╗')}${chalk.hex('#14F195')('   ██║   ')}
${chalk.hex('#9945FF')('╚══════╝')}${chalk.hex('#14F195')(' ╚═════╝ ')}${chalk.hex('#9945FF')('╚══════╝')}${chalk.hex('#14F195')('╚═╝     ')}${chalk.hex('#9945FF')('╚═╝  ╚═╝')}${chalk.hex('#14F195')('╚═╝')}${chalk.hex('#9945FF')('  ╚═══╝  ')}${chalk.hex('#14F195')('╚═╝  ╚═╝')}${chalk.hex('#9945FF')(' ╚═════╝')}${chalk.hex('#14F195')('   ╚═╝   ')}
`;

// Helper functions
function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(chalk.cyan(prompt), resolve);
  });
}

function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
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
    const response = await axios.get(`${API_URL}/api/v3/analyze/${address}`, {
      timeout: 60000,
      headers: {
        'User-Agent': 'SolPrivacy-CLI/1.0.0',
        'Accept': 'application/json'
      }
    });

    if (response.data.success) {
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

  // Score
  console.log(chalk.cyan('\n┌─────────────────────────────────────────────────────────────────────┐'));
  console.log(chalk.cyan('│') + '                         PRIVACY SCORE                              ' + chalk.cyan('│'));
  console.log(chalk.cyan('│') + '                                                                     ' + chalk.cyan('│'));
  console.log(chalk.cyan('│') + `                              ${scoreColor.bold(data.advancedPrivacyScore.toString().padStart(3))}                                  ` + chalk.cyan('│'));
  console.log(chalk.cyan('│') + `                           Grade: ${scoreColor.bold(data.grade)}                               ` + chalk.cyan('│'));
  console.log(chalk.cyan('│') + `                        Risk: ${riskColor.bold(data.riskLevel.padEnd(10))}                          ` + chalk.cyan('│'));
  console.log(chalk.cyan('└─────────────────────────────────────────────────────────────────────┘'));

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

  console.log(chalk.cyan('\n┌────────────────────────────────────────────┐'));
  console.log(chalk.cyan('│') + '          QUICK PRIVACY SCORE              ' + chalk.cyan('│'));
  console.log(chalk.cyan('├────────────────────────────────────────────┤'));
  console.log(chalk.cyan('│') + ` Score: ${scoreColor.bold(data.advancedPrivacyScore.toString().padStart(3))}/100  Grade: ${scoreColor.bold(data.grade)}  Risk: ${riskColor.bold(data.riskLevel.padEnd(8))} ` + chalk.cyan('│'));
  console.log(chalk.cyan('└────────────────────────────────────────────┘'));

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
  if (analysisHistory.length === 0) {
    console.log(chalk.yellow('\n  No analysis history yet.'));
    return;
  }

  console.log(chalk.cyan('\n  ANALYSIS HISTORY'));
  console.log(chalk.gray('  ' + '─'.repeat(66)));

  analysisHistory.forEach((item, i) => {
    const scoreColor = getScoreColor(item.score);
    const date = new Date(item.timestamp).toLocaleString();
    console.log(`  ${i + 1}. ${chalk.gray(item.address.slice(0, 8))}...${chalk.gray(item.address.slice(-6))} | Score: ${scoreColor(item.score.toString())} (${item.grade}) | ${chalk.gray(date)}`);
  });
}

async function compareWallets(rl: readline.Interface): Promise<void> {
  const address1 = await question(rl, '\n  First wallet address: ');
  if (!isValidSolanaAddress(address1.trim())) {
    console.log(chalk.red('  [ERROR] Invalid Solana address'));
    return;
  }

  const address2 = await question(rl, '  Second wallet address: ');
  if (!isValidSolanaAddress(address2.trim())) {
    console.log(chalk.red('  [ERROR] Invalid Solana address'));
    return;
  }

  console.log(chalk.yellow('\n  [ANALYZING] Comparing wallets...'));

  try {
    const response = await axios.get(`${API_URL}/api/v3/compare`, {
      params: { wallet1: address1.trim(), wallet2: address2.trim() },
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
      console.log(`  Wallet 1: ${chalk.gray(address1.slice(0, 8))}...`);
      console.log(`    Score: ${getScoreColor(wallet1.score)(wallet1.score)} | Grade: ${wallet1.grade}`);
      console.log(`  Wallet 2: ${chalk.gray(address2.slice(0, 8))}...`);
      console.log(`    Score: ${getScoreColor(wallet2.score)(wallet2.score)} | Grade: ${wallet2.grade}`);
      console.log(chalk.gray('  ' + '─'.repeat(50)));
      console.log(`  More Private: ${chalk.green(comparison.morePrivate === 'wallet1' ? 'Wallet 1' : 'Wallet 2')}`);
      console.log(`  Score Diff:   ${Math.abs(comparison.scoreDifference)} points`);
    }
  } catch (error: any) {
    console.log(chalk.red(`  [ERROR] ${error.message}`));
  }
}

// Main Menu
function showMenu(): void {
  console.log(chalk.hex('#9945FF').bold('\n  COMMANDS:'));
  console.log(chalk.gray('  ' + '─'.repeat(50)));
  console.log(chalk.white('  /analyze        ') + chalk.gray('- Full privacy analysis of a wallet'));
  console.log(chalk.white('  /quick          ') + chalk.gray('- Quick privacy score check'));
  console.log(chalk.white('  /compare        ') + chalk.gray('- Compare two wallets'));
  console.log(chalk.white('  /history        ') + chalk.gray('- View analysis history'));
  console.log(chalk.white('  /examples       ') + chalk.gray('- Show example wallets'));
  console.log(chalk.white('  /help           ') + chalk.gray('- Show this menu'));
  console.log(chalk.white('  /clear          ') + chalk.gray('- Clear screen'));
  console.log(chalk.white('  /exit           ') + chalk.gray('- Exit CLI'));
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

// Main CLI Loop
async function main(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log(chalk.hex('#14F195')('\n\n  Goodbye! Stay private. 🛡️\n'));
    process.exit(0);
  });

  console.clear();
  console.log(banner);
  console.log(chalk.gray('         Solana Wallet Privacy Analyzer • Powered by TETSUO'));
  console.log(chalk.gray('         https://solprivacy.xyz • v1.0.0\n'));

  showMenu();

  let running = true;

  while (running) {
    const input = await question(rl, chalk.hex('#9945FF')('solprivacy> '));
    const command = input.toLowerCase().trim();

    switch (command) {
      case '/analyze':
      case '/a': {
        const address = await question(rl, '\n  Wallet address: ');
        if (!isValidSolanaAddress(address.trim())) {
          console.log(chalk.red('  [ERROR] Invalid Solana address'));
          break;
        }
        console.log(chalk.yellow('\n  [ANALYZING] This may take up to 30 seconds...'));
        const data = await analyzeWallet(address.trim());
        if (data) {
          displayAnalysis(data, address.trim());
        }
        break;
      }

      case '/quick':
      case '/q': {
        const address = await question(rl, '\n  Wallet address: ');
        if (!isValidSolanaAddress(address.trim())) {
          console.log(chalk.red('  [ERROR] Invalid Solana address'));
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
      case '/c':
        await compareWallets(rl);
        break;

      case '/history':
      case '/h':
        displayHistory();
        break;

      case '/examples':
      case '/e':
        showExamples();
        break;

      case '/help':
      case '/?':
        showMenu();
        break;

      case '/clear':
        console.clear();
        console.log(banner);
        console.log(chalk.gray('         Solana Wallet Privacy Analyzer • Powered by TETSUO\n'));
        break;

      case '/exit':
      case '/quit':
      case '/q!':
        running = false;
        console.log(chalk.hex('#14F195')('\n  Goodbye! Stay private. 🛡️\n'));
        break;

      case '':
        break;

      default:
        console.log(chalk.red('  [ERROR] Unknown command. Type /help for available commands.'));
    }
  }

  rl.close();
  process.exit(0);
}

main().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
