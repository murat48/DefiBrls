# Basic Escrow - DeFi Smart Contract Suite

[![Clarity](https://img.shields.io/badge/Clarity-v3.0-blue)](https://clarity-lang.org/)
[![Stacks](https://img.shields.io/badge/Stacks-Testnet-orange)](https://www.stacks.co/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

A comprehensive DeFi (Decentralized Finance) smart contract suite built on the Stacks blockchain using Clarity, featuring the basic-escrow-v2 contract as the main component. This project includes multiple interconnected contracts that provide various DeFi functionalities including escrow services, token management, savings accounts, and token swapping.

## 🚀 Deployed Contracts on Testnet

All contracts are deployed on Stacks Testnet under the address: `ST13RJ9337F94VV2KWE7FBAYT8KV6KTRDEKHB5W3Y`

- **basic-escrow-v2**: `ST13RJ9337F94VV2KWE7FBAYT8KV6KTRDEKHB5W3Y.basic-escrow-v2` (Main Contract)
- **hello-world-v3**: `ST13RJ9337F94VV2KWE7FBAYT8KV6KTRDEKHB5W3Y.hello-world-v3`
- **defibrls-token-v2**: `ST13RJ9337F94VV2KWE7FBAYT8KV6KTRDEKHB5W3Y.defibrls-token-v2`
- **helper-utils-v2**: `ST13RJ9337F94VV2KWE7FBAYT8KV6KTRDEKHB5W3Y.helper-utils-v2`
- **stx-savings-v2**: `ST13RJ9337F94VV2KWE7FBAYT8KV6KTRDEKHB5W3Y.stx-savings-v2`
- **token-swap-v2**: `ST13RJ9337F94VV2KWE7FBAYT8KV6KTRDEKHB5W3Y.token-swap-v2`
##Contract
https://explorer.hiro.so/address/ST13RJ9337F94VV2KWE7FBAYT8KV6KTRDEKHB5W3Y?chain=testnet

## 📋 Table of Contents

- [Features](#features)
- [Contract Overview](#contract-overview)
- [Installation](#installation)
- [Testing](#testing)
- [Deployment](#deployment)
- [Usage Examples](#usage-examples)
- [Contract Interactions](#contract-interactions)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## ✨ Features

- **🔒 Escrow Services**: Secure multi-party transactions with arbiter support (Main Feature)
- **🪙 Custom Token (DefiBrls)**: SIP-010 compliant token with minting and burning capabilities
- **💰 Savings Accounts**: Interest-bearing STX savings with flexible lock periods
- **🔄 Token Swapping**: Decentralized token exchange with liquidity pools
- **🛠 Utility Functions**: Helper functions for calculations and validations
- **👋 Hello World**: Simple demonstration contract for learning Clarity

## 📄 Contract Overview

### 1. Basic Escrow Contract (`basic-escrow.clar`) - Main Contract
Facilitates secure transactions between parties with optional arbiter.

**Key Features:**
- Multi-party escrow creation
- Buyer and seller confirmations
- Arbiter dispute resolution
- Timeout mechanisms

### 2. Hello World Contract (`hello-world.clar`)
A simple introductory contract demonstrating basic Clarity functions.

**Functions:**
- `say-hi()`: Returns "Hello World" message
- `echo-number(val)`: Echoes back the input number
- `check-it(flag)`: Returns ok(1) or err(u100) based on boolean input

### 3. DefiBrls Token Contract (`defibrls-token.clar`)
A SIP-010 compliant fungible token with extended functionality.

**Key Features:**
- Token minting and burning
- Owner controls and admin functions
- Transfer restrictions and pausing
- Supply management

### 4. Helper Utils Contract (`helper-utils.clar`)
Provides utility functions for other contracts.

**Key Features:**
- Interest calculations
- Validation functions
- Time and block utilities
- Emergency stop functionality

### 5. STX Savings Contract (`stx-savings.clar`)
Interest-bearing savings accounts for STX tokens.

**Key Features:**
- Flexible lock periods
- Interest rate calculations
- Early withdrawal penalties
- Account management

### 6. Token Swap Contract (`token-swap.clar`)
Decentralized exchange for token swapping.

**Key Features:**
- Liquidity pool creation
- Token swapping mechanisms
- LP token management
- Fee collection

## 🛠 Installation

### Prerequisites
- [Clarinet](https://github.com/hirosystems/clarinet) >= 2.0
- [Node.js](https://nodejs.org/) >= 16.0
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

### Setup

1. **Clone the repository:**
```bash
git clone https://github.com/murat48/basic-escrow-v2.git
cd basic-escrow-v2
```

2. **Install dependencies:**
```bash
npm install
```

3. **Verify installation:**
```bash
clarinet --version
```

## 🧪 Testing

### Run all tests:
```bash
npm test
```

### Run specific test file:
```bash
npm test tests/basic-escrow.test.ts
npm test tests/hello-world.test.ts
```

### Run tests with coverage:
```bash
npm run test:coverage
```

### Check contract syntax:
```bash
clarinet check
```

## 🚀 Deployment

### Deploy to Testnet

1. **Configure testnet settings:**
   - Update `settings/Testnet.toml` with your testnet account details
   - Ensure you have testnet STX tokens

2. **Deploy all contracts:**
```bash
clarinet deployments apply --testnet
```

3. **Deploy specific contract:**
```bash
clarinet deployments apply -p deployments/basic-escrow-v2.testnet-plan.yaml
clarinet deployments apply -p deployments/hello-world-v2.testnet-plan.yaml
```

### Deploy to Devnet

1. **Start local devnet:**
```bash
clarinet integrate
```

2. **Deploy contracts:**
```bash
clarinet deployments apply --devnet
```

## 💡 Usage Examples

### Basic Escrow Contract

```clarity
;; Create an escrow transaction
(contract-call? .basic-escrow-v2 create-escrow 
  u1000000  ;; amount in micro-STX
  'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5  ;; seller
  (some 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG))  ;; optional arbiter

;; Buyer confirms transaction
(contract-call? .basic-escrow-v2 confirm-buyer u1)

;; Seller confirms delivery
(contract-call? .basic-escrow-v2 confirm-seller u1)
```

### Hello World Contract

```clarity
;; Call the say-hi function
(contract-call? .hello-world-v3 say-hi)
;; Returns: (ok "Hello World")

;; Echo a number
(contract-call? .hello-world-v3 echo-number 42)
;; Returns: (ok 42)

;; Check with boolean
(contract-call? .hello-world-v3 check-it true)
;; Returns: (ok u1)
```

### DefiBrls Token

```clarity
;; Get token balance
(contract-call? .defibrls-token-v2 get-balance tx-sender)

;; Transfer tokens
(contract-call? .defibrls-token-v2 transfer u1000000 tx-sender 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5 none)
```

### STX Savings

```clarity
;; Create savings account
(contract-call? .stx-savings-v2 create-account u1008) ;; 1 week lock period

;; Deposit STX
(contract-call? .stx-savings-v2 deposit u100000000) ;; 100 STX

;; Check balance
(contract-call? .stx-savings-v2 get-account-balance tx-sender)
```

## 🔗 Contract Interactions

### Using Clarinet Console

```bash
# Start interactive console
clarinet console --testnet

# Example interactions
(contract-call? 'ST13RJ9337F94VV2KWE7FBAYT8KV6KTRDEKHB5W3Y.basic-escrow-v2 get-escrow u1)
(contract-call? 'ST13RJ9337F94VV2KWE7FBAYT8KV6KTRDEKHB5W3Y.hello-world-v3 say-hi)
(contract-call? 'ST13RJ9337F94VV2KWE7FBAYT8KV6KTRDEKHB5W3Y.defibrls-token-v2 get-total-supply)
```

### Frontend Integration

```javascript
import { openContractCall } from '@stacks/connect';

const contractCall = await openContractCall({
  contractAddress: 'ST13RJ9337F94VV2KWE7FBAYT8KV6KTRDEKHB5W3Y',
  contractName: 'basic-escrow-v2',
  functionName: 'get-escrow',
  functionArgs: [uintCV(1)],
  network: 'testnet'
});
```

## 🏗 Development

### Project Structure

```
basic-escrow-v2/
├── contracts/          # Clarity smart contracts
├── tests/             # TypeScript test files
├── deployments/       # Deployment plans
├── settings/          # Network configurations
├── docs/              # Documentation
└── package.json       # Node.js dependencies
```

### Adding New Contracts

1. Create contract file in `contracts/`
2. Add tests in `tests/`
3. Update `Clarinet.toml`
4. Create deployment plan in `deployments/`

### Code Quality

- Follow Clarity best practices
- Write comprehensive tests
- Use proper error handling
- Document all public functions

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Write tests for all new features
- Follow existing code style
- Update documentation as needed
- Ensure all tests pass before submitting

## 📖 Resources

- [Clarity Language Reference](https://docs.stacks.co/clarity/)
- [Stacks Documentation](https://docs.stacks.co/)
- [Clarinet Documentation](https://docs.hiro.so/clarinet/)
- [SIP-010 Token Standard](https://github.com/stacksgov/sips/blob/main/sips/sip-010/sip-010-fungible-token-standard.md)

## 🐛 Known Issues

- Some test cases may fail due to timing dependencies
- Contract interactions require sufficient STX balance for fees
- Testnet deployment costs may vary based on network conditions

## 🔮 Future Enhancements

- [ ] Add governance token functionality
- [ ] Implement yield farming mechanisms
- [ ] Add cross-chain bridge support
- [ ] Enhance UI/UX for better user experience
- [ ] Add more comprehensive analytics

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

For questions and support:
- Create an issue on GitHub
- Join the [Stacks Discord](https://discord.gg/stacks)
- Check the [Stacks Forum](https://forum.stacks.org/)

---

**Made with ❤️ for the Stacks ecosystem**

To add a new contract, use [Clarinet](https://docs.hiro.so/stacks/clarinet).

## Test your Contract

- You can manually test your your contracts in the [Clarinet console](https://docs.hiro.so/clarinet/how-to-guides/how-to-test-contract#load-contracts-in-a-console).
- You can programmatically test your contracts with [unit tests](https://docs.hiro.so/clarinet/how-to-guides/how-to-test-contract).
