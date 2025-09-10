import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

declare const simnet: any;

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const alice = accounts.get("wallet_1")!;
const bob = accounts.get("wallet_2")!;
const charlie = accounts.get("wallet_3")!;

/*
  Basic Escrow Contract Tests
  Tests the two-party escrow system with deposit, release, and refund mechanisms
*/

describe("Basic Escrow Contract", () => {
  beforeEach(() => {
    // Reset blockchain state before each test
  });

  describe("Escrow Creation", () => {
    it("should create new escrow successfully", () => {
      const amount = 1000000; // 0.01 STX
      const description = "Test escrow for digital goods";
      const timeoutBlocks = 1008; // 1 week

      const createResult = simnet.callPublicFn(
        "basic-escrow",
        "create-escrow",
        [
          Cl.principal(bob), // seller
          Cl.principal(charlie), // arbiter
          Cl.uint(amount),
          Cl.uint(timeoutBlocks),
          Cl.stringAscii(description)
        ],
        alice // buyer
      );

      expect(createResult.result).toBeOk(Cl.uint(1)); // First escrow ID

      // Check escrow details
      const escrowData = simnet.callReadOnlyFn("basic-escrow", "get-escrow", [Cl.uint(1)], deployer);
      const escrow = escrowData.result.expectSome().expectTuple();

      expect(escrow.buyer).toBe(Cl.principal(alice));
      expect(escrow.seller).toBe(Cl.principal(bob));
      expect(escrow.arbiter).toBe(Cl.principal(charlie));
      expect(escrow.amount).toBe(Cl.uint(amount));
      expect(escrow.state).toBe(Cl.uint(1)); // STATE-CREATED
      expect(escrow.description).toBe(Cl.stringAscii(description));
    });

    it("should increment escrow IDs", () => {
      const amount = 1000000;
      const description = "First escrow";

      simnet.callPublicFn(
        "basic-escrow",
        "create-escrow",
        [Cl.principal(bob), Cl.principal(charlie), Cl.uint(amount), Cl.uint(1008), Cl.stringAscii(description)],
        alice
      );

      const secondEscrowResult = simnet.callPublicFn(
        "basic-escrow",
        "create-escrow",
        [Cl.principal(bob), Cl.principal(charlie), Cl.uint(amount), Cl.uint(1008), Cl.stringAscii("Second escrow")],
        alice
      );

      expect(secondEscrowResult.result).toBeOk(Cl.uint(2)); // Second escrow ID

      const nextIdResult = simnet.callReadOnlyFn("basic-escrow", "get-next-escrow-id", [], deployer);
      expect(nextIdResult.result).toBe(Cl.uint(3));
    });

    it("should prevent invalid escrow creation", () => {
      // Test minimum amount requirement
      const tooSmallAmount = 100000; // Less than minimum

      const createResult1 = simnet.callPublicFn(
        "basic-escrow",
        "create-escrow",
        [Cl.principal(bob), Cl.principal(charlie), Cl.uint(tooSmallAmount), Cl.uint(1008), Cl.stringAscii("Test")],
        alice
      );
      expect(createResult1.result).toBeErr(Cl.uint(3004)); // Invalid amount

      // Test same buyer and seller
      const createResult2 = simnet.callPublicFn(
        "basic-escrow",
        "create-escrow",
        [Cl.principal(alice), Cl.principal(charlie), Cl.uint(1000000), Cl.uint(1008), Cl.stringAscii("Test")],
        alice
      );
      expect(createResult2.result).toBeErr(Cl.uint(3008)); // Invalid participant

      // Test same buyer and arbiter
      const createResult3 = simnet.callPublicFn(
        "basic-escrow",
        "create-escrow",
        [Cl.principal(bob), Cl.principal(alice), Cl.uint(1000000), Cl.uint(1008), Cl.stringAscii("Test")],
        alice
      );
      expect(createResult3.result).toBeErr(Cl.uint(3008)); // Invalid participant
    });
  });

  describe("Escrow Funding", () => {
    beforeEach(() => {
      // Create an escrow for testing
      simnet.callPublicFn(
        "basic-escrow",
        "create-escrow",
        [Cl.principal(bob), Cl.principal(charlie), Cl.uint(1000000), Cl.uint(1008), Cl.stringAscii("Test escrow")],
        alice
      );
    });

    it("should allow buyer to fund escrow", () => {
      const fundResult = simnet.callPublicFn("basic-escrow", "fund-escrow", [Cl.uint(1)], alice);
      expect(fundResult.result).toBeOk(Cl.bool(true));

      // Check escrow state changed to FUNDED
      const escrowData = simnet.callReadOnlyFn("basic-escrow", "get-escrow", [Cl.uint(1)], deployer);
      const escrow = escrowData.result.expectSome().expectTuple();
      expect(escrow.state).toBe(Cl.uint(2)); // STATE-FUNDED

      // Check balance
      const balanceData = simnet.callReadOnlyFn("basic-escrow", "get-escrow-balance", [Cl.uint(1)], deployer);
      const balance = balanceData.result.expectSome().expectTuple();
      expect(balance["stx-balance"]).toBe(Cl.uint(1000000));
    });

    it("should prevent non-buyer from funding", () => {
      const fundResult = simnet.callPublicFn("basic-escrow", "fund-escrow", [Cl.uint(1)], bob);
      expect(fundResult.result).toBeErr(Cl.uint(3001)); // Unauthorized
    });

    it("should prevent double funding", () => {
      // Fund once
      simnet.callPublicFn("basic-escrow", "fund-escrow", [Cl.uint(1)], alice);

      // Try to fund again
      const fundResult = simnet.callPublicFn("basic-escrow", "fund-escrow", [Cl.uint(1)], alice);
      expect(fundResult.result).toBeErr(Cl.uint(3005)); // Invalid state
    });
  });

  describe("Escrow Confirmations", () => {
    beforeEach(() => {
      // Create and fund an escrow
      simnet.callPublicFn(
        "basic-escrow",
        "create-escrow",
        [Cl.principal(bob), Cl.principal(charlie), Cl.uint(1000000), Cl.uint(1008), Cl.stringAscii("Test escrow")],
        alice
      );
      simnet.callPublicFn("basic-escrow", "fund-escrow", [Cl.uint(1)], alice);
    });

    it("should allow buyer to confirm", () => {
      const confirmResult = simnet.callPublicFn("basic-escrow", "buyer-confirm", [Cl.uint(1)], alice);
      expect(confirmResult.result).toBeOk(Cl.bool(true));

      const escrowData = simnet.callReadOnlyFn("basic-escrow", "get-escrow", [Cl.uint(1)], deployer);
      const escrow = escrowData.result.expectSome().expectTuple();
      expect(escrow["buyer-confirmed"]).toBe(Cl.bool(true));
    });

    it("should allow seller to confirm", () => {
      const confirmResult = simnet.callPublicFn("basic-escrow", "seller-confirm", [Cl.uint(1)], bob);
      expect(confirmResult.result).toBeOk(Cl.bool(true));

      const escrowData = simnet.callReadOnlyFn("basic-escrow", "get-escrow", [Cl.uint(1)], deployer);
      const escrow = escrowData.result.expectSome().expectTuple();
      expect(escrow["seller-confirmed"]).toBe(Cl.bool(true));
    });

    it("should auto-release when both parties confirm", () => {
      // Get initial balances
      const initialSellerBalance = simnet.getAssetsMap().get(bob)?.STX || 0;

      // Both parties confirm
      simnet.callPublicFn("basic-escrow", "buyer-confirm", [Cl.uint(1)], alice);
      const sellerConfirmResult = simnet.callPublicFn("basic-escrow", "seller-confirm", [Cl.uint(1)], bob);

      // Should trigger auto-release
      expect(sellerConfirmResult.result).toBeOk(Cl.bool(true));

      // Check escrow state
      const escrowData = simnet.callReadOnlyFn("basic-escrow", "get-escrow", [Cl.uint(1)], deployer);
      const escrow = escrowData.result.expectSome().expectTuple();
      expect(escrow.state).toBe(Cl.uint(3)); // STATE-RELEASED

      // Verify funds were transferred (minus fees)
      const finalSellerBalance = simnet.getAssetsMap().get(bob)?.STX || 0;
      const fee = Math.floor((1000000 * 250) / 10000); // 2.5% fee
      const expectedIncrease = 1000000 - fee;
      
      expect(finalSellerBalance - initialSellerBalance).toBe(expectedIncrease);
    });
  });

  describe("Manual Release and Refund", () => {
    beforeEach(() => {
      // Create and fund an escrow
      simnet.callPublicFn(
        "basic-escrow",
        "create-escrow",
        [Cl.principal(bob), Cl.principal(charlie), Cl.uint(1000000), Cl.uint(1008), Cl.stringAscii("Test escrow")],
        alice
      );
      simnet.callPublicFn("basic-escrow", "fund-escrow", [Cl.uint(1)], alice);
    });

    it("should allow buyer to manually release funds", () => {
      const initialSellerBalance = simnet.getAssetsMap().get(bob)?.STX || 0;

      const releaseResult = simnet.callPublicFn("basic-escrow", "release-funds", [Cl.uint(1)], alice);
      expect(releaseResult.result).toBeOk(Cl.uint(997500)); // Amount minus 2.5% fee

      const finalSellerBalance = simnet.getAssetsMap().get(bob)?.STX || 0;
      expect(finalSellerBalance - initialSellerBalance).toBe(997500);

      // Check escrow state
      const escrowData = simnet.callReadOnlyFn("basic-escrow", "get-escrow", [Cl.uint(1)], deployer);
      const escrow = escrowData.result.expectSome().expectTuple();
      expect(escrow.state).toBe(Cl.uint(3)); // STATE-RELEASED
    });

    it("should allow seller to refund", () => {
      const initialBuyerBalance = simnet.getAssetsMap().get(alice)?.STX || 0;

      const refundResult = simnet.callPublicFn("basic-escrow", "refund-escrow", [Cl.uint(1)], bob);
      expect(refundResult.result).toBeOk(Cl.uint(997500)); // Amount minus 2.5% fee

      const finalBuyerBalance = simnet.getAssetsMap().get(alice)?.STX || 0;
      expect(finalBuyerBalance - initialBuyerBalance).toBe(997500);

      // Check escrow state
      const escrowData = simnet.callReadOnlyFn("basic-escrow", "get-escrow", [Cl.uint(1)], deployer);
      const escrow = escrowData.result.expectSome().expectTuple();
      expect(escrow.state).toBe(Cl.uint(4)); // STATE-REFUNDED
    });

    it("should prevent unauthorized release/refund", () => {
      // Charlie (arbiter) shouldn't be able to release without decision
      const releaseResult = simnet.callPublicFn("basic-escrow", "release-funds", [Cl.uint(1)], charlie);
      expect(releaseResult.result).toBeErr(Cl.uint(3001)); // Unauthorized

      // Random user shouldn't be able to refund
      const refundResult = simnet.callPublicFn("basic-escrow", "refund-escrow", [Cl.uint(1)], charlie);
      expect(refundResult.result).toBeErr(Cl.uint(3001)); // Unauthorized
    });
  });

  describe("Arbiter Decision", () => {
    beforeEach(() => {
      // Create and fund an escrow
      simnet.callPublicFn(
        "basic-escrow",
        "create-escrow",
        [Cl.principal(bob), Cl.principal(charlie), Cl.uint(1000000), Cl.uint(1008), Cl.stringAscii("Test escrow")],
        alice
      );
      simnet.callPublicFn("basic-escrow", "fund-escrow", [Cl.uint(1)], alice);
    });

    it("should allow arbiter to decide release", () => {
      const initialSellerBalance = simnet.getAssetsMap().get(bob)?.STX || 0;

      const decisionResult = simnet.callPublicFn("basic-escrow", "arbiter-decide", [Cl.uint(1), Cl.bool(true)], charlie);
      expect(decisionResult.result).toBeOk(Cl.uint(997500));

      const finalSellerBalance = simnet.getAssetsMap().get(bob)?.STX || 0;
      expect(finalSellerBalance - initialSellerBalance).toBe(997500);

      // Check escrow state
      const escrowData = simnet.callReadOnlyFn("basic-escrow", "get-escrow", [Cl.uint(1)], deployer);
      const escrow = escrowData.result.expectSome().expectTuple();
      expect(escrow.state).toBe(Cl.uint(3)); // STATE-RELEASED
      expect(escrow["arbiter-decision"]).toBeSome(Cl.bool(true));
    });

    it("should allow arbiter to decide refund", () => {
      const initialBuyerBalance = simnet.getAssetsMap().get(alice)?.STX || 0;

      const decisionResult = simnet.callPublicFn("basic-escrow", "arbiter-decide", [Cl.uint(1), Cl.bool(false)], charlie);
      expect(decisionResult.result).toBeOk(Cl.uint(997500));

      const finalBuyerBalance = simnet.getAssetsMap().get(alice)?.STX || 0;
      expect(finalBuyerBalance - initialBuyerBalance).toBe(997500);

      // Check escrow state
      const escrowData = simnet.callReadOnlyFn("basic-escrow", "get-escrow", [Cl.uint(1)], deployer);
      const escrow = escrowData.result.expectSome().expectTuple();
      expect(escrow.state).toBe(Cl.uint(4)); // STATE-REFUNDED
      expect(escrow["arbiter-decision"]).toBeSome(Cl.bool(false));
    });

    it("should prevent non-arbiter from making decisions", () => {
      const decisionResult = simnet.callPublicFn("basic-escrow", "arbiter-decide", [Cl.uint(1), Cl.bool(true)], alice);
      expect(decisionResult.result).toBeErr(Cl.uint(3001)); // Unauthorized
    });
  });

  describe("Timeout Handling", () => {
    it("should handle timeout scenarios", () => {
      // Create escrow with short timeout
      simnet.callPublicFn(
        "basic-escrow",
        "create-escrow",
        [Cl.principal(bob), Cl.principal(charlie), Cl.uint(1000000), Cl.uint(5), Cl.stringAscii("Short timeout")],
        alice
      );
      simnet.callPublicFn("basic-escrow", "fund-escrow", [Cl.uint(1)], alice);

      // Mine blocks to exceed timeout
      simnet.mineEmptyBlocks(10);

      // After timeout, seller should be able to claim
      const releaseResult = simnet.callPublicFn("basic-escrow", "release-funds", [Cl.uint(1)], alice);
      expect(releaseResult.result).toBeOk(Cl.uint(997500));
    });
  });

  describe("Read-only Functions", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        "basic-escrow",
        "create-escrow",
        [Cl.principal(bob), Cl.principal(charlie), Cl.uint(1000000), Cl.uint(1008), Cl.stringAscii("Test")],
        alice
      );
    });

    it("should correctly identify escrow participants", () => {
      const isBuyerParticipant = simnet.callReadOnlyFn("basic-escrow", "is-escrow-participant", [Cl.uint(1), Cl.principal(alice)], deployer);
      expect(isBuyerParticipant.result).toBe(Cl.bool(true));

      const isSellerParticipant = simnet.callReadOnlyFn("basic-escrow", "is-escrow-participant", [Cl.uint(1), Cl.principal(bob)], deployer);
      expect(isSellerParticipant.result).toBe(Cl.bool(true));

      const isArbiterParticipant = simnet.callReadOnlyFn("basic-escrow", "is-escrow-participant", [Cl.uint(1), Cl.principal(charlie)], deployer);
      expect(isArbiterParticipant.result).toBe(Cl.bool(true));

      const isNotParticipant = simnet.callReadOnlyFn("basic-escrow", "is-escrow-participant", [Cl.uint(1), Cl.principal(deployer)], deployer);
      expect(isNotParticipant.result).toBe(Cl.bool(false));
    });

    it("should return correct contract statistics", () => {
      const totalEscrows = simnet.callReadOnlyFn("basic-escrow", "get-total-escrows", [], deployer);
      expect(totalEscrows.result).toBe(Cl.uint(1));

      const totalVolume = simnet.callReadOnlyFn("basic-escrow", "get-total-volume", [], deployer);
      expect(totalVolume.result).toBe(Cl.uint(0)); // No funds deposited yet

      // Fund the escrow
      simnet.callPublicFn("basic-escrow", "fund-escrow", [Cl.uint(1)], alice);

      const totalVolumeAfterFunding = simnet.callReadOnlyFn("basic-escrow", "get-total-volume", [], deployer);
      expect(totalVolumeAfterFunding.result).toBe(Cl.uint(1000000));
    });
  });

  describe("Administrative Functions", () => {
    it("should allow owner to pause contract", () => {
      const pauseResult = simnet.callPublicFn("basic-escrow", "set-paused", [Cl.bool(true)], deployer);
      expect(pauseResult.result).toBeOk(Cl.bool(true));

      // Try to create escrow when paused
      const createResult = simnet.callPublicFn(
        "basic-escrow",
        "create-escrow",
        [Cl.principal(bob), Cl.principal(charlie), Cl.uint(1000000), Cl.uint(1008), Cl.stringAscii("Test")],
        alice
      );
      expect(createResult.result).toBeErr(Cl.uint(3005)); // Invalid state
    });

    it("should prevent non-owner from pausing", () => {
      const pauseResult = simnet.callPublicFn("basic-escrow", "set-paused", [Cl.bool(true)], alice);
      expect(pauseResult.result).toBeErr(Cl.uint(3001)); // Unauthorized
    });

    it("should allow ownership transfer", () => {
      const transferResult = simnet.callPublicFn("basic-escrow", "set-contract-owner", [Cl.principal(alice)], deployer);
      expect(transferResult.result).toBeOk(Cl.principal(alice));

      // Original owner should no longer be able to pause
      const pauseResult = simnet.callPublicFn("basic-escrow", "set-paused", [Cl.bool(true)], deployer);
      expect(pauseResult.result).toBeErr(Cl.uint(3001)); // Unauthorized

      // New owner should be able to pause
      const pauseResult2 = simnet.callPublicFn("basic-escrow", "set-paused", [Cl.bool(true)], alice);
      expect(pauseResult2.result).toBeOk(Cl.bool(true));
    });
  });
});
