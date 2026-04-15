# SecureFlow (PayFi) — HashKey Chain Escrow Infrastructure

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solidity](https://img.shields.io/badge/Solidity-^0.8.19-blue)](https://soliditylang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![HashKey](https://img.shields.io/badge/Built%20on-HashKey%20Chain-111827)](https://docs.hashkeychain.net/)

> **Hackathon-ready PayFi** escrow + milestones + dispute resolution on HashKey Chain

## 🚀 Overview

SecureFlow is a decentralized **PayFi escrow protocol + app** for milestone-based payments. It supports ERC20/native payments, admin/arbiter token whitelisting, multi-arbiter dispute resolution, and an operator-friendly admin panel — deployed on **HashKey Chain**.

**Latest Testnet Deployment (HashKey Chain Testnet, chainId 133)**:

- **SecureFlowPayFi**: `0x2b8Cb611f8EADcfBbfDa69e4d481A597e7b9dF9a`
- **MockERC20 (MTK)**: `0x54290C255108E547877C630cC55b23a2A62a2dAF`
- **Explorer**: `https://testnet-explorer.hsk.xyz/address/0x2b8Cb611f8EADcfBbfDa69e4d481A597e7b9dF9a`

## ✨ Key Features

### 🏗️ Core Platform

- **PayFi Escrow + Milestones**: Create escrow, submit/approve/reject/dispute milestones
- **Multi-Arbiter Consensus**: 1-5 arbiters with quorum-based voting
- **Token Whitelisting**: Only admin/arbiter-approved ERC20 tokens can be used
- **Native + ERC20 Support**: pay in native HSK or whitelisted ERC20 tokens

### 🔐 Identity & Security

- **Reentrancy Protection**: All external functions protected
- **Emergency Controls**: Admin pause and refund mechanisms

### 🎯 Advanced Features

- **Milestone Management**: Submit, approve, reject, dispute milestones with feedback
- **Dispute Resolution**: Time-limited dispute windows with arbiter consensus
- **Real-time Notifications**: In-app notification system

### 💰 Payment Tokens

- **HSK**: Native HashKey Chain currency
- **MockERC20 (MTK)**: deployed automatically on testnet for demos
- **HashKey mainnet tokens** (official docs):
  - **USDT**: `0xf1b50ed67a9e2cc94ad3c477779e2d4cbfff9029`
  - **USDC**: `0x054ed45810DbBAb8B27668922D110669c9D88D0a`

## 📁 Project Structure

```
secureflow-celo/
├── contracts/
│   ├── SecureFlowPayFi.sol     # Size-optimized PayFi escrow contract
│   ├── modules/                # Modular contract components
│   │   ├── EscrowCore.sol
│   │   └── ...
│   └── interfaces/
│       └── ISecureFlow.sol
├── frontend/                   # Next.js 15 application
│   ├── app/                    # App router pages
│   ├── components/             # UI components
│   │   ├── self/              # Self Protocol components
│   │   └── ...
│   ├── contexts/              # React contexts
│   ├── hooks/                 # Custom hooks
│   └── lib/                   # Utilities and configs
├── scripts/
│   ├── deploy.js              # Contract deployment
│   ├── whitelist-token.js
│   └── ...
├── deployed.json              # Deployment information
└── README.md                  # This file
```

## 🚀 Quick Start

### Prerequisites

- **Node.js**: LTS recommended (Hardhat warns on Node 25)
- **MetaMask** or compatible wallet
- **HashKey Chain Testnet** access (for hackathon demo)

### Installation

1. **Clone and install dependencies**

```bash
git clone <repository-url>
cd secureflow-celo
npm install
cd frontend
npm install
```

2. **Environment setup**

Create `.env` in root:
```env
PRIVATE_KEY=your_private_key_here
HASHKEY_RPC_URL=https://mainnet.hsk.xyz
HASHKEY_TESTNET_RPC_URL=https://testnet.hsk.xyz
```

Create `frontend/.env.local`:
```env
NEXT_PUBLIC_SECUREFLOW_ESCROW=0x2b8Cb611f8EADcfBbfDa69e4d481A597e7b9dF9a
NEXT_PUBLIC_MOCK_ERC20=0x54290C255108E547877C630cC55b23a2A62a2dAF
NEXT_PUBLIC_REOWN_ID=your_reown_project_id
```

3. **Start development server**

```bash
cd frontend
npm run dev
```

Visit `http://localhost:3000`

## 📦 Contract Deployment

### Deploy to HashKey Chain Testnet (recommended for hackathon)

```bash
# Deploy SecureFlowPayFi + MockERC20, and whitelist the MockERC20
cd secureflow-celo
./node_modules/.bin/hardhat run scripts/deploy.js --network hashkeyTestnet
```

## 🔧 Configuration

### Supported Networks

- **HashKey Chain Mainnet** (Chain ID: 177)
  - RPC: `https://mainnet.hsk.xyz`
  - Explorer: `https://hashkey.blockscout.com`
- **HashKey Chain Testnet** (Chain ID: 133)
  - RPC: `https://testnet.hsk.xyz`
  - Explorer: `https://testnet-explorer.hsk.xyz`

### Whitelisted Tokens

- **HSK**: Native token (always supported as `address(0)`)
- **MockERC20 (MTK)**: auto-deployed + auto-whitelisted on testnet deploy

### Adding New Tokens

Admin can whitelist additional ERC20 tokens via:
- Admin dashboard (`/admin`)
- Or deployment script: `scripts/whitelist-token.js`

## 🎨 Features in Detail

### Smart Accounts

- **Gasless Transactions**: Transactions sponsored via Paymaster
- **Delegated Execution**: Users can delegate transaction execution
- **Enhanced Security**: Smart account abstraction for better UX

## 🌐 Production Deployment

### Vercel Deployment

1. **Push to GitHub**

```bash
git add .
git commit -m "Production ready"
git push origin main
```

2. **Connect to Vercel**

- Go to https://vercel.com
- Import your GitHub repository
- Add environment variables (see `VERCEL_SETUP.md`)

3. **Required Environment Variables**

**Server-side:**
- `CELO_RPC_URL`: Celo RPC endpoint
- `CELOSCAN_API_KEY`: Celoscan API key

**Client-side (NEXT_PUBLIC_*):**
- `NEXT_PUBLIC_SECUREFLOW_ESCROW`: Contract address
- `NEXT_PUBLIC_CUSD_ADDRESS`: cUSD token address
- `NEXT_PUBLIC_REOWN_ID`: Reown (WalletConnect) project ID
- `NEXT_PUBLIC_CELO_RPC_URL`: Celo RPC endpoint

4. **Deploy**

Vercel will automatically deploy on push to main branch.

### Post-Deployment Checklist

- [ ] Verify contract addresses are correct
- [ ] Test wallet connection
- [ ] Test escrow creation
- [ ] Test payment flows
- [ ] Verify Self Protocol works (requires HTTPS)
- [ ] Check GoodDollar token whitelisting
- [ ] Test on mobile devices
- [ ] Verify all environment variables set

## 🛡️ Security

### Smart Contract Security

- **Audited**: Following OpenZeppelin security best practices
- **Reentrancy Protection**: All external functions protected
- **Access Control**: Role-based permissions (Owner, Arbiters)
- **Input Validation**: Comprehensive parameter checking
- **Emergency Controls**: Pause functionality for emergencies

### Frontend Security

- **HTTPS Required**: For Self Protocol and production
- **Wallet Connection**: Secure via Reown/WalletConnect
- **Input Sanitization**: All user inputs validated
- **Error Handling**: Graceful error handling throughout

## 📚 Documentation

- **[Self Protocol Integration](SELF_PROTOCOL_INTEGRATION.md)**: Complete Self Protocol guide
- **[Vercel Setup](VERCEL_SETUP.md)**: Production deployment guide

## 🧪 Testing

### Local Testing

**Note**: Self Protocol doesn't work on localhost. For testing:

1. **Use ngrok** (quick):
```bash
npm install -g ngrok
ngrok http 3000
# Use the https://xxx.ngrok.io URL
```

2. **Deploy to Vercel** (recommended):
- Every push creates a preview deployment
- Perfect for testing Self Protocol

### Contract Testing

```bash
# Run tests
npx hardhat test

# Verify contracts
npx hardhat run scripts/verify-contracts.js --network hashkeyTestnet
```

## 🛠️ Development

### Available Scripts

**Root:**
```bash
npm install           # Install dependencies
npm run compile       # Compile contracts
npm test             # Run tests
```

**Frontend:**
```bash
cd frontend
npm install          # Install dependencies
npm run dev          # Start dev server
npm run build        # Build for production
npm start            # Start production server
```

### Project Structure

- **Contracts**: Solidity smart contracts in `contracts/`
- **Frontend**: Next.js app in `frontend/`
- **Scripts**: Deployment and utility scripts in `scripts/`

## 📊 Contract Information

### Main Contract

- **Address**: `0x2b8Cb611f8EADcfBbfDa69e4d481A597e7b9dF9a`
- **Network**: HashKey Chain Testnet
- **Explorer**: `https://testnet-explorer.hsk.xyz/address/0x2b8Cb611f8EADcfBbfDa69e4d481A597e7b9dF9a#code`
- **Version**: 1.0.0

### Features

- ✅ Modular architecture
- ✅ Multi-arbiter consensus
- ✅ Enterprise security
- ✅ Native & ERC20 support
- ✅ Token whitelisting

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

- **GitHub Issues**: Report bugs and request features
- **Documentation**: See project docs for detailed guides
- **Contract Explorer**: [Celoscan](https://celoscan.io/address/0x067FDA1ED957BB352679cbc840Ce6329E470fd07)

## 🙏 Acknowledgments

- **HashKey Chain**: For the EVM infrastructure
- **OpenZeppelin**: For secure smart contract libraries
- **Reown/WalletConnect**: For wallet connection infrastructure

---

**Built with ❤️ for the decentralized future of work**

_SecureFlow - Where trust meets technology_

**Version**: 1.0.0 | **Status**: Production Ready ✅
