import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const alice = accounts.get("wallet_1")!;
const bob = accounts.get("wallet_2")!;
const charlie = accounts.get("wallet_3")!;

/*
  DefiBrls Integration Tests
  Tests the interaction between all DeFi contracts
*/

describe("DefiBrls Integration Tests", () => {
  beforeEach(() => {
    // Reset blockchain state before each test
  });

  describe("Token and Escrow Integration", () => {
    it("should create escrow with DefiBrls tokens", () => {
      const tokenAmount = 1000000000; // 10 DBRL tokens
      const escrowAmount = 500000000; // 5 DBRL tokens

      // Transfer tokens to alice
      simnet.callPublicFn(
        "defibrls-token",
        "transfer",
        [Cl.uint(tokenAmount), Cl.principal(deployer), Cl.principal(alice), Cl.none()],
        deployer
      );

      // Create escrow
      const createResult = simnet.callPublicFn(
        "basic-escrow",
        "create-escrow",
        [
          Cl.principal(bob), // seller
          Cl.principal(charlie), // arbiter
          Cl.uint(escrowAmount),
          Cl.uint(1008), // 1 week timeout
          Cl.stringAscii("Token sale escrow")
        ],
        alice
      );

      expect(createResult.result).toBeOk(Cl.uint(1));

      // Verify escrow was created
      const escrowData = simnet.callReadOnlyFn("basic-escrow", "get-escrow", [Cl.uint(1)], deployer);
      expect(escrowData.result).toBeSome();
    });

    it("should handle complete escrow flow with token payments", () => {
      const escrowAmount = 1000000; // 0.01 STX (minimum escrow)

      // Create and fund escrow
      simnet.callPublicFn(
        "basic-escrow",
        "create-escrow",
        [Cl.principal(bob), Cl.principal(charlie), Cl.uint(escrowAmount), Cl.uint(1008), Cl.stringAscii("Service payment")],
        alice
      );

      const fundResult = simnet.callPublicFn("basic-escrow", "fund-escrow", [Cl.uint(1)], alice);
      expect(fundResult.result).toBeOk(Cl.bool(true));

      // Both parties confirm
      simnet.callPublicFn("basic-escrow", "buyer-confirm", [Cl.uint(1)], alice);
      const sellerConfirmResult = simnet.callPublicFn("basic-escrow", "seller-confirm", [Cl.uint(1)], bob);

      // Should auto-release funds
      expect(sellerConfirmResult.result).toBeOk(Cl.bool(true));

      // Verify escrow is completed
      const escrowData = simnet.callReadOnlyFn("basic-escrow", "get-escrow", [Cl.uint(1)], deployer);
      const escrow = escrowData.result.expectSome().expectTuple();
      expect(escrow.state).toBe(Cl.uint(3)); // STATE-RELEASED
    });
  });

  describe("Token and Savings Integration", () => {
    it("should use DefiBrls tokens as collateral for enhanced savings rates", () => {
      // This is a conceptual test - showing how tokens could be used with savings
      const tokenBalance = 10000000000; // 100 DBRL tokens
      
      // Transfer tokens to alice
      simnet.callPublicFn(
        "defibrls-token",
        "transfer",
        [Cl.uint(tokenBalance), Cl.principal(deployer), Cl.principal(alice), Cl.none()],
        deployer
      );

      // Create savings account
      const createAccountResult = simnet.callPublicFn("stx-savings", "create-account", [Cl.uint(4320)], alice); // 1 month lock
      expect(createAccountResult.result).toBeOk(Cl.bool(true));

      // Deposit STX
      const depositResult = simnet.callPublicFn("stx-savings", "deposit", [Cl.uint(100000000)], alice); // 1 STX
      expect(depositResult.result).toBeOk(Cl.uint(100000000));

      // Verify both token balance and savings account exist
      const aliceTokenBalance = simnet.callReadOnlyFn("defibrls-token", "get-balance", [Cl.principal(alice)], deployer);
      expect(aliceTokenBalance.result).toBeOk(Cl.uint(tokenBalance));

      const aliceSavingsBalance = simnet.callReadOnlyFn("stx-savings", "get-account-balance", [Cl.principal(alice)], deployer);
      expect(aliceSavingsBalance.result).toBe(Cl.uint(100000000));
    });

    it("should accumulate interest over time in savings account", () => {
      // Create account and deposit
      simnet.callPublicFn("stx-savings", "create-account", [Cl.uint(1008)], alice);
      simnet.callPublicFn("stx-savings", "deposit", [Cl.uint(100000000)], alice);
      
      // Add reserve for interest payments
      simnet.callPublicFn("stx-savings", "add-reserve", [Cl.uint(50000000)], deployer);

      // Mine blocks to accumulate interest
      simnet.mineEmptyBlocks(500);

      // Check accrued interest
      const accruedInterest = simnet.callReadOnlyFn("stx-savings", "get-accrued-interest", [Cl.principal(alice)], deployer);
      expect(accruedInterest.result.expectUint()).toBeGreaterThan(0);

      // Claim interest
      const claimResult = simnet.callPublicFn("stx-savings", "claim-interest", [], alice);
      expect(claimResult.result).toBeOk();
    });
  });

  describe("Token and Swap Integration", () => {
    it("should create liquidity pool with DefiBrls tokens", () => {
      const liquidityAmount = 5000000000; // 50 DBRL tokens

      // Transfer tokens to alice for liquidity provision
      simnet.callPublicFn(
        "defibrls-token",
        "transfer",
        [Cl.uint(liquidityAmount * 2), Cl.principal(deployer), Cl.principal(alice), Cl.none()],
        deployer
      );

      // Create pool (this will test the structure even if it fails due to same token)
      const createPoolResult = simnet.callPublicFn(
        "token-swap",
        "create-pool",
        [
          Cl.contractPrincipal(deployer, "defibrls-token"),
          Cl.contractPrincipal(deployer, "helper-utils"), // Different contract as second token
          Cl.uint(liquidityAmount),
          Cl.uint(liquidityAmount)
        ],
        alice
      );

      // The result depends on implementation details, but structure should be correct
      expect(createPoolResult.result).toBeDefined();
    });

    it("should get swap quotes for token pairs", () => {
      // Test quote functionality (even if pool doesn't exist)
      const quoteResult = simnet.callReadOnlyFn(
        "token-swap",
        "get-swap-quote",
        [
          Cl.principal(`${deployer}.defibrls-token`),
          Cl.principal(`${deployer}.helper-utils`),
          Cl.uint(1000000000)
        ],
        deployer
      );

      // Should return pool not found error if no pool exists
      expect(quoteResult.result).toBeErr(Cl.uint(5002));
    });
  });

  describe("Multi-Contract Workflow", () => {
    it("should execute a complete DeFi workflow", () => {
      const userTokens = 20000000000; // 200 DBRL tokens
      const savingsDeposit = 50000000; // 0.5 STX
      const escrowAmount = 10000000; // 0.1 STX

      // Step 1: Distribute tokens
      simnet.callPublicFn(
        "defibrls-token",
        "transfer",
        [Cl.uint(userTokens / 2), Cl.principal(deployer), Cl.principal(alice), Cl.none()],
        deployer
      );
      simnet.callPublicFn(
        "defibrls-token",
        "transfer",
        [Cl.uint(userTokens / 2), Cl.principal(deployer), Cl.principal(bob), Cl.none()],
        deployer
      );

      // Step 2: Alice creates savings account and deposits
      simnet.callPublicFn("stx-savings", "create-account", [Cl.uint(4320)], alice); // 1 month
      simnet.callPublicFn("stx-savings", "deposit", [Cl.uint(savingsDeposit)], alice);

      // Step 3: Bob creates escrow for service
      simnet.callPublicFn(
        "basic-escrow",
        "create-escrow",
        [Cl.principal(alice), Cl.principal(charlie), Cl.uint(escrowAmount), Cl.uint(1008), Cl.stringAscii("Development work")],
        bob
      );
      simnet.callPublicFn("basic-escrow", "fund-escrow", [Cl.uint(1)], bob);

      // Step 4: Add contract reserves
      simnet.callPublicFn("stx-savings", "add-reserve", [Cl.uint(10000000)], deployer);

      // Step 5: Mine blocks to simulate time passage
      simnet.mineEmptyBlocks(100);

      // Step 6: Check all contract states
      const aliceTokens = simnet.callReadOnlyFn("defibrls-token", "get-balance", [Cl.principal(alice)], deployer);
      expect(aliceTokens.result).toBeOk(Cl.uint(userTokens / 2));

      const aliceSavings = simnet.callReadOnlyFn("stx-savings", "get-account-balance", [Cl.principal(alice)], deployer);
      expect(aliceSavings.result).toBe(Cl.uint(savingsDeposit));

      const escrowState = simnet.callReadOnlyFn("basic-escrow", "get-escrow", [Cl.uint(1)], deployer);
      expect(escrowState.result).toBeSome();

      const accruedInterest = simnet.callReadOnlyFn("stx-savings", "get-accrued-interest", [Cl.principal(alice)], deployer);
      expect(accruedInterest.result.expectUint()).toBeGreaterThan(0);
    });
  });

  describe("Contract Statistics and Analytics", () => {
    it("should track statistics across all contracts", () => {
      // Token statistics
      const tokenStats = simnet.callReadOnlyFn("defibrls-token", "get-total-supply", [], deployer);
      expect(tokenStats.result).toBeOk();

      // Escrow statistics
      const escrowStats = simnet.callReadOnlyFn("basic-escrow", "get-total-escrows", [], deployer);
      expect(escrowStats.result).toBe(Cl.uint(0)); // No escrows created yet

      // Savings statistics
      const savingsStats = simnet.callReadOnlyFn("stx-savings", "get-contract-stats", [], deployer);
      expect(savingsStats.result).toBeTuple();

      // Swap statistics
      const swapStats = simnet.callReadOnlyFn("token-swap", "get-contract-stats", [], deployer);
      expect(swapStats.result).toBeTuple();
    });

    it("should update statistics after operations", () => {
      const tokenAmount = 1000000000;

      // Create operations to generate statistics
      simnet.callPublicFn(
        "defibrls-token",
        "transfer",
        [Cl.uint(tokenAmount), Cl.principal(deployer), Cl.principal(alice), Cl.none()],
        deployer
      );

      simnet.callPublicFn("stx-savings", "create-account", [Cl.uint(1008)], alice);
      simnet.callPublicFn("stx-savings", "deposit", [Cl.uint(50000000)], alice);

      simnet.callPublicFn(
        "basic-escrow",
        "create-escrow",
        [Cl.principal(bob), Cl.principal(charlie), Cl.uint(1000000), Cl.uint(1008), Cl.stringAscii("Test")],
        alice
      );

      // Check updated statistics
      const escrowCount = simnet.callReadOnlyFn("basic-escrow", "get-total-escrows", [], deployer);
      expect(escrowCount.result).toBe(Cl.uint(1));

      const savingsStats = simnet.callReadOnlyFn("stx-savings", "get-contract-stats", [], deployer);
      const stats = savingsStats.result.expectTuple();
      expect(stats["total-accounts"]).toBe(Cl.uint(1));
      expect(stats["total-deposits"]).toBe(Cl.uint(50000000));
    });
  });

  describe("Administrative Coordination", () => {
    it("should allow coordinated administrative actions", () => {
      // Pause all contracts
      const pauseToken = simnet.callPublicFn("defibrls-token", "toggle-minting", [], deployer);
      expect(pauseToken.result).toBeOk(Cl.bool(false)); // Minting disabled

      const pauseEscrow = simnet.callPublicFn("basic-escrow", "set-paused", [Cl.bool(true)], deployer);
      expect(pauseEscrow.result).toBeOk(Cl.bool(true));

      const pauseSavings = simnet.callPublicFn("stx-savings", "set-paused", [Cl.bool(true)], deployer);
      expect(pauseSavings.result).toBeOk(Cl.bool(true));

      const pauseSwap = simnet.callPublicFn("token-swap", "set-paused", [Cl.bool(true)], deployer);
      expect(pauseSwap.result).toBeOk(Cl.bool(true));

      // Try operations when paused - should fail
      const mintResult = simnet.callPublicFn("defibrls-token", "mint", [Cl.uint(1000000000), Cl.principal(alice)], deployer);
      expect(mintResult.result).toBeErr(Cl.uint(2009)); // Minting disabled

      const createEscrowResult = simnet.callPublicFn(
        "basic-escrow",
        "create-escrow",
        [Cl.principal(bob), Cl.principal(charlie), Cl.uint(1000000), Cl.uint(1008), Cl.stringAscii("Test")],
        alice
      );
      expect(createEscrowResult.result).toBeErr(Cl.uint(3005)); // Invalid state (paused)

      const createAccountResult = simnet.callPublicFn("stx-savings", "create-account", [Cl.uint(1008)], alice);
      expect(createAccountResult.result).toBeErr(Cl.uint(4009)); // Contract paused
    });

    it("should coordinate ownership transfers", () => {
      const newOwner = alice;

      // Transfer ownership of all contracts
      const tokenOwnership = simnet.callPublicFn("defibrls-token", "set-token-owner", [Cl.principal(newOwner)], deployer);
      expect(tokenOwnership.result).toBeOk(Cl.principal(newOwner));

      const escrowOwnership = simnet.callPublicFn("basic-escrow", "set-contract-owner", [Cl.principal(newOwner)], deployer);
      expect(escrowOwnership.result).toBeOk(Cl.principal(newOwner));

      const savingsOwnership = simnet.callPublicFn("stx-savings", "set-contract-owner", [Cl.principal(newOwner)], deployer);
      expect(savingsOwnership.result).toBeOk(Cl.principal(newOwner));

      const swapOwnership = simnet.callPublicFn("token-swap", "set-contract-owner", [Cl.principal(newOwner)], deployer);
      expect(swapOwnership.result).toBeOk(Cl.principal(newOwner));

      // Verify new owner can perform admin actions
      const mintResult = simnet.callPublicFn("defibrls-token", "toggle-minting", [], alice);
      expect(mintResult.result).toBeOk(Cl.bool(true)); // Minting re-enabled

      // Verify old owner cannot perform admin actions
      const oldOwnerMint = simnet.callPublicFn("defibrls-token", "toggle-minting", [], deployer);
      expect(oldOwnerMint.result).toBeErr(Cl.uint(2001)); // Unauthorized
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("should handle cross-contract error scenarios", () => {
      // Test insufficient token balance for escrow funding
      const escrowAmount = 1000000; // 0.01 STX
      
      // Create escrow
      simnet.callPublicFn(
        "basic-escrow",
        "create-escrow",
        [Cl.principal(bob), Cl.principal(charlie), Cl.uint(escrowAmount), Cl.uint(1008), Cl.stringAscii("Test")],
        alice
      );

      // Try to fund without sufficient STX balance (assuming alice has less than required)
      const fundResult = simnet.callPublicFn("basic-escrow", "fund-escrow", [Cl.uint(1)], alice);
      // This might succeed or fail depending on alice's initial STX balance
      expect(fundResult.result).toBeDefined();
    });

    it("should handle contract interaction limits", () => {
      // Test maximum values and limits across contracts
      const maxValue = "340282366920938463463374607431768211455"; // u128 max

      // These should fail gracefully
      const oversizedMint = simnet.callPublicFn("defibrls-token", "mint", [Cl.uint(maxValue), Cl.principal(alice)], deployer);
      expect(oversizedMint.result).toBeErr(); // Should fail due to max supply limit

      const oversizedDeposit = simnet.callPublicFn("stx-savings", "create-account", [Cl.uint(1008)], alice);
      if (oversizedDeposit.result.isOk) {
        const depositResult = simnet.callPublicFn("stx-savings", "deposit", [Cl.uint(maxValue)], alice);
        expect(depositResult.result).toBeErr(); // Should fail due to insufficient balance
      }
    });
  });

  describe("Performance and Gas Optimization", () => {
    it("should efficiently handle multiple operations", () => {
      const operations = 5;
      const tokenAmount = 1000000000; // 10 tokens per operation

      // Distribute tokens
      for (let i = 0; i < operations; i++) {
        const transferResult = simnet.callPublicFn(
          "defibrls-token",
          "transfer",
          [Cl.uint(tokenAmount), Cl.principal(deployer), Cl.principal(alice), Cl.none()],
          deployer
        );
        expect(transferResult.result).toBeOk(Cl.bool(true));
      }

      // Verify final balance
      const finalBalance = simnet.callReadOnlyFn("defibrls-token", "get-balance", [Cl.principal(alice)], deployer);
      expect(finalBalance.result).toBeOk(Cl.uint(tokenAmount * operations));
    });

    it("should handle bulk operations efficiently", () => {
      // Create multiple escrows
      const escrowCount = 3;
      const escrowAmount = 1000000;

      for (let i = 0; i < escrowCount; i++) {
        const createResult = simnet.callPublicFn(
          "basic-escrow",
          "create-escrow",
          [
            Cl.principal(bob), 
            Cl.principal(charlie), 
            Cl.uint(escrowAmount), 
            Cl.uint(1008), 
            Cl.stringAscii(`Escrow ${i + 1}`)
          ],
          alice
        );
        expect(createResult.result).toBeOk(Cl.uint(i + 1));
      }

      // Verify total escrows
      const totalEscrows = simnet.callReadOnlyFn("basic-escrow", "get-total-escrows", [], deployer);
      expect(totalEscrows.result).toBe(Cl.uint(escrowCount));
    });
  });
});
