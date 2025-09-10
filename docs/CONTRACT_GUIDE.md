# DefiBrls Contract Guide

## Overview

DefiBrls is a comprehensive DeFi platform built on the Stacks blockchain featuring four core smart contracts that work together to provide essential DeFi functionality.

## Contract Architecture

### 1. Helper Utilities Contract (`helper-utils.clar`)

**Purpose**: Provides common utility functions and security features used across all other contracts.

**Key Functions**:
- **Safe Math Operations**: Overflow-protected arithmetic operations
- **Interest Calculations**: Compound interest calculations with precision
- **Validation Functions**: Input validation and security checks
- **Emergency Controls**: Contract pause functionality and ownership management

**Core Features**:
```clarity
;; Safe arithmetic with overflow protection
(safe-add a b)          ;; Addition with overflow check
(safe-sub a b)          ;; Subtraction with underflow check
(safe-mul a b)          ;; Multiplication with overflow check
(safe-div a b)          ;; Division with zero-division check

;; Interest calculations
(calculate-interest principal rate time-seconds)
(calculate-percentage amount percentage)

;; Emergency controls
(set-emergency-stop stop)
(transfer-ownership new-owner)
```

---

### 2. DefiBrls Token Contract (`defibrls-token.clar`)

**Purpose**: SIP-010 compliant fungible token with advanced DeFi features.

**Token Details**:
- **Name**: DefiBrls Token
- **Symbol**: DBRL
- **Decimals**: 8
- **Initial Supply**: 1,000,000,000 DBRL
- **Maximum Supply**: 10,000,000,000 DBRL

**Core Functions**:

#### Standard SIP-010 Functions
```clarity
(transfer amount from to memo)          ;; Transfer tokens
(get-balance who)                       ;; Get token balance
(get-total-supply)                      ;; Get total token supply
(get-name)                             ;; Get token name
(get-symbol)                           ;; Get token symbol
(get-decimals)                         ;; Get decimal places
```

#### Advanced Features
```clarity
;; Minting and burning
(mint amount recipient)                 ;; Mint new tokens (owner only)
(burn amount from)                      ;; Burn tokens

;; Allowance system
(approve spender amount)                ;; Approve spending allowance
(transfer-from amount from to memo)     ;; Transfer from allowance
(get-allowance owner spender)           ;; Check allowance

;; Administrative functions
(set-token-owner new-owner)             ;; Transfer ownership
(toggle-minting)                        ;; Enable/disable minting
(toggle-burning)                        ;; Enable/disable burning
(blacklist-address address blacklist)   ;; Blacklist management
```

**Security Features**:
- Blacklist functionality for regulatory compliance
- Minting/burning toggle controls
- Maximum supply cap enforcement
- Overflow protection in all operations

---

### 3. Basic Escrow Contract (`basic-escrow.clar`)

**Purpose**: Two-party escrow system with arbiter support for secure transactions.

**Escrow Lifecycle**:
1. **Creation**: Buyer creates escrow with seller and arbiter
2. **Funding**: Buyer deposits STX into escrow
3. **Confirmation**: Both parties confirm transaction completion
4. **Release/Refund**: Funds released to seller or refunded to buyer

**Core Functions**:

#### Escrow Management
```clarity
(create-escrow seller arbiter amount timeout description)
(fund-escrow id)                        ;; Buyer funds the escrow
(buyer-confirm id)                      ;; Buyer confirms receipt
(seller-confirm id)                     ;; Seller confirms delivery
```

#### Fund Management
```clarity
(release-funds id)                      ;; Release funds to seller
(refund-escrow id)                      ;; Refund to buyer
(arbiter-decide id release?)            ;; Arbiter makes decision
```

#### Information Queries
```clarity
(get-escrow id)                         ;; Get escrow details
(get-escrow-balance id)                 ;; Get escrow balance
(is-escrow-participant id user)         ;; Check if user is participant
```

**Key Features**:
- **Automatic Release**: Funds released when both parties confirm
- **Timeout Protection**: Built-in timeout mechanisms
- **Fee Structure**: 2.5% fee on escrow amount
- **Arbiter System**: Third-party dispute resolution
- **Multi-state Management**: Tracks escrow through all states

**Escrow States**:
- `STATE-CREATED` (1): Escrow created, awaiting funding
- `STATE-FUNDED` (2): Escrow funded, awaiting completion
- `STATE-RELEASED` (3): Funds released to seller
- `STATE-REFUNDED` (4): Funds refunded to buyer
- `STATE-DISPUTED` (5): Under arbiter review

---

### 4. STX Savings Account Contract (`stx-savings.clar`)

**Purpose**: Interest-bearing savings accounts with lock periods and compound interest.

**Core Functions**:

#### Account Management
```clarity
(create-account lock-period)            ;; Create savings account
(deposit amount)                        ;; Deposit STX
(withdraw amount)                       ;; Withdraw STX
(close-account)                         ;; Close account and withdraw all
(emergency-withdraw)                    ;; Emergency withdrawal (forfeit interest)
```

#### Interest System
```clarity
(claim-interest)                        ;; Claim accrued interest
(get-accrued-interest owner)            ;; Check accrued interest
(get-total-value owner)                 ;; Get principal + interest
```

#### Account Information
```clarity
(get-account owner)                     ;; Get account details
(get-account-balance owner)             ;; Get account balance
(is-account-locked owner)               ;; Check if account is locked
(get-lock-time-remaining owner)         ;; Get remaining lock time
```

**Interest Rate Structure**:
- **Base Rate**: 5% annual interest
- **Lock Period Bonuses**:
  - 1 day: +0% bonus
  - 1 week: +1% bonus
  - 1 month: +3% bonus
  - 3 months: +6% bonus
  - 6 months: +10% bonus
  - 1 year: +15% bonus

**Key Features**:
- **Compound Interest**: Calculated per block with high precision
- **Lock Periods**: Configurable lock periods from 1 day to 1 year
- **Early Withdrawal**: Allowed with 10% penalty
- **Interest Claims**: Separate interest claiming mechanism
- **Contract Reserve**: Admin-managed reserve for interest payments

---

### 5. Token Swap Contract (`token-swap.clar`)

**Purpose**: Automated Market Maker (AMM) for token swapping with liquidity pools.

**Core Functions**:

#### Pool Management
```clarity
(create-pool token-a token-b amount-a amount-b)
(add-liquidity token-a token-b amount-a-desired amount-b-desired amount-a-min amount-b-min)
(remove-liquidity token-a token-b lp-tokens amount-a-min amount-b-min)
```

#### Trading
```clarity
(swap-tokens token-in token-out amount-in amount-out-min)
(get-swap-quote token-in token-out amount-in)
```

#### Information Queries
```clarity
(get-pool token-a token-b)              ;; Get pool information
(get-lp-balance user token-a token-b)   ;; Get LP token balance
(get-contract-stats)                    ;; Get contract statistics
```

**Key Features**:
- **Constant Product Formula**: Uses x * y = k for pricing
- **LP Tokens**: Liquidity providers receive LP tokens
- **Trading Fees**: 0.3% trading fee structure
- **Slippage Protection**: Minimum amount requirements
- **Multiple Pools**: Support for multiple token pairs

**Fee Structure**:
- **Trading Fee**: 0.3% of swap amount
- **Protocol Fee**: Configurable percentage of trading fees
- **LP Rewards**: Fees distributed to liquidity providers

---

## Contract Interactions

### Token and Escrow Integration
- Create escrows for token sales using DefiBrls tokens
- Secure token transactions with escrow protection
- Automated release upon confirmation

### Token and Savings Integration
- Use DefiBrls tokens as collateral for enhanced rates
- Loyalty programs for token holders
- Compound interest on both STX and token holdings

### Token and Swap Integration
- Create liquidity pools with DefiBrls tokens
- Token/STX trading pairs
- Yield farming opportunities for LP providers

### Cross-Contract Analytics
- Unified statistics across all contracts
- Performance metrics and analytics
- Risk management and monitoring

---

## Security Features

### Access Control
- Owner-only administrative functions
- Multi-signature support preparation
- Role-based permissions

### Financial Security
- Overflow protection in all arithmetic
- Maximum supply caps and limits
- Emergency pause functionality
- Blacklist capabilities

### Operational Security
- Input validation on all functions
- State management and consistency
- Timeout and deadline enforcement
- Slippage protection in swaps

---

## Error Handling

All contracts implement comprehensive error handling with specific error codes:

### Helper Utils Errors (1000s)
- `ERR-UNAUTHORIZED` (1001): Access denied
- `ERR-INVALID-AMOUNT` (1002): Invalid amount parameter
- `ERR-INSUFFICIENT-BALANCE` (1003): Insufficient balance
- `ERR-DIVISION-BY-ZERO` (1004): Division by zero
- `ERR-OVERFLOW` (1005): Arithmetic overflow

### Token Errors (2000s)
- `ERR-UNAUTHORIZED` (2001): Access denied
- `ERR-INSUFFICIENT-BALANCE` (2003): Insufficient token balance
- `ERR-MINTING-DISABLED` (2009): Minting is disabled
- `ERR-BURNING-DISABLED` (2010): Burning is disabled

### Escrow Errors (3000s)
- `ERR-ESCROW-NOT-FOUND` (3002): Escrow does not exist
- `ERR-INVALID-STATE` (3005): Invalid escrow state
- `ERR-TIMEOUT-NOT-REACHED` (3009): Timeout period not reached

### Savings Errors (4000s)
- `ERR-ACCOUNT-NOT-FOUND` (4002): Account does not exist
- `ERR-WITHDRAWAL-TOO-EARLY` (4006): Early withdrawal attempted
- `ERR-CONTRACT-PAUSED` (4009): Contract is paused

### Swap Errors (5000s)
- `ERR-POOL-NOT-FOUND` (5002): Pool does not exist
- `ERR-INSUFFICIENT-LIQUIDITY` (5005): Insufficient pool liquidity
- `ERR-SLIPPAGE-EXCEEDED` (5007): Slippage tolerance exceeded

---

## Best Practices

### For Users
1. **Always check allowances** before transfer-from operations
2. **Use slippage protection** in swap operations
3. **Understand lock periods** before creating savings accounts
4. **Verify escrow participants** before funding

### For Developers
1. **Implement proper error handling** for all contract calls
2. **Use events** for off-chain monitoring and analytics
3. **Test edge cases** thoroughly before mainnet deployment
4. **Monitor contract states** and implement proper UI validation

### For Administrators
1. **Regular security audits** of all contracts
2. **Monitor contract balances** and reserves
3. **Implement gradual ownership transfers** when needed
4. **Maintain emergency procedures** for critical situations
