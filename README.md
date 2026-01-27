<div align="center">

# SolPrivacy CLI

[![npm version](https://img.shields.io/npm/v/solprivacy.svg?style=for-the-badge&color=14F195&logo=npm&logoColor=white)](https://www.npmjs.com/package/solprivacy)
[![npm downloads](https://img.shields.io/npm/dm/solprivacy.svg?style=for-the-badge&color=9945FF&logo=npm&logoColor=white)](https://www.npmjs.com/package/solprivacy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-16+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)

**AI-Powered Privacy Analysis for Solana Wallets**

*Analyze, protect, and improve your on-chain privacy with intelligent recommendations*

[Website](https://solprivacy.xyz) | [NPM Package](https://www.npmjs.com/package/solprivacy) | [Documentation](#features) | [Report Bug](https://github.com/Pavelevich/solprivacy-cli/issues)

</div>

---

> **Part of the Shadow Tracker Suite**
>
> This CLI is the command-line interface for [**Shadow Tracker**](https://github.com/Pavelevich/shadow-tracker) — a state-of-the-art privacy analyzer for Solana featuring 11 metrics, backed by 10 academic papers, with ~80% attack vector coverage.

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

## The Problem

Your Solana wallet activity is **public by default**. Every transaction reveals:

| Threat | Risk Level | Description |
|--------|------------|-------------|
| **Identity Tracing** | `CRITICAL` | CEX records link your address to real identity |
| **Wallet Clustering** | `HIGH` | Graph analysis connects all your wallets |
| **Dust Attacks** | `HIGH` | Micro-transactions track your movements |
| **Temporal Analysis** | `MEDIUM` | Transaction timing reveals timezone & habits |

---

## Features

<table>
<tr>
<td width="50%">

### Privacy Analysis
- Privacy Score (0-100) with letter grade
- Entropy Analysis - Transaction randomness
- K-Anonymity - Anonymity set size
- Cluster Detection - Find linked addresses
- Dust Attack Detection - Identify tracking
- KYC Exposure - Exchange linkage risk

</td>
<td width="50%">

### AI Agent (v2.0)
- **Multi-provider**: OpenAI, Claude, xAI, Groq, Ollama
- **ReAct Architecture** - Intelligent reasoning
- **8 Specialized Tools** - Deep analysis
- **Memory** - Context-aware conversations

</td>
</tr>
<tr>
<td width="50%">

### Attack Simulations
- Dust Attack simulation
- Cluster Analysis simulation
- Temporal Analysis simulation
- Exchange Correlation simulation

</td>
<td width="50%">

### Actionable Insights
- Prioritized recommendations
- Direct links to privacy tools
- Score projections after fixes
- Historical tracking & trends

</td>
</tr>
</table>

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

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 16+ |
| Language | TypeScript 5.0 |
| AI Framework | Vercel AI SDK |
| Blockchain Data | Helius API |
| CLI Framework | Inquirer, Chalk, Ora |

---

## Related Projects

| Project | Description |
|---------|-------------|
| [**Shadow Tracker**](https://github.com/Pavelevich/shadow-tracker) | Core privacy analysis engine |
| [**solprivacy.xyz**](https://solprivacy.xyz) | Web interface |

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

MIT © [Pavelevich](https://github.com/Pavelevich)

---

<div align="center">

**Powered by [TETSUO](https://tetsuo.xyz)**

Built for the [Solana Privacy Hackathon](https://encrypt.trade)

---

[Website](https://solprivacy.xyz) · [NPM](https://www.npmjs.com/package/solprivacy) · [GitHub](https://github.com/Pavelevich/solprivacy-cli) · [Helius API](https://helius.dev)

</div>
