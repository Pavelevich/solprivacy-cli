# SolPrivacy

[![npm version](https://img.shields.io/npm/v/solprivacy.svg?style=flat-square&color=14F195)](https://www.npmjs.com/package/solprivacy)
[![npm downloads](https://img.shields.io/npm/dm/solprivacy.svg?style=flat-square&color=9945FF)](https://www.npmjs.com/package/solprivacy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

**The most comprehensive privacy analysis tool for Solana wallets.**

Analyze, protect, and improve your on-chain privacy with AI-powered recommendations.

🌐 [solprivacy.xyz](https://solprivacy.xyz) • 📦 [npm](https://www.npmjs.com/package/solprivacy) • 💻 [GitHub](https://github.com/Pavelevich/solprivacy-cli)

---

## Installation

```bash
npm install -g solprivacy
```

## Quick Start

```bash
# Run the CLI
solprivacy

# Configure Helius API key (free at helius.dev)
# Type: /helius

# Analyze any wallet - just paste the address
# Example: 5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9
```

---

## Why SolPrivacy?

Your Solana wallet activity is **public by default**. Every transaction can be:

- 🔍 **Traced** - Identity linked via exchange records
- 📊 **Clustered** - All your wallets linked together
- 🎯 **Targeted** - Dust attacks track your movements
- ⏰ **Analyzed** - Timezone and habits revealed

---

## Features

### 🔬 Privacy Analysis
- **Privacy Score** (0-100) with letter grade
- **Entropy Analysis** - Transaction randomness measurement
- **K-Anonymity** - Size of your anonymity set
- **Cluster Detection** - Find linked addresses
- **Dust Attack Detection** - Identify tracking attempts
- **KYC Exposure** - Exchange linkage risk assessment

### 🤖 AI Agent
- **Multi-provider**: OpenAI, Claude, xAI Grok, Groq, Ollama
- **ReAct Architecture** - Intelligent reasoning loop
- **8 Specialized Tools** - Comprehensive analysis
- **Conversation Memory** - Context-aware follow-ups

### 🛡️ Attack Simulations
- Dust Attack simulation
- Cluster Analysis simulation
- Temporal Analysis simulation
- Exchange Correlation simulation

### 📈 Actionable Insights
- Prioritized recommendations
- Direct links to privacy tools
- Score projections after improvements
- Historical tracking

---

## Commands

| Command | Description |
|---------|-------------|
| `/analyze` | Full privacy analysis |
| `/quick` | Quick score lookup |
| `/compare` | Compare two wallets |
| `/attack-sim` | Simulate attacks |
| `/agent` | AI privacy assistant |
| `/config-llm` | Configure AI provider |
| `/history` | Past analyses |
| `/export` | HTML report |
| `/batch` | Analyze multiple wallets |
| `/watch` | Real-time monitoring |
| `/trace` | Taint analysis |
| `/help` | All commands |

---

## AI Agent

Configure your preferred AI provider:

```bash
solprivacy
# Type: /config-llm
```

**Supported Providers:**
- **xAI** - grok-3, grok-3-fast ([console.x.ai](https://console.x.ai))
- **OpenAI** - gpt-4o, gpt-4o-mini ([platform.openai.com](https://platform.openai.com))
- **Anthropic** - claude-3-5-sonnet ([console.anthropic.com](https://console.anthropic.com))
- **Groq** - llama-3.1-70b ([console.groq.com](https://console.groq.com))
- **Ollama** - Any local model (no key needed)

**Agent Tools:**
- `analyzeWallet` - Privacy score and issues
- `projectScore` - Score after improvements
- `getPrivacyTools` - Links to privacy tools
- `explainMetric` - Explain metrics
- `getWalletHistory` - Analysis history
- `listAnalyzedWallets` - All analyzed wallets
- `compareWallets` - Compare two wallets
- `simulateAttack` - Attack simulations

---

## Privacy Metrics

| Metric | What it measures |
|--------|------------------|
| **Entropy** | Transaction randomness (0-1, higher = better) |
| **K-Anonymity** | Anonymity set size (higher = harder to identify) |
| **Clustering** | Linked addresses (fewer = better) |
| **KYC Exposure** | Exchange interactions (lower = better) |
| **Dust Attacks** | Tracking attempts detected |
| **Temporal Patterns** | Transaction timing regularity |

---

## Privacy Tools

SolPrivacy recommends these tools:

| Tool | Use Case |
|------|----------|
| [Light Protocol](https://shield.lightprotocol.com) | ZK shielded transactions |
| [Jupiter](https://jup.ag) | DEX swaps (no KYC) |
| [Raydium](https://raydium.io) | AMM trading |
| [Wormhole](https://wormhole.com) | Cross-chain bridging |

---

## Configuration

**Environment Variables:**
```bash
export HELIUS_API_KEY=your_key      # Required
export XAI_API_KEY=your_key         # For xAI
export OPENAI_API_KEY=your_key      # For OpenAI
export ANTHROPIC_API_KEY=your_key   # For Claude
export GROQ_API_KEY=your_key        # For Groq
```

**Config File:** `~/.solprivacy/config.json`

---

## Tech Stack

- Node.js 16+
- TypeScript
- Vercel AI SDK
- Helius API
- Chalk, Inquirer, Ora

---

## Links

- 🌐 Website: [solprivacy.xyz](https://solprivacy.xyz)
- 📦 npm: [npmjs.com/package/solprivacy](https://www.npmjs.com/package/solprivacy)
- 💻 GitHub: [github.com/Pavelevich/solprivacy-cli](https://github.com/Pavelevich/solprivacy-cli)
- 🔑 Helius API: [helius.dev](https://helius.dev)

---

## License

MIT © [Pavelevich](https://github.com/Pavelevich)

---

**Powered by [TETSUO](https://tetsuo.xyz)** • Built for the [Solana Privacy Hackathon](https://encrypt.trade)
