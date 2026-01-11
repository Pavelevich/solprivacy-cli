# SolPrivacy CLI

<p align="center">
  <img src="https://solprivacy.xyz/tetsuo-logo.png" alt="SolPrivacy" width="120" />
</p>

<p align="center">
  <strong>Solana Wallet Privacy Analyzer</strong><br>
  <em>Powered by TETSUO</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/solprivacy"><img src="https://img.shields.io/npm/v/solprivacy.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/solprivacy"><img src="https://img.shields.io/npm/dm/solprivacy.svg" alt="npm downloads"></a>
  <a href="https://github.com/Pavelevich/solprivacy-cli/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/solprivacy.svg" alt="license"></a>
  <a href="https://solprivacy.xyz"><img src="https://img.shields.io/badge/web-solprivacy.xyz-9945FF" alt="website"></a>
</p>

---

## Overview

SolPrivacy is a command-line tool for analyzing the privacy level of Solana wallets. It provides comprehensive privacy metrics, attack detection, and actionable recommendations to improve your on-chain privacy.

### Features

- **Advanced Privacy Score** - Get a 0-100 privacy score with grade (A+ to F)
- **Shannon Entropy Analysis** - Measure transaction pattern randomness
- **Differential Privacy Metrics** - Calculate epsilon values for privacy quantification
- **k-Anonymity Assessment** - Evaluate wallet anonymity within the network
- **Dust Attack Detection** - Identify and analyze dust attack attempts
- **Exchange Fingerprinting** - Detect KYC exposure from exchange interactions
- **Cross-Chain Linkability** - Find bridge usage that could link identities
- **Mixer Detection** - Analyze potential mixer/tumbler usage
- **Network Centrality** - Measure wallet visibility in transaction graph

## Installation

```bash
npm install -g solprivacy
```

## Usage

Start the interactive CLI:

```bash
solprivacy
```

### Commands

| Command | Description |
|---------|-------------|
| `/analyze` | Full privacy analysis of a wallet |
| `/quick` | Quick privacy score check |
| `/compare` | Compare privacy of two wallets |
| `/history` | View your analysis history |
| `/examples` | Show example wallets for testing |
| `/help` | Display available commands |
| `/clear` | Clear the terminal |
| `/exit` | Exit the CLI |

### Example

```
solprivacy> /analyze

  Wallet address: vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg

  [ANALYZING] This may take up to 30 seconds...

══════════════════════════════════════════════════════════════════════
                    PRIVACY ANALYSIS REPORT
══════════════════════════════════════════════════════════════════════

  Wallet: vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg

┌─────────────────────────────────────────────────────────────────────┐
│                         PRIVACY SCORE                               │
│                              72                                     │
│                           Grade: B                                  │
│                        Risk: MEDIUM                                 │
└─────────────────────────────────────────────────────────────────────┘

  PRIVACY METRICS
  ──────────────────────────────────────────────────────────────────
  Shannon Entropy              0.75
  Mutual Information           0.23
  Differential Privacy (ε)     2.15
  k-Anonymity                  67
  Clustering Vulnerability     28.5%
  ...
```

## Privacy Metrics Explained

| Metric | Good Value | Description |
|--------|------------|-------------|
| Shannon Entropy | > 0.6 | Higher = more random transaction patterns |
| Mutual Information | < 0.3 | Lower = less correlation between transactions |
| Differential Privacy (ε) | < 3.0 | Lower = better privacy guarantees |
| k-Anonymity | ≥ 50 | Higher = harder to identify among peers |
| Clustering Vulnerability | < 30% | Lower = harder to cluster with other addresses |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SOLPRIVACY_API_URL` | `https://solprivacy.xyz` | API endpoint URL |

## API

This CLI uses the SolPrivacy API. For direct API access, visit [solprivacy.xyz](https://solprivacy.xyz).

### Rate Limits

- General requests: 100 per 15 minutes
- Analysis requests: 10 per 5 minutes

## Links

- **Website**: [solprivacy.xyz](https://solprivacy.xyz)
- **GitHub**: [github.com/Pavelevich/solprivacy-cli](https://github.com/Pavelevich/solprivacy-cli)
- **Shadow Tracker API**: [github.com/Pavelevich/shadow-tracker](https://github.com/Pavelevich/shadow-tracker)
- **TETSUO on Dexscreener**: [dexscreener.com/solana/tetsuo](https://dexscreener.com/solana/69kdRLyP5DTRkpHraaSZAQbWmAwzF9guKjZfzMXzcbAs)

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Built with Solana colors</strong><br>
  <span style="color: #9945FF">Purple #9945FF</span> • <span style="color: #14F195">Cyan #14F195</span>
</p>

<p align="center">
  <a href="https://solprivacy.xyz">solprivacy.xyz</a> • Powered by TETSUO
</p>
