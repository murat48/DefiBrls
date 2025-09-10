# DefiBrls Deployment Guide

## Overview

This guide covers the deployment process for the DefiBrls DeFi platform contracts on Stacks blockchain networks.

## Prerequisites

### Required Tools
- **Clarinet**: Latest version of Clarinet CLI
- **Node.js**: Version 16 or higher
- **Stacks CLI**: For mainnet deployments
- **Git**: For version control

### Required Accounts
- **Testnet STX**: For testnet deployments
- **Mainnet STX**: For mainnet deployments (ensure sufficient balance)
- **Hardware Wallet**: Recommended for mainnet deployments

## Network Configurations

### Testnet Configuration
```yaml
network: testnet
stacks-node: "https://stacks-node-api.testnet.stacks.co"
bitcoin-node: "http://blockstack:blockstacksystem@bitcoind.testnet.stacks.co:18332"
```

### Mainnet Configuration
```yaml
network: mainnet
stacks-node: "https://stacks-node-api.mainnet.stacks.co"
bitcoin-node: "http://blockstack:blockstacksystem@bitcoind.mainnet.stacks.co:8332"
```

## Pre-Deployment Checklist

### 1. Code Verification
- [ ] All contracts compile without errors
- [ ] All tests pass successfully
- [ ] Security audit completed
- [ ] Code review completed
- [ ] Gas cost analysis completed

### 2. Configuration Review
- [ ] Contract addresses updated
- [ ] Network configurations verified
- [ ] Deployment sequences confirmed
- [ ] Admin addresses configured
- [ ] Emergency procedures documented

### 3. Testing Verification
- [ ] Unit tests: 100% pass rate
- [ ] Integration tests: 100% pass rate
- [ ] Stress tests: Completed
- [ ] Edge case tests: Completed
- [ ] Gas optimization: Verified

## Deployment Process

### Step 1: Environment Setup

```bash
# Clone the repository
git clone https://github.com/your-org/defibrls
cd defibrls

# Install dependencies
npm install

# Verify Clarinet installation
clarinet --version
```

### Step 2: Contract Compilation and Testing

```bash
# Check all contracts
clarinet check

# Run comprehensive tests
npm test

# Run tests with coverage
npm run test:reports
```

### Step 3: Testnet Deployment

#### Deploy to Testnet
```bash
# Deploy contracts to testnet
clarinet deployments apply --devnet

# Verify deployment
clarinet console --testnet
```

#### Testnet Deployment Sequence
The contracts deploy in the following order:

1. **helper-utils** (Base utilities)
2. **defibrls-token** (SIP-010 token)
3. **basic-escrow** (Escrow system)
4. **stx-savings** (Savings accounts)
5. **token-swap** (AMM/DEX)

#### Expected Deployment Costs (Testnet)
- Helper Utils: ~1,000 μSTX
- DefiBrls Token: ~2,000 μSTX
- Basic Escrow: ~1,500 μSTX
- STX Savings: ~2,500 μSTX
- Token Swap: ~3,000 μSTX
- **Total**: ~10,000 μSTX

### Step 4: Testnet Verification

```bash
# Test basic token functionality
clarinet console --testnet
>> (contract-call? .defibrls-token get-name)
>> (contract-call? .defibrls-token get-total-supply)

# Test escrow creation
>> (contract-call? .basic-escrow create-escrow 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG 'ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC u1000000 u1008 "Test escrow")

# Test savings account
>> (contract-call? .stx-savings create-account u1008)
```

### Step 5: Mainnet Deployment

#### Pre-Mainnet Checklist
- [ ] Testnet deployment successful
- [ ] All functionality verified on testnet
- [ ] Security audit report available
- [ ] Mainnet STX balance sufficient
- [ ] Hardware wallet ready (if using)
- [ ] Emergency contacts notified

#### Deploy to Mainnet
```bash
# Switch to mainnet configuration
# Update deployments/default.mainnet-plan.yaml with correct addresses

# Deploy to mainnet
clarinet deployments apply --mainnet

# Monitor deployment progress
# Use block explorer to verify each contract deployment
```

#### Expected Deployment Costs (Mainnet)
- Helper Utils: ~0.001 STX
- DefiBrls Token: ~0.002 STX
- Basic Escrow: ~0.0015 STX
- STX Savings: ~0.0025 STX
- Token Swap: ~0.003 STX
- **Total**: ~0.01 STX + network fees

### Step 6: Post-Deployment Verification

#### Contract Verification
```bash
# Verify all contracts are deployed
stacks-cli info

# Check contract details
stacks-cli contract-call [CONTRACT_ADDRESS] get-name

# Verify token supply
stacks-cli contract-call [TOKEN_ADDRESS] get-total-supply
```

#### Functional Testing
1. **Token Contract**:
   - Verify total supply
   - Test transfer functionality
   - Check admin functions

2. **Escrow Contract**:
   - Create test escrow
   - Verify escrow states
   - Test timeout functionality

3. **Savings Contract**:
   - Create savings account
   - Test deposit/withdrawal
   - Verify interest calculations

4. **Swap Contract**:
   - Create liquidity pool
   - Test swap functionality
   - Verify fee calculations

## Contract Initialization

### Token Contract Initialization
The token contract auto-initializes with:
- 1 billion DBRL tokens minted to deployer
- Minting enabled
- Burning enabled
- No blacklisted addresses

### Savings Contract Initialization
Initialize with interest rate tiers:
```clarity
;; Interest rate tiers are pre-configured in contract
;; 1 day: +0%, 1 week: +1%, 1 month: +3%
;; 3 months: +6%, 6 months: +10%, 1 year: +15%
```

### Escrow Contract Initialization
- Default timeout: 1 week (1008 blocks)
- Escrow fee: 2.5%
- Minimum escrow: 0.01 STX

### Swap Contract Initialization
- Trading fee: 0.3%
- Protocol fee: 10% of trading fees
- Minimum liquidity: 1000 LP tokens

## Environment-Specific Configurations

### Development Environment
```toml
[repl.analysis]
passes = ["check_checker"]

[repl.analysis.check_checker]
strict = false
trusted_sender = false
trusted_caller = false
callee_filter = false
```

### Production Environment
```toml
[repl.analysis]
passes = ["check_checker"]

[repl.analysis.check_checker]
strict = true
trusted_sender = true
trusted_caller = true
callee_filter = true
```

## Monitoring and Maintenance

### Health Checks
Create monitoring scripts to check:
- Contract balance levels
- Interest payment reserves
- Pool liquidity levels
- Error rates and failed transactions

### Regular Maintenance
- Monitor contract reserves
- Update interest rates if needed
- Handle emergency situations
- Perform security updates

### Emergency Procedures

#### Contract Pause Procedure
```bash
# Pause all contracts in emergency
clarinet console --mainnet
>> (contract-call? .defibrls-token toggle-minting)
>> (contract-call? .basic-escrow set-paused true)
>> (contract-call? .stx-savings set-paused true)
>> (contract-call? .token-swap set-paused true)
```

#### Emergency Contact List
- Technical Lead: [Contact Info]
- Security Team: [Contact Info]
- Legal Team: [Contact Info]
- Community Manager: [Contact Info]

## Troubleshooting

### Common Deployment Issues

#### Insufficient Gas
**Problem**: Transaction fails due to insufficient gas
**Solution**: Increase gas limit in deployment config

#### Contract Dependencies
**Problem**: Contract deployment fails due to missing dependencies
**Solution**: Ensure contracts deploy in correct order (see deployment sequence)

#### Network Issues
**Problem**: Connection timeouts or network errors
**Solution**: Verify network endpoints and retry deployment

### Contract Verification Issues

#### Function Call Failures
**Problem**: Contract calls fail after deployment
**Solution**: 
1. Verify contract address
2. Check function signatures
3. Verify caller permissions

#### State Inconsistency
**Problem**: Contract state appears inconsistent
**Solution**:
1. Check transaction history
2. Verify all initialization completed
3. Review error logs

## Security Considerations

### Access Control
- Use hardware wallets for mainnet deployments
- Implement multi-signature for admin functions
- Regular security audits

### Operational Security
- Monitor contract balances
- Set up alerting for unusual activity
- Maintain emergency response procedures

### Code Security
- Regular dependency updates
- Continuous security scanning
- Bug bounty programs

## Rollback Procedures

### Contract Upgrade Strategy
DefiBrls contracts are immutable once deployed. For upgrades:

1. **Deploy new contract versions**
2. **Migrate user funds** (if necessary)
3. **Update frontend** to use new contracts
4. **Deprecate old contracts** gracefully

### Data Migration
- Plan data migration scripts
- Test migration on testnet first
- Communicate with users about migration timeline

## Performance Optimization

### Gas Optimization
- Optimize contract functions for gas efficiency
- Use batch operations where possible
- Monitor gas costs over time

### Network Performance
- Monitor transaction throughput
- Optimize for network conditions
- Plan for network congestion

## Documentation and Communication

### Technical Documentation
- Keep deployment logs
- Document configuration changes
- Maintain version history

### Community Communication
- Announce deployments
- Provide migration guides
- Maintain transparency about issues

## Support and Resources

### Community Support
- Discord/Telegram channels
- GitHub issues
- Developer forums

### Technical Resources
- Stacks documentation
- Clarinet documentation
- Community tutorials

### Professional Services
- Security audit firms
- Stacks development teams
- Legal consultation services
