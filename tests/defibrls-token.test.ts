import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const alice = accounts.get("wallet_1")!;
const bob = accounts.get("wallet_2")!;
const charlie = accounts.get("wallet_3")!;

/*
  DefiBrls Token Tests
  Tests the SIP-010 compliant fungible token with advanced features
*/

describe("DefiBrls Token Contract", () => {
  beforeEach(() => {
    // Reset blockchain state before each test
  });

  describe("Token Standard Functions", () => {
    it("should return correct token metadata", () => {
      const nameResult = simnet.callReadOnlyFn("defibrls-token", "get-name", [], deployer);
      expect(nameResult.result).toBeOk(Cl.stringAscii("DefiBrls Token"));

      const symbolResult = simnet.callReadOnlyFn("defibrls-token", "get-symbol", [], deployer);
      expect(symbolResult.result).toBeOk(Cl.stringAscii("DBRL"));

      const decimalsResult = simnet.callReadOnlyFn("defibrls-token", "get-decimals", [], deployer);
      expect(decimalsResult.result).toBeOk(Cl.uint(8));
    });

    it("should have correct initial supply", () => {
      const totalSupplyResult = simnet.callReadOnlyFn("defibrls-token", "get-total-supply", [], deployer);
      expect(totalSupplyResult.result).toBeOk(Cl.uint(100000000000000000)); // 1B tokens with 8 decimals

      const deployerBalance = simnet.callReadOnlyFn("defibrls-token", "get-balance", [Cl.principal(deployer)], deployer);
      expect(deployerBalance.result).toBeOk(Cl.uint(100000000000000000));
    });

    it("should transfer tokens correctly", () => {
      const transferAmount = 1000000000; // 10 tokens with 8 decimals

      const transferResult = simnet.callPublicFn(
        "defibrls-token",
        "transfer",
        [Cl.uint(transferAmount), Cl.principal(deployer), Cl.principal(alice), Cl.none()],
        deployer
      );

      expect(transferResult.result).toBeOk(Cl.bool(true));

      // Check balances after transfer
      const aliceBalance = simnet.callReadOnlyFn("defibrls-token", "get-balance", [Cl.principal(alice)], deployer);
      expect(aliceBalance.result).toBeOk(Cl.uint(transferAmount));

      const deployerBalance = simnet.callReadOnlyFn("defibrls-token", "get-balance", [Cl.principal(deployer)], deployer);
      expect(deployerBalance.result).toBeOk(Cl.uint(100000000000000000 - transferAmount));
    });

    it("should fail to transfer more than balance", () => {
      const transferAmount = 200000000000000000; // More than total supply

      const transferResult = simnet.callPublicFn(
        "defibrls-token",
        "transfer",
        [Cl.uint(transferAmount), Cl.principal(deployer), Cl.principal(alice), Cl.none()],
        deployer
      );

      expect(transferResult.result).toBeErr(Cl.uint(1)); // Insufficient balance error
    });

    it("should prevent unauthorized transfers", () => {
      const transferAmount = 1000000000;

      const transferResult = simnet.callPublicFn(
        "defibrls-token",
        "transfer",
        [Cl.uint(transferAmount), Cl.principal(deployer), Cl.principal(alice), Cl.none()],
        bob // Bob trying to transfer from deployer's account
      );

      expect(transferResult.result).toBeErr(Cl.uint(2001)); // Unauthorized error
    });
  });

  describe("Minting and Burning", () => {
    it("should allow owner to mint tokens", () => {
      const mintAmount = 1000000000; // 10 tokens

      const mintResult = simnet.callPublicFn(
        "defibrls-token",
        "mint",
        [Cl.uint(mintAmount), Cl.principal(alice)],
        deployer
      );

      expect(mintResult.result).toBeOk(Cl.bool(true));

      const aliceBalance = simnet.callReadOnlyFn("defibrls-token", "get-balance", [Cl.principal(alice)], deployer);
      expect(aliceBalance.result).toBeOk(Cl.uint(mintAmount));

      const totalSupply = simnet.callReadOnlyFn("defibrls-token", "get-total-supply", [], deployer);
      expect(totalSupply.result).toBeOk(Cl.uint(100000000000000000 + mintAmount));
    });

    it("should prevent non-owner from minting", () => {
      const mintAmount = 1000000000;

      const mintResult = simnet.callPublicFn(
        "defibrls-token",
        "mint",
        [Cl.uint(mintAmount), Cl.principal(alice)],
        bob
      );

      expect(mintResult.result).toBeErr(Cl.uint(2001)); // Unauthorized error
    });

    it("should allow burning tokens", () => {
      // First transfer some tokens to alice
      simnet.callPublicFn(
        "defibrls-token",
        "transfer",
        [Cl.uint(1000000000), Cl.principal(deployer), Cl.principal(alice), Cl.none()],
        deployer
      );

      const burnAmount = 500000000; // 5 tokens

      const burnResult = simnet.callPublicFn(
        "defibrls-token",
        "burn",
        [Cl.uint(burnAmount), Cl.principal(alice)],
        alice
      );

      expect(burnResult.result).toBeOk(Cl.bool(true));

      const aliceBalance = simnet.callReadOnlyFn("defibrls-token", "get-balance", [Cl.principal(alice)], deployer);
      expect(aliceBalance.result).toBeOk(Cl.uint(500000000));
    });
  });

  describe("Allowance System", () => {
    it("should approve and transfer from allowance", () => {
      const transferAmount = 1000000000; // 10 tokens
      const approveAmount = 2000000000; // 20 tokens

      // First transfer some tokens to alice
      simnet.callPublicFn(
        "defibrls-token",
        "transfer",
        [Cl.uint(transferAmount), Cl.principal(deployer), Cl.principal(alice), Cl.none()],
        deployer
      );

      // Alice approves Bob to spend her tokens
      const approveResult = simnet.callPublicFn(
        "defibrls-token",
        "approve",
        [Cl.principal(bob), Cl.uint(approveAmount)],
        alice
      );

      expect(approveResult.result).toBeOk(Cl.uint(approveAmount));

      // Check allowance
      const allowanceResult = simnet.callReadOnlyFn(
        "defibrls-token",
        "get-allowance",
        [Cl.principal(alice), Cl.principal(bob)],
        deployer
      );
      expect(allowanceResult.result).toBe(Cl.uint(approveAmount));

      // Bob transfers from Alice to Charlie
      const transferFromResult = simnet.callPublicFn(
        "defibrls-token",
        "transfer-from",
        [Cl.uint(500000000), Cl.principal(alice), Cl.principal(charlie), Cl.none()],
        bob
      );

      expect(transferFromResult.result).toBeOk(Cl.bool(true));

      // Check balances
      const charlieBalance = simnet.callReadOnlyFn("defibrls-token", "get-balance", [Cl.principal(charlie)], deployer);
      expect(charlieBalance.result).toBeOk(Cl.uint(500000000));

      const aliceBalance = simnet.callReadOnlyFn("defibrls-token", "get-balance", [Cl.principal(alice)], deployer);
      expect(aliceBalance.result).toBeOk(Cl.uint(500000000));

      // Check remaining allowance
      const remainingAllowance = simnet.callReadOnlyFn(
        "defibrls-token",
        "get-allowance",
        [Cl.principal(alice), Cl.principal(bob)],
        deployer
      );
      expect(remainingAllowance.result).toBe(Cl.uint(1500000000));
    });

    it("should prevent transfer-from exceeding allowance", () => {
      // First transfer some tokens to alice
      simnet.callPublicFn(
        "defibrls-token",
        "transfer",
        [Cl.uint(1000000000), Cl.principal(deployer), Cl.principal(alice), Cl.none()],
        deployer
      );

      // Alice approves Bob for a small amount
      simnet.callPublicFn(
        "defibrls-token",
        "approve",
        [Cl.principal(bob), Cl.uint(100000000)],
        alice
      );

      // Bob tries to transfer more than allowed
      const transferFromResult = simnet.callPublicFn(
        "defibrls-token",
        "transfer-from",
        [Cl.uint(500000000), Cl.principal(alice), Cl.principal(charlie), Cl.none()],
        bob
      );

      expect(transferFromResult.result).toBeErr(Cl.uint(2003)); // Insufficient balance (allowance)
    });
  });

  describe("Administrative Functions", () => {
    it("should allow owner to toggle minting", () => {
      const toggleResult = simnet.callPublicFn("defibrls-token", "toggle-minting", [], deployer);
      expect(toggleResult.result).toBeOk(Cl.bool(false)); // Minting disabled

      const isMintingEnabled = simnet.callReadOnlyFn("defibrls-token", "is-minting-enabled", [], deployer);
      expect(isMintingEnabled.result).toBe(Cl.bool(false));

      // Try to mint when disabled
      const mintResult = simnet.callPublicFn(
        "defibrls-token",
        "mint",
        [Cl.uint(1000000000), Cl.principal(alice)],
        deployer
      );
      expect(mintResult.result).toBeErr(Cl.uint(2009)); // Minting disabled error
    });

    it("should allow owner to blacklist addresses", () => {
      const blacklistResult = simnet.callPublicFn(
        "defibrls-token",
        "blacklist-address",
        [Cl.principal(alice), Cl.bool(true)],
        deployer
      );
      expect(blacklistResult.result).toBeOk(Cl.bool(true));

      const isBlacklisted = simnet.callReadOnlyFn("defibrls-token", "is-blacklisted", [Cl.principal(alice)], deployer);
      expect(isBlacklisted.result).toBe(Cl.bool(true));

      // Try to transfer to blacklisted address
      const transferResult = simnet.callPublicFn(
        "defibrls-token",
        "transfer",
        [Cl.uint(1000000000), Cl.principal(deployer), Cl.principal(alice), Cl.none()],
        deployer
      );
      expect(transferResult.result).toBeErr(Cl.uint(2001)); // Unauthorized error
    });

    it("should allow ownership transfer", () => {
      const transferOwnershipResult = simnet.callPublicFn(
        "defibrls-token",
        "set-token-owner",
        [Cl.principal(alice)],
        deployer
      );
      expect(transferOwnershipResult.result).toBeOk(Cl.principal(alice));

      const newOwner = simnet.callReadOnlyFn("defibrls-token", "get-token-owner", [], deployer);
      expect(newOwner.result).toBe(Cl.principal(alice));

      // Original owner should no longer be able to mint
      const mintResult = simnet.callPublicFn(
        "defibrls-token",
        "mint",
        [Cl.uint(1000000000), Cl.principal(bob)],
        deployer
      );
      expect(mintResult.result).toBeErr(Cl.uint(2001)); // Unauthorized error

      // New owner should be able to mint
      const mintResult2 = simnet.callPublicFn(
        "defibrls-token",
        "mint",
        [Cl.uint(1000000000), Cl.principal(bob)],
        alice
      );
      expect(mintResult2.result).toBeOk(Cl.bool(true));
    });
  });

  describe("Edge Cases and Security", () => {
    it("should prevent zero amount transfers", () => {
      const transferResult = simnet.callPublicFn(
        "defibrls-token",
        "transfer",
        [Cl.uint(0), Cl.principal(deployer), Cl.principal(alice), Cl.none()],
        deployer
      );
      expect(transferResult.result).toBeErr(Cl.uint(2004)); // Invalid amount error
    });

    it("should prevent self-transfers", () => {
      const transferResult = simnet.callPublicFn(
        "defibrls-token",
        "transfer",
        [Cl.uint(1000000000), Cl.principal(deployer), Cl.principal(deployer), Cl.none()],
        deployer
      );
      expect(transferResult.result).toBeErr(Cl.uint(2008)); // Invalid recipient error
    });

    it("should respect maximum supply cap", () => {
      const maxSupply = 1000000000000000000; // 10B tokens
      const currentSupply = 100000000000000000; // 1B tokens
      const excessiveMint = maxSupply - currentSupply + 1;

      const mintResult = simnet.callPublicFn(
        "defibrls-token",
        "mint",
        [Cl.uint(excessiveMint), Cl.principal(alice)],
        deployer
      );
      expect(mintResult.result).toBeErr(Cl.uint(2005)); // Mint failed error
    });
  });
});
