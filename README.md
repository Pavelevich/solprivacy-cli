# SolPrivacy CLI

<p align="center">
  <img src="https://github.com/user-attachments/assets/9ab8b204-46f4-4799-bd63-5b009a9e2eeb" alt="SolPrivacy CLI" width="700" />
</p>

<p align="center">
  <strong>Solana Wallet Privacy Analyzer</strong><br>
  <em>Powered by TETSUO</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/solprivacy"><img src="https://img.shields.io/npm/v/solprivacy.svg?style=for-the-badge&color=9945FF" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/solprivacy"><img src="https://img.shields.io/npm/dm/solprivacy.svg?style=for-the-badge&color=14F195" alt="npm downloads"></a>
  <a href="https://github.com/Pavelevich/solprivacy-cli/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/solprivacy.svg?style=for-the-badge" alt="license"></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/solprivacy"><strong>📦 View on NPM</strong></a> •
  <a href="https://solprivacy.xyz"><strong>🌐 Web App</strong></a> •
  <a href="https://github.com/Pavelevich/shadow-tracker"><strong>🔧 API Source</strong></a>
</p>

---

## Install

```bash
npm install -g solprivacy
```

Then just run:

```bash
solprivacy
```

---

## What it does

Check how private your Solana wallet actually is. Get a score, see if you're being dusted, find out your exchange exposure.

```
███████╗ ██████╗ ██╗     ██████╗ ██████╗ ██╗██╗   ██╗ █████╗  ██████╗██╗   ██╗
██╔════╝██╔═══██╗██║     ██╔══██╗██╔══██╗██║██║   ██║██╔══██╗██╔════╝╚██╗ ██╔╝
███████╗██║   ██║██║     ██████╔╝██████╔╝██║██║   ██║███████║██║      ╚████╔╝
╚════██║██║   ██║██║     ██╔═══╝ ██╔══██╗██║╚██╗ ██╔╝██╔══██║██║       ╚██╔╝
███████║╚██████╔╝███████╗██║     ██║  ██║██║ ╚████╔╝ ██║  ██║╚██████╗   ██║
╚══════╝ ╚═════╝ ╚══════╝╚═╝     ╚═╝  ╚═╝╚═╝  ╚═══╝  ╚═╝  ╚═╝ ╚═════╝   ╚═╝
```

---

## Commands

| Command | What it does |
|---------|--------------|
| `/analyze` | Full privacy breakdown |
| `/quick` | Just the score |
| `/compare` | Compare two wallets |
| `/history` | Your past scans |
| `/examples` | Test wallets to try |
| `/help` | Show commands |
| `/exit` | Quit |

---

## Example

```
solprivacy> /analyze

  Wallet address: vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg

  [ANALYZING] This may take up to 30 seconds...

══════════════════════════════════════════════════════════════════════
                    PRIVACY ANALYSIS REPORT
══════════════════════════════════════════════════════════════════════

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

  ATTACK DETECTION
  ──────────────────────────────────────────────────────────────────
  ✓ No dust attack activity detected
  ✓ No cross-chain linkability detected

  EXCHANGE EXPOSURE
  ──────────────────────────────────────────────────────────────────
  KYC Exposure:       8.2%
  Traceability Risk:  LOW
```

---

## Metrics

| Metric | You want | Why |
|--------|----------|-----|
| Shannon Entropy | > 0.6 | More random = harder to track |
| Mutual Information | < 0.3 | Less correlation between txs |
| Differential Privacy (ε) | < 3.0 | Lower = better privacy math |
| k-Anonymity | ≥ 50 | Bigger crowd to hide in |
| Clustering Vulnerability | < 30% | Harder to group your addresses |

---

## Config

| Env Variable | Default | Description |
|--------------|---------|-------------|
| `SOLPRIVACY_API_URL` | `https://solprivacy.xyz` | API endpoint |

---

## Part of Shadow Tracker

This CLI is the terminal interface for [Shadow Tracker](https://github.com/Pavelevich/shadow-tracker), a privacy analysis engine built on Helius API with 11 metrics based on 10 academic papers.

---

## Links

- **NPM**: [npmjs.com/package/solprivacy](https://www.npmjs.com/package/solprivacy)
- **Web**: [solprivacy.xyz](https://solprivacy.xyz)
- **API**: [github.com/Pavelevich/shadow-tracker](https://github.com/Pavelevich/shadow-tracker)
- **TETSUO**: [dexscreener.com/solana/tetsuo](https://dexscreener.com/solana/69kdRLyP5DTRkpHraaSZAQbWmAwzF9guKjZfzMXzcbAs)

---

## License

MIT

---

<p align="center">
  <sub>Built with Solana colors: <strong>#9945FF</strong> • <strong>#14F195</strong></sub>
</p>

<p align="center">
  <a href="https://solprivacy.xyz">solprivacy.xyz</a> • Powered by TETSUO 🤖
</p>
