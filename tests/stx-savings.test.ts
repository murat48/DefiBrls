import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const alice = accounts.get("wallet_1")!;
const bob = accounts.get("wallet_2")!;
const charlie = accounts.get("wallet_3")!;

/*
  STX Savings Account Contract Tests
  Tests the interest-bearing savings contract with deposit and withdrawal functionality
*/

describe("STX Savings Account Contract", () => {
  beforeEach(() => {
    // Reset blockchain state before each test
  });

  describe("Account Creation", () => {
    it("should create savings account successfully", () => {
      const lockPeriod = 1008; // 1 week in blocks

      const createResult = simnet.callPublicFn("stx-savings", "create-account", [Cl.uint(lockPeriod)], alice);
      expect(createResult.result).toBeOk(Cl.bool(true));

      // Check account details
      const accountData = simnet.callReadOnlyFn("stx-savings", "get-account", [Cl.principal(alice)], deployer);
      const account = accountData.result.expectSome().expectTuple();

      expect(account.balance).toBe(Cl.uint(0));
      expect(account["lock-period"]).toBe(Cl.uint(lockPeriod));
      expect(account["total-deposited"]).toBe(Cl.uint(0));
      expect(account["total-interest-earned"]).toBe(Cl.uint(0));
      expect(account["is-locked"]).toBe(Cl.bool(false));
    });

    it("should prevent duplicate account creation", () => {
      const lockPeriod = 1008;

      // Create first account
      simnet.callPublicFn("stx-savings", "create-account", [Cl.uint(lockPeriod)], alice);

      // Try to create second account
      const createResult = simnet.callPublicFn("stx-savings", "create-account", [Cl.uint(lockPeriod)], alice);
      expect(createResult.result).toBeErr(Cl.uint(4003)); // Account exists
    });

    it("should validate lock period requirements", () => {
      // Test minimum lock period
      const tooShort = 100; // Less than 144 blocks minimum
      const createResult1 = simnet.callPublicFn("stx-savings", "create-account", [Cl.uint(tooShort)], alice);
      expect(createResult1.result).toBeErr(Cl.uint(4004)); // Invalid amount

      // Test maximum lock period
      const tooLong = 60000; // More than 52560 blocks maximum
      const createResult2 = simnet.callPublicFn("stx-savings", "create-account", [Cl.uint(tooLong)], alice);
      expect(createResult2.result).toBeErr(Cl.uint(4004)); // Invalid amount
    });

    it("should update total accounts counter", () => {
      const initialStats = simnet.callReadOnlyFn("stx-savings", "get-contract-stats", [], deployer);
      const initialCount = initialStats.result.expectTuple()["total-accounts"].expectUint();

      simnet.callPublicFn("stx-savings", "create-account", [Cl.uint(1008)], alice);
      simnet.callPublicFn("stx-savings", "create-account", [Cl.uint(1008)], bob);

      const finalStats = simnet.callReadOnlyFn("stx-savings", "get-contract-stats", [], deployer);
      const finalCount = finalStats.result.expectTuple()["total-accounts"].expectUint();

      expect(finalCount).toBe(initialCount + 2);
    });
  });

  describe("Deposits", () => {
    beforeEach(() => {
      simnet.callPublicFn("stx-savings", "create-account", [Cl.uint(1008)], alice);
    });

    it("should accept valid deposits", () => {
      const depositAmount = 5000000; // 0.05 STX

      const depositResult = simnet.callPublicFn("stx-savings", "deposit", [Cl.uint(depositAmount)], alice);
      expect(depositResult.result).toBeOk(Cl.uint(depositAmount));

      // Check account balance
      const balance = simnet.callReadOnlyFn("stx-savings", "get-account-balance", [Cl.principal(alice)], deployer);
      expect(balance.result).toBe(Cl.uint(depositAmount));

      // Check account is now locked
      const accountData = simnet.callReadOnlyFn("stx-savings", "get-account", [Cl.principal(alice)], deployer);
      const account = accountData.result.expectSome().expectTuple();
      expect(account["is-locked"]).toBe(Cl.bool(true));
      expect(account["total-deposited"]).toBe(Cl.uint(depositAmount));
    });

    it("should reject deposits below minimum", () => {
      const tooSmall = 500000; // Less than 1000000 minimum

      const depositResult = simnet.callPublicFn("stx-savings", "deposit", [Cl.uint(tooSmall)], alice);
      expect(depositResult.result).toBeErr(Cl.uint(4004)); // Invalid amount
    });

    it("should allow multiple deposits", () => {
      const firstDeposit = 5000000;
      const secondDeposit = 3000000;

      simnet.callPublicFn("stx-savings", "deposit", [Cl.uint(firstDeposit)], alice);
      const secondResult = simnet.callPublicFn("stx-savings", "deposit", [Cl.uint(secondDeposit)], alice);

      expect(secondResult.result).toBeOk(Cl.uint(firstDeposit + secondDeposit));

      const balance = simnet.callReadOnlyFn("stx-savings", "get-account-balance", [Cl.principal(alice)], deployer);
      expect(balance.result).toBe(Cl.uint(firstDeposit + secondDeposit));

      const accountData = simnet.callReadOnlyFn("stx-savings", "get-account", [Cl.principal(alice)], deployer);
      const account = accountData.result.expectSome().expectTuple();
      expect(account["total-deposited"]).toBe(Cl.uint(firstDeposit + secondDeposit));
    });

    it("should update contract statistics", () => {
      const depositAmount = 5000000;

      const initialStats = simnet.callReadOnlyFn("stx-savings", "get-contract-stats", [], deployer);
      const initialDeposits = initialStats.result.expectTuple()["total-deposits"].expectUint();

      simnet.callPublicFn("stx-savings", "deposit", [Cl.uint(depositAmount)], alice);

      const finalStats = simnet.callReadOnlyFn("stx-savings", "get-contract-stats", [], deployer);
      const finalDeposits = finalStats.result.expectTuple()["total-deposits"].expectUint();

      expect(finalDeposits).toBe(initialDeposits + depositAmount);
    });
  });

  describe("Interest Calculations", () => {
    beforeEach(() => {
      simnet.callPublicFn("stx-savings", "create-account", [Cl.uint(1008)], alice); // 1 week lock
      simnet.callPublicFn("stx-savings", "deposit", [Cl.uint(100000000)], alice); // 1 STX
    });

    it("should calculate accrued interest over time", () => {
      // Initially no interest
      const initialInterest = simnet.callReadOnlyFn("stx-savings", "get-accrued-interest", [Cl.principal(alice)], deployer);
      expect(initialInterest.result).toBe(Cl.uint(0));

      // Mine some blocks to simulate time passage
      simnet.mineEmptyBlocks(100);

      // Should have some interest now
      const accruedInterest = simnet.callReadOnlyFn("stx-savings", "get-accrued-interest", [Cl.principal(alice)], deployer);
      expect(accruedInterest.result.expectUint()).toBeGreaterThan(0);
    });

    it("should calculate total value including interest", () => {
      simnet.mineEmptyBlocks(100);

      const totalValue = simnet.callReadOnlyFn("stx-savings", "get-total-value", [Cl.principal(alice)], deployer);
      const balance = simnet.callReadOnlyFn("stx-savings", "get-account-balance", [Cl.principal(alice)], deployer);
      const interest = simnet.callReadOnlyFn("stx-savings", "get-accrued-interest", [Cl.principal(alice)], deployer);

      expect(totalValue.result.expectUint()).toBe(
        balance.result.expectUint() + interest.result.expectUint()
      );
    });

    it("should provide higher rates for longer lock periods", () => {
      // Create accounts with different lock periods
      simnet.callPublicFn("stx-savings", "create-account", [Cl.uint(4320)], bob); // 1 month
      simnet.callPublicFn("stx-savings", "deposit", [Cl.uint(100000000)], bob);

      simnet.callPublicFn("stx-savings", "create-account", [Cl.uint(52560)], charlie); // 1 year
      simnet.callPublicFn("stx-savings", "deposit", [Cl.uint(100000000)], charlie);

      // Mine blocks to accrue interest
      simnet.mineEmptyBlocks(1000);

      const aliceInterest = simnet.callReadOnlyFn("stx-savings", "get-accrued-interest", [Cl.principal(alice)], deployer);
      const bobInterest = simnet.callReadOnlyFn("stx-savings", "get-accrued-interest", [Cl.principal(bob)], deployer);
      const charlieInterest = simnet.callReadOnlyFn("stx-savings", "get-accrued-interest", [Cl.principal(charlie)], deployer);

      // Longer lock periods should earn more interest
      expect(bobInterest.result.expectUint()).toBeGreaterThan(aliceInterest.result.expectUint());
      expect(charlieInterest.result.expectUint()).toBeGreaterThan(bobInterest.result.expectUint());
    });
  });

  describe("Interest Claims", () => {
    beforeEach(() => {
      simnet.callPublicFn("stx-savings", "create-account", [Cl.uint(1008)], alice);
      simnet.callPublicFn("stx-savings", "deposit", [Cl.uint(100000000)], alice);
      
      // Add some reserve to contract for interest payments
      simnet.callPublicFn("stx-savings", "add-reserve", [Cl.uint(10000000)], deployer);
      
      simnet.mineEmptyBlocks(1000); // Generate some interest
    });

    it("should allow claiming accrued interest", () => {
      const initialBalance = simnet.getAssetsMap().get(alice)?.STX || 0;
      const accruedInterest = simnet.callReadOnlyFn("stx-savings", "get-accrued-interest", [Cl.principal(alice)], deployer);
      const interestAmount = accruedInterest.result.expectUint();

      const claimResult = simnet.callPublicFn("stx-savings", "claim-interest", [], alice);
      expect(claimResult.result).toBeOk(Cl.uint(interestAmount));

      const finalBalance = simnet.getAssetsMap().get(alice)?.STX || 0;
      expect(finalBalance - initialBalance).toBe(interestAmount);

      // Interest should reset after claim
      const newAccruedInterest = simnet.callReadOnlyFn("stx-savings", "get-accrued-interest", [Cl.principal(alice)], deployer);
      expect(newAccruedInterest.result).toBe(Cl.uint(0));
    });

    it("should update total interest earned", () => {
      const accruedInterest = simnet.callReadOnlyFn("stx-savings", "get-accrued-interest", [Cl.principal(alice)], deployer);
      const interestAmount = accruedInterest.result.expectUint();

      simnet.callPublicFn("stx-savings", "claim-interest", [], alice);

      const accountData = simnet.callReadOnlyFn("stx-savings", "get-account", [Cl.principal(alice)], deployer);
      const account = accountData.result.expectSome().expectTuple();
      expect(account["total-interest-earned"]).toBe(Cl.uint(interestAmount));
    });

    it("should prevent claiming when no interest accrued", () => {
      // Claim all interest first
      simnet.callPublicFn("stx-savings", "claim-interest", [], alice);

      // Try to claim again immediately
      const claimResult = simnet.callPublicFn("stx-savings", "claim-interest", [], alice);
      expect(claimResult.result).toBeErr(Cl.uint(4004)); // Invalid amount
    });
  });

  describe("Withdrawals", () => {
    beforeEach(() => {
      simnet.callPublicFn("stx-savings", "create-account", [Cl.uint(1008)], alice);
      simnet.callPublicFn("stx-savings", "deposit", [Cl.uint(100000000)], alice);
    });

    it("should allow withdrawal after lock period", () => {
      const withdrawAmount = 50000000; // 0.5 STX

      // Mine blocks to exceed lock period
      simnet.mineEmptyBlocks(1200);

      const initialBalance = simnet.getAssetsMap().get(alice)?.STX || 0;

      const withdrawResult = simnet.callPublicFn("stx-savings", "withdraw", [Cl.uint(withdrawAmount)], alice);
      expect(withdrawResult.result).toBeOk(Cl.uint(withdrawAmount));

      const finalBalance = simnet.getAssetsMap().get(alice)?.STX || 0;
      expect(finalBalance - initialBalance).toBe(withdrawAmount);

      // Check updated account balance
      const accountBalance = simnet.callReadOnlyFn("stx-savings", "get-account-balance", [Cl.principal(alice)], deployer);
      expect(accountBalance.result).toBe(Cl.uint(50000000));
    });

    it("should apply early withdrawal penalty", () => {
      const withdrawAmount = 50000000; // 0.5 STX
      const expectedPenalty = Math.floor(withdrawAmount / 10); // 10% penalty
      const expectedReceived = withdrawAmount - expectedPenalty;

      const initialBalance = simnet.getAssetsMap().get(alice)?.STX || 0;

      // Withdraw before lock period ends (early withdrawal)
      const withdrawResult = simnet.callPublicFn("stx-savings", "withdraw", [Cl.uint(withdrawAmount)], alice);
      expect(withdrawResult.result).toBeOk(Cl.uint(expectedReceived));

      const finalBalance = simnet.getAssetsMap().get(alice)?.STX || 0;
      expect(finalBalance - initialBalance).toBe(expectedReceived);
    });

    it("should prevent withdrawal of more than balance", () => {
      const excessiveAmount = 200000000; // More than deposited

      const withdrawResult = simnet.callPublicFn("stx-savings", "withdraw", [Cl.uint(excessiveAmount)], alice);
      expect(withdrawResult.result).toBeErr(Cl.uint(4005)); // Insufficient balance
    });

    it("should update lock status when fully withdrawn", () => {
      // Mine blocks to avoid penalty
      simnet.mineEmptyBlocks(1200);

      // Withdraw full balance
      const withdrawResult = simnet.callPublicFn("stx-savings", "withdraw", [Cl.uint(100000000)], alice);
      expect(withdrawResult.result).toBeOk(Cl.uint(100000000));

      // Account should no longer be locked
      const accountData = simnet.callReadOnlyFn("stx-savings", "get-account", [Cl.principal(alice)], deployer);
      const account = accountData.result.expectSome().expectTuple();
      expect(account["is-locked"]).toBe(Cl.bool(false));
    });
  });

  describe("Account Closure", () => {
    beforeEach(() => {
      simnet.callPublicFn("stx-savings", "create-account", [Cl.uint(1008)], alice);
      simnet.callPublicFn("stx-savings", "deposit", [Cl.uint(100000000)], alice);
      simnet.callPublicFn("stx-savings", "add-reserve", [Cl.uint(10000000)], deployer);
      simnet.mineEmptyBlocks(1000);
    });

    it("should close account and withdraw all funds", () => {
      const initialBalance = simnet.getAssetsMap().get(alice)?.STX || 0;
      const totalValue = simnet.callReadOnlyFn("stx-savings", "get-total-value", [Cl.principal(alice)], deployer);
      const expectedTotal = totalValue.result.expectUint();

      const closeResult = simnet.callPublicFn("stx-savings", "close-account", [], alice);
      expect(closeResult.result).toBeOk(Cl.uint(100000000)); // Principal amount

      // Account should be deleted
      const accountData = simnet.callReadOnlyFn("stx-savings", "get-account", [Cl.principal(alice)], deployer);
      expect(accountData.result).toBeNone();

      // Total accounts should decrease
      const stats = simnet.callReadOnlyFn("stx-savings", "get-contract-stats", [], deployer);
      const totalAccounts = stats.result.expectTuple()["total-accounts"].expectUint();
      expect(totalAccounts).toBe(0);
    });

    it("should handle emergency withdrawal", () => {
      const initialBalance = simnet.getAssetsMap().get(alice)?.STX || 0;

      const emergencyResult = simnet.callPublicFn("stx-savings", "emergency-withdraw", [], alice);
      expect(emergencyResult.result).toBeOk(Cl.uint(100000000)); // Only principal, no interest

      const finalBalance = simnet.getAssetsMap().get(alice)?.STX || 0;
      expect(finalBalance - initialBalance).toBe(100000000);

      // Account should be deleted
      const accountData = simnet.callReadOnlyFn("stx-savings", "get-account", [Cl.principal(alice)], deployer);
      expect(accountData.result).toBeNone();
    });
  });

  describe("Lock Status and Timing", () => {
    beforeEach(() => {
      simnet.callPublicFn("stx-savings", "create-account", [Cl.uint(1008)], alice);
      simnet.callPublicFn("stx-savings", "deposit", [Cl.uint(100000000)], alice);
    });

    it("should correctly report lock status", () => {
      // Should be locked initially
      const isLocked = simnet.callReadOnlyFn("stx-savings", "is-account-locked", [Cl.principal(alice)], deployer);
      expect(isLocked.result).toBe(Cl.bool(true));

      // Should report remaining lock time
      const timeRemaining = simnet.callReadOnlyFn("stx-savings", "get-lock-time-remaining", [Cl.principal(alice)], deployer);
      expect(timeRemaining.result.expectUint()).toBeGreaterThan(0);

      // After lock period ends
      simnet.mineEmptyBlocks(1200);

      const isLockedAfter = simnet.callReadOnlyFn("stx-savings", "is-account-locked", [Cl.principal(alice)], deployer);
      expect(isLockedAfter.result).toBe(Cl.bool(false));

      const timeRemainingAfter = simnet.callReadOnlyFn("stx-savings", "get-lock-time-remaining", [Cl.principal(alice)], deployer);
      expect(timeRemainingAfter.result).toBe(Cl.uint(0));
    });
  });

  describe("Administrative Functions", () => {
    it("should allow owner to pause contract", () => {
      const pauseResult = simnet.callPublicFn("stx-savings", "set-paused", [Cl.bool(true)], deployer);
      expect(pauseResult.result).toBeOk(Cl.bool(true));

      // Try to create account when paused
      const createResult = simnet.callPublicFn("stx-savings", "create-account", [Cl.uint(1008)], alice);
      expect(createResult.result).toBeErr(Cl.uint(4009)); // Contract paused
    });

    it("should allow owner to adjust interest rate", () => {
      const newRate = 8; // 8% annual rate

      const setRateResult = simnet.callPublicFn("stx-savings", "set-base-interest-rate", [Cl.uint(newRate)], deployer);
      expect(setRateResult.result).toBeOk(Cl.uint(newRate));

      const stats = simnet.callReadOnlyFn("stx-savings", "get-contract-stats", [], deployer);
      const currentRate = stats.result.expectTuple()["base-interest-rate"].expectUint();
      expect(currentRate).toBe(newRate);
    });

    it("should prevent excessive interest rates", () => {
      const excessiveRate = 25; // More than 20% maximum

      const setRateResult = simnet.callPublicFn("stx-savings", "set-base-interest-rate", [Cl.uint(excessiveRate)], deployer);
      expect(setRateResult.result).toBeErr(Cl.uint(4010)); // Invalid interest rate
    });

    it("should allow owner to add reserve funds", () => {
      const reserveAmount = 50000000; // 0.5 STX

      const addReserveResult = simnet.callPublicFn("stx-savings", "add-reserve", [Cl.uint(reserveAmount)], deployer);
      expect(addReserveResult.result).toBeOk(Cl.uint(reserveAmount));
    });

    it("should prevent non-owner from administrative actions", () => {
      const pauseResult = simnet.callPublicFn("stx-savings", "set-paused", [Cl.bool(true)], alice);
      expect(pauseResult.result).toBeErr(Cl.uint(4001)); // Unauthorized

      const setRateResult = simnet.callPublicFn("stx-savings", "set-base-interest-rate", [Cl.uint(8)], alice);
      expect(setRateResult.result).toBeErr(Cl.uint(4001)); // Unauthorized

      const addReserveResult = simnet.callPublicFn("stx-savings", "add-reserve", [Cl.uint(1000000)], alice);
      expect(addReserveResult.result).toBeErr(Cl.uint(4001)); // Unauthorized
    });

    it("should allow ownership transfer", () => {
      const transferResult = simnet.callPublicFn("stx-savings", "set-contract-owner", [Cl.principal(alice)], deployer);
      expect(transferResult.result).toBeOk(Cl.principal(alice));

      // Original owner should no longer have admin rights
      const pauseResult = simnet.callPublicFn("stx-savings", "set-paused", [Cl.bool(true)], deployer);
      expect(pauseResult.result).toBeErr(Cl.uint(4001)); // Unauthorized

      // New owner should have admin rights
      const pauseResult2 = simnet.callPublicFn("stx-savings", "set-paused", [Cl.bool(true)], alice);
      expect(pauseResult2.result).toBeOk(Cl.bool(true));
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("should handle zero balance accounts", () => {
      simnet.callPublicFn("stx-savings", "create-account", [Cl.uint(1008)], alice);

      const balance = simnet.callReadOnlyFn("stx-savings", "get-account-balance", [Cl.principal(alice)], deployer);
      expect(balance.result).toBe(Cl.uint(0));

      const interest = simnet.callReadOnlyFn("stx-savings", "get-accrued-interest", [Cl.principal(alice)], deployer);
      expect(interest.result).toBe(Cl.uint(0));

      const totalValue = simnet.callReadOnlyFn("stx-savings", "get-total-value", [Cl.principal(alice)], deployer);
      expect(totalValue.result).toBe(Cl.uint(0));
    });

    it("should handle non-existent accounts", () => {
      const balance = simnet.callReadOnlyFn("stx-savings", "get-account-balance", [Cl.principal(alice)], deployer);
      expect(balance.result).toBe(Cl.uint(0));

      const interest = simnet.callReadOnlyFn("stx-savings", "get-accrued-interest", [Cl.principal(alice)], deployer);
      expect(interest.result).toBe(Cl.uint(0));

      const isLocked = simnet.callReadOnlyFn("stx-savings", "is-account-locked", [Cl.principal(alice)], deployer);
      expect(isLocked.result).toBe(Cl.bool(false));

      const timeRemaining = simnet.callReadOnlyFn("stx-savings", "get-lock-time-remaining", [Cl.principal(alice)], deployer);
      expect(timeRemaining.result).toBe(Cl.uint(0));
    });

    it("should prevent operations on non-existent accounts", () => {
      const depositResult = simnet.callPublicFn("stx-savings", "deposit", [Cl.uint(1000000)], alice);
      expect(depositResult.result).toBeErr(Cl.uint(4002)); // Account not found

      const withdrawResult = simnet.callPublicFn("stx-savings", "withdraw", [Cl.uint(1000000)], alice);
      expect(withdrawResult.result).toBeErr(Cl.uint(4002)); // Account not found

      const claimResult = simnet.callPublicFn("stx-savings", "claim-interest", [], alice);
      expect(claimResult.result).toBeErr(Cl.uint(4002)); // Account not found
    });
  });
});
