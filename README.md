# BTCLaunch — Bitcoin L1 IDO Launchpad

> The first IDO launchpad on Bitcoin Layer 1, powered by OPNet smart contracts.

🌐 **Live:** [bitcoin-launchpad-flax.vercel.app](https://bitcoin-launchpad-flax.vercel.app)  
📦 **Contract:** `opt1sqqkm8w9zacez7zualxya0nn8xwjynvxpssdhuklg`  
🔗 **Network:** OPNet Testnet  
🏆 **Submitted:** vibecode.finance Week 2 — The DeFi Signal  

---

## What is BTCLaunch?

BTCLaunch is the first IDO (Initial DEX Offering) launchpad built natively on Bitcoin Layer 1 using OPNet's WASM smart contract infrastructure. No bridges, no wrapped tokens — real Bitcoin L1 DeFi.

Users can participate in token launches, buy allocations, claim tokens after the sale, and request refunds if a project doesn't reach its goal — all trustlessly enforced on-chain.

---

## Features

- **Token Launches** — Deploy and manage IDO campaigns on Bitcoin L1
- **Buy / Claim / Refund** — Full lifecycle management for participants
- **Opie AI Voice Assistant** — Voice-controlled AI built with Groq (Llama 3.3 70B)
- **Live BTC Dashboard** — Real-time price, 7-day chart, Fear & Greed Index
- **News Sidebar** — Live @opnetbtc Twitter feed + AI-generated OPNet news
- **Glassmorphism UI** — Deep purple palette, frosted glass cards, glow effects
- **Milestone Announcements** — On-chain event celebrations
- **TX Modals** — Transaction confirmation with explorer links
- **Countdown Timer** — Live sale countdown
- **Mobile Responsive** — Works on all screen sizes

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contract | AssemblyScript + OPNet WASM Runtime |
| Frontend | Vanilla HTML/CSS/JS |
| AI Assistant | Groq API (Llama 3.3 70B) via Vercel Edge Function |
| Hosting | Vercel |
| Wallet | OP_WALLET |
| Fonts | DM Sans + Inter + JetBrains Mono |

---

## Smart Contract

**Contract Address:** `opt1sqqkm8w9zacez7zualxya0nn8xwjynvxpssdhuklg`

### Methods

| Method | Description |
|--------|-------------|
| `buy(amount)` | Purchase IDO allocation |
| `claim()` | Claim tokens after sale ends |
| `refund()` | Refund if soft cap not reached |
| `getInfo()` | View sale stats |
| `getUserInfo(address)` | View user allocation |

---

## Running Locally

```bash
# Clone the repo
git clone https://github.com/jpromamen/bitcoin-launchpad.git
cd bitcoin-launchpad

# Open in browser
open index.html
```

To run with Opie AI working, deploy to Vercel (the `/api/chat` proxy requires a serverless environment).

---

## Building the Contract

```bash
# Install dependencies
npm install

# Build
npm run build
```

Requires Node.js 18+ and the OPNet toolchain.

---

## Project Structure

```
bitcoin-launchpad/
├── index.html          # Full frontend (single file)
├── api/
│   └── chat.js         # Vercel Edge Function — Groq proxy
├── src/
│   └── launchpad/
│       ├── LaunchpadContract.ts
│       └── index.ts
├── package.json
└── README.md
```

---

## Contest

Built for the **vibecode.finance Week 2 — The DeFi Signal** challenge.  
Tag: `#opnetvibecode`  
Category: DeFi / Launchpad  

---

## License

MIT

---

*Built on Bitcoin Layer 1 · Powered by OPNet · #opnetvibecode*
