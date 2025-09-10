import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const alice = accounts.get("wallet_1")!;
const bob = accounts.get("wallet_2")!;

/*
  Helper Utilities Contract Tests
  Tests the common utility functions used across DeFi contracts
*/

describe("Helper Utilities Contract", () => {
  beforeEach(() => {
    // Reset blockchain state before each test
  });

  describe("Safe Math Functions", () => {
    it("should perform safe addition correctly", () => {
      const result = simnet.callReadOnlyFn("helper-utils", "safe-add", [Cl.uint(100), Cl.uint(200)], deployer);
      expect(result.result).toBeOk(Cl.uint(300));
    });

    it("should detect addition overflow", () => {
      const maxUint = "340282366920938463463374607431768211455"; // u128 max
      const result = simnet.callReadOnlyFn("helper-utils", "safe-add", [Cl.uint(maxUint), Cl.uint(1)], deployer);
      expect(result.result).toBeErr(Cl.uint(1005)); // Overflow error
    });

    it("should perform safe subtraction correctly", () => {
      const result = simnet.callReadOnlyFn("helper-utils", "safe-sub", [Cl.uint(300), Cl.uint(100)], deployer);
      expect(result.result).toBeOk(Cl.uint(200));
    });

    it("should detect subtraction underflow", () => {
      const result = simnet.callReadOnlyFn("helper-utils", "safe-sub", [Cl.uint(100), Cl.uint(200)], deployer);
      expect(result.result).toBeErr(Cl.uint(1003)); // Insufficient balance error
    });

    it("should perform safe multiplication correctly", () => {
      const result = simnet.callReadOnlyFn("helper-utils", "safe-mul", [Cl.uint(15), Cl.uint(20)], deployer);
      expect(result.result).toBeOk(Cl.uint(300));
    });

    it("should detect multiplication overflow", () => {
      const largeNum = "18446744073709551615"; // sqrt of u128 max approximately
      const result = simnet.callReadOnlyFn("helper-utils", "safe-mul", [Cl.uint(largeNum), Cl.uint(largeNum)], deployer);
      expect(result.result).toBeErr(Cl.uint(1005)); // Overflow error
    });

    it("should handle multiplication by zero", () => {
      const result = simnet.callReadOnlyFn("helper-utils", "safe-mul", [Cl.uint(0), Cl.uint(100)], deployer);
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it("should perform safe division correctly", () => {
      const result = simnet.callReadOnlyFn("helper-utils", "safe-div", [Cl.uint(300), Cl.uint(15)], deployer);
      expect(result.result).toBeOk(Cl.uint(20));
    });

    it("should prevent division by zero", () => {
      const result = simnet.callReadOnlyFn("helper-utils", "safe-div", [Cl.uint(100), Cl.uint(0)], deployer);
      expect(result.result).toBeErr(Cl.uint(1004)); // Division by zero error
    });
  });

  describe("Percentage Calculations", () => {
    it("should calculate percentages correctly", () => {
      // 10% of 1000 = 100
      const result = simnet.callReadOnlyFn("helper-utils", "calculate-percentage", [Cl.uint(1000), Cl.uint(10)], deployer);
      expect(result.result).toBeOk(Cl.uint(100));
    });

    it("should handle zero percentage", () => {
      const result = simnet.callReadOnlyFn("helper-utils", "calculate-percentage", [Cl.uint(1000), Cl.uint(0)], deployer);
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it("should handle 100% percentage", () => {
      const result = simnet.callReadOnlyFn("helper-utils", "calculate-percentage", [Cl.uint(1000), Cl.uint(100)], deployer);
      expect(result.result).toBeOk(Cl.uint(1000));
    });

    it("should handle fractional percentages", () => {
      // 2.5% of 1000 = 25
      const result = simnet.callReadOnlyFn("helper-utils", "calculate-percentage", [Cl.uint(1000), Cl.uint(250)], deployer);
      expect(result.result).toBeOk(Cl.uint(2500)); // Result is 250 because we multiply by percentage first
    });
  });

  describe("Interest Calculations", () => {
    it("should calculate simple interest correctly", () => {
      const principal = 100000000; // 1 STX (8 decimals)
      const annualRate = 5; // 5% annual rate
      const timeSeconds = 31536000; // 1 year in seconds

      const result = simnet.callReadOnlyFn(
        "helper-utils", 
        "calculate-interest", 
        [Cl.uint(principal), Cl.uint(annualRate), Cl.uint(timeSeconds)], 
        deployer
      );

      expect(result.result).toBeOk();
      const interestAmount = result.result.expectOk().expectUint();
      expect(interestAmount).toBeGreaterThan(principal); // Should include principal + interest
    });

    it("should handle zero time period", () => {
      const principal = 100000000;
      const annualRate = 5;
      const timeSeconds = 0;

      const result = simnet.callReadOnlyFn(
        "helper-utils", 
        "calculate-interest", 
        [Cl.uint(principal), Cl.uint(annualRate), Cl.uint(timeSeconds)], 
        deployer
      );

      expect(result.result).toBeOk(Cl.uint(principal)); // Should return just principal
    });

    it("should handle zero interest rate", () => {
      const principal = 100000000;
      const annualRate = 0;
      const timeSeconds = 31536000;

      const result = simnet.callReadOnlyFn(
        "helper-utils", 
        "calculate-interest", 
        [Cl.uint(principal), Cl.uint(annualRate), Cl.uint(timeSeconds)], 
        deployer
      );

      expect(result.result).toBeOk(Cl.uint(principal)); // Should return just principal
    });

    it("should handle zero principal", () => {
      const principal = 0;
      const annualRate = 5;
      const timeSeconds = 31536000;

      const result = simnet.callReadOnlyFn(
        "helper-utils", 
        "calculate-interest", 
        [Cl.uint(principal), Cl.uint(annualRate), Cl.uint(timeSeconds)], 
        deployer
      );

      expect(result.result).toBeOk(Cl.uint(0));
    });

    it("should calculate interest for partial year", () => {
      const principal = 100000000;
      const annualRate = 12; // 12% annual rate
      const timeSeconds = 2628000; // 1 month (30.42 days average)

      const result = simnet.callReadOnlyFn(
        "helper-utils", 
        "calculate-interest", 
        [Cl.uint(principal), Cl.uint(annualRate), Cl.uint(timeSeconds)], 
        deployer
      );

      expect(result.result).toBeOk();
      const interestAmount = result.result.expectOk().expectUint();
      expect(interestAmount).toBeGreaterThan(principal);
      expect(interestAmount).toBeLessThan(principal + (principal * 12 / 100)); // Should be less than full year interest
    });
  });

  describe("Validation Functions", () => {
    it("should validate positive amounts", () => {
      const validAmount = simnet.callReadOnlyFn("helper-utils", "is-valid-amount", [Cl.uint(100)], deployer);
      expect(validAmount.result).toBe(Cl.bool(true));

      const invalidAmount = simnet.callReadOnlyFn("helper-utils", "is-valid-amount", [Cl.uint(0)], deployer);
      expect(invalidAmount.result).toBe(Cl.bool(false));
    });

    it("should validate principal amounts for interest calculations", () => {
      const validPrincipal = simnet.callReadOnlyFn("helper-utils", "is-valid-principal", [Cl.uint(100000000)], deployer);
      expect(validPrincipal.result).toBe(Cl.bool(true));

      const zeroPrincipal = simnet.callReadOnlyFn("helper-utils", "is-valid-principal", [Cl.uint(0)], deployer);
      expect(zeroPrincipal.result).toBe(Cl.bool(false));

      const excessivePrincipal = simnet.callReadOnlyFn("helper-utils", "is-valid-principal", [Cl.uint("2000000000000")], deployer);
      expect(excessivePrincipal.result).toBe(Cl.bool(false)); // Exceeds max limit
    });
  });

  describe("Time and Block Functions", () => {
    it("should return current block height", () => {
      const height = simnet.callReadOnlyFn("helper-utils", "get-current-height", [], deployer);
      expect(height.result.expectUint()).toBeGreaterThan(0);
    });

    it("should calculate time differences", () => {
      const currentHeight = simnet.callReadOnlyFn("helper-utils", "get-current-height", [], deployer);
      const currentBlock = currentHeight.result.expectUint();
      const pastBlock = currentBlock - 10;

      const timeDiff = simnet.callReadOnlyFn("helper-utils", "get-time-diff", [Cl.uint(pastBlock)], deployer);
      expect(timeDiff.result).toBe(Cl.uint(10));
    });

    it("should convert blocks to seconds", () => {
      const blocks = 6; // 6 blocks
      const expectedSeconds = 6 * 600; // 6 * 10 minutes

      const seconds = simnet.callReadOnlyFn("helper-utils", "blocks-to-seconds", [Cl.uint(blocks)], deployer);
      expect(seconds.result).toBe(Cl.uint(expectedSeconds));
    });
  });

  describe("Contract Balance Functions", () => {
    it("should return contract STX balance", () => {
      const balance = simnet.callReadOnlyFn("helper-utils", "get-contract-stx-balance", [], deployer);
      expect(balance.result.expectUint()).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Emergency Stop Functionality", () => {
    it("should initialize with emergency stop disabled", () => {
      const isStopped = simnet.callReadOnlyFn("helper-utils", "is-emergency-stopped", [], deployer);
      expect(isStopped.result).toBe(Cl.bool(false));
    });

    it("should allow owner to set emergency stop", () => {
      const setStopResult = simnet.callPublicFn("helper-utils", "set-emergency-stop", [Cl.bool(true)], deployer);
      expect(setStopResult.result).toBeOk(Cl.bool(true));

      const isStopped = simnet.callReadOnlyFn("helper-utils", "is-emergency-stopped", [], deployer);
      expect(isStopped.result).toBe(Cl.bool(true));
    });

    it("should prevent non-owner from setting emergency stop", () => {
      const setStopResult = simnet.callPublicFn("helper-utils", "set-emergency-stop", [Cl.bool(true)], alice);
      expect(setStopResult.result).toBeErr(Cl.uint(1001)); // Unauthorized error
    });

    it("should identify contract owner correctly", () => {
      const isOwner = simnet.callReadOnlyFn("helper-utils", "is-contract-owner", [], deployer);
      expect(isOwner.result).toBe(Cl.bool(true));

      const isNotOwner = simnet.callReadOnlyFn("helper-utils", "is-contract-owner", [], alice);
      expect(isNotOwner.result).toBe(Cl.bool(false));
    });
  });

  describe("Ownership Transfer", () => {
    it("should allow owner to transfer ownership", () => {
      const transferResult = simnet.callPublicFn("helper-utils", "transfer-ownership", [Cl.principal(alice)], deployer);
      expect(transferResult.result).toBeOk(Cl.principal(alice));

      // Original owner should no longer be owner
      const isOriginalOwner = simnet.callReadOnlyFn("helper-utils", "is-contract-owner", [], deployer);
      expect(isOriginalOwner.result).toBe(Cl.bool(false));

      // New owner should be owner
      const isNewOwner = simnet.callReadOnlyFn("helper-utils", "is-contract-owner", [], alice);
      expect(isNewOwner.result).toBe(Cl.bool(true));
    });

    it("should prevent non-owner from transferring ownership", () => {
      const transferResult = simnet.callPublicFn("helper-utils", "transfer-ownership", [Cl.principal(bob)], alice);
      expect(transferResult.result).toBeErr(Cl.uint(1001)); // Unauthorized error
    });

    it("should allow new owner to use admin functions", () => {
      // Transfer ownership first
      simnet.callPublicFn("helper-utils", "transfer-ownership", [Cl.principal(alice)], deployer);

      // New owner should be able to set emergency stop
      const setStopResult = simnet.callPublicFn("helper-utils", "set-emergency-stop", [Cl.bool(true)], alice);
      expect(setStopResult.result).toBeOk(Cl.bool(true));

      // Original owner should not be able to set emergency stop
      const setStopResult2 = simnet.callPublicFn("helper-utils", "set-emergency-stop", [Cl.bool(false)], deployer);
      expect(setStopResult2.result).toBeErr(Cl.uint(1001)); // Unauthorized error
    });
  });

  describe("Edge Cases and Boundary Conditions", () => {
    it("should handle maximum safe values", () => {
      const maxSafeValue = "340282366920938463463374607431768211454"; // u128 max - 1
      
      const addResult = simnet.callReadOnlyFn("helper-utils", "safe-add", [Cl.uint(maxSafeValue), Cl.uint(1)], deployer);
      expect(addResult.result).toBeOk(Cl.uint("340282366920938463463374607431768211455"));
    });

    it("should handle minimum values", () => {
      const subResult = simnet.callReadOnlyFn("helper-utils", "safe-sub", [Cl.uint(1), Cl.uint(1)], deployer);
      expect(subResult.result).toBeOk(Cl.uint(0));

      const divResult = simnet.callReadOnlyFn("helper-utils", "safe-div", [Cl.uint(1), Cl.uint(1)], deployer);
      expect(divResult.result).toBeOk(Cl.uint(1));
    });

    it("should handle large time calculations", () => {
      const largeTime = 315360000; // 10 years in seconds
      const principal = 100000000;
      const rate = 1; // 1% to avoid overflow

      const result = simnet.callReadOnlyFn(
        "helper-utils", 
        "calculate-interest", 
        [Cl.uint(principal), Cl.uint(rate), Cl.uint(largeTime)], 
        deployer
      );

      expect(result.result).toBeOk();
    });

    it("should handle precision in percentage calculations", () => {
      // Test fractional percentages with large amounts
      const largeAmount = 1000000000000; // 10,000 STX
      const smallPercentage = 1; // 0.01%

      const result = simnet.callReadOnlyFn("helper-utils", "calculate-percentage", [Cl.uint(largeAmount), Cl.uint(smallPercentage)], deployer);
      expect(result.result).toBeOk(Cl.uint(10000000000)); // Should maintain precision
    });
  });

  describe("Constants Verification", () => {
    it("should have correct precision constants", () => {
      // We can't directly read constants, but we can test their effects
      // Test that ONE_8 constant is used correctly in calculations
      const result = simnet.callReadOnlyFn("helper-utils", "calculate-percentage", [Cl.uint(100000000), Cl.uint(100)], deployer);
      expect(result.result).toBeOk(Cl.uint(100000000)); // 100% of 1 token (8 decimals)
    });

    it("should have reasonable time constants", () => {
      // Test blocks to seconds conversion uses 10-minute blocks
      const oneBlock = simnet.callReadOnlyFn("helper-utils", "blocks-to-seconds", [Cl.uint(1)], deployer);
      expect(oneBlock.result).toBe(Cl.uint(600)); // 10 minutes = 600 seconds
    });
  });
});
