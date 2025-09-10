;; DefiBrls Token Swap Contract
;; Basic 1:1 token exchange between two different tokens with liquidity pools

;; For development, we'll work without external traits
;; (use-trait ft-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

;; Error codes
(define-constant ERR-UNAUTHORIZED (err u5001))
(define-constant ERR-POOL-NOT-FOUND (err u5002))
(define-constant ERR-POOL-EXISTS (err u5003))
(define-constant ERR-INVALID-AMOUNT (err u5004))
(define-constant ERR-INSUFFICIENT-LIQUIDITY (err u5005))
(define-constant ERR-TRANSFER-FAILED (err u5006))
(define-constant ERR-SLIPPAGE-EXCEEDED (err u5007))
(define-constant ERR-INVALID-TOKEN (err u5008))
(define-constant ERR-INSUFFICIENT-LP-TOKENS (err u5009))
(define-constant ERR-SAME-TOKEN (err u5010))
(define-constant ERR-POOL-PAUSED (err u5011))
(define-constant ERR-MINIMUM-LIQUIDITY (err u5012))

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant MINIMUM-LIQUIDITY u1000) ;; Minimum liquidity to prevent zero-division
(define-constant FEE-BASIS-POINTS u30) ;; 0.3% trading fee
(define-constant MAX-SLIPPAGE u1000) ;; 10% max slippage (in basis points)
(define-constant LP-TOKEN-PRECISION u100000000) ;; 8 decimal places

;; Liquidity pool structure
(define-map liquidity-pools
  { token-a: principal, token-b: principal }
  {
    reserve-a: uint,
    reserve-b: uint,
    total-lp-tokens: uint,
    created-at: uint,
    is-active: bool,
    total-volume: uint,
    fee-collected: uint
  })

;; LP token balances for each user in each pool
(define-map lp-balances
  { 
    user: principal, 
    token-a: principal, 
    token-b: principal 
  }
  { balance: uint })

;; Swap history for analytics
(define-map swap-history
  { id: uint }
  {
    user: principal,
    token-in: principal,
    token-out: principal,
    amount-in: uint,
    amount-out: uint,
    fee-paid: uint,
    timestamp: uint
  })

;; Contract state
(define-data-var contract-owner principal CONTRACT-OWNER)
(define-data-var paused bool false)
(define-data-var total-pools uint u0)
(define-data-var total-swaps uint u0)
(define-data-var next-swap-id uint u1)
(define-data-var protocol-fee-rate uint u10) ;; 10% of trading fees go to protocol

;; Events
(define-private (emit-pool-created (token-a principal) (token-b principal) (reserve-a uint) (reserve-b uint))
  (print {
    event: "pool-created",
    token-a: token-a,
    token-b: token-b,
    reserve-a: reserve-a,
    reserve-b: reserve-b,
    stacks-block-height: stacks-block-height
  }))

(define-private (emit-liquidity-added (user principal) (token-a principal) (token-b principal) (amount-a uint) (amount-b uint) (lp-tokens uint))
  (print {
    event: "liquidity-added",
    user: user,
    token-a: token-a,
    token-b: token-b,
    amount-a: amount-a,
    amount-b: amount-b,
    lp-tokens: lp-tokens,
    stacks-block-height: stacks-block-height
  }))

(define-private (emit-swap (user principal) (token-in principal) (token-out principal) (amount-in uint) (amount-out uint) (fee uint))
  (print {
    event: "swap",
    user: user,
    token-in: token-in,
    token-out: token-out,
    amount-in: amount-in,
    amount-out: amount-out,
    fee: fee,
    stacks-block-height: stacks-block-height
  }))

;; Helper functions
(define-read-only (is-contract-owner)
  (is-eq tx-sender (var-get contract-owner)))

(define-read-only (is-paused)
  (var-get paused))

;; Get ordered token pair (to ensure consistent pool identification)
(define-read-only (get-token-pair (token-a principal) (token-b principal))
  (let ((token-a-str (unwrap-panic (to-consensus-buff? token-a)))
        (token-b-str (unwrap-panic (to-consensus-buff? token-b))))
    (if (< (len token-a-str) (len token-b-str))
        { token-a: token-a, token-b: token-b }
        { token-a: token-b, token-b: token-a })))

;; Calculate swap output using constant product formula (x * y = k)
;; Output = (input * reserve-out * (10000 - fee)) / ((reserve-in * 10000) + (input * (10000 - fee)))
(define-read-only (get-swap-output (amount-in uint) (reserve-in uint) (reserve-out uint))
  (let (
    (amount-in-with-fee (- (* amount-in u10000) (* amount-in FEE-BASIS-POINTS)))
    (numerator (* amount-in-with-fee reserve-out))
    (denominator (+ (* reserve-in u10000) amount-in-with-fee))
  )
    (if (> denominator u0)
        (ok (/ numerator denominator))
        ERR-INSUFFICIENT-LIQUIDITY)))

;; Calculate required input for desired output
(define-read-only (get-swap-input (amount-out uint) (reserve-in uint) (reserve-out uint))
  (let (
    (numerator (* (* reserve-in amount-out) u10000))
    (denominator (* (- reserve-out amount-out) (- u10000 FEE-BASIS-POINTS)))
  )
    (if (and (> denominator u0) (< amount-out reserve-out))
        (ok (+ (/ numerator denominator) u1))
        ERR-INSUFFICIENT-LIQUIDITY)))

;; Calculate LP tokens to mint for liquidity provision
(define-read-only (calculate-lp-tokens (amount-a uint) (amount-b uint) (reserve-a uint) (reserve-b uint) (total-supply uint))
  (if (is-eq total-supply u0)
      ;; First liquidity provider: LP tokens = sqrt(amount-a * amount-b)
      (let ((lp-tokens (pow (/ (* amount-a amount-b) LP-TOKEN-PRECISION) u1)))
        (if (>= lp-tokens MINIMUM-LIQUIDITY)
            (ok (- lp-tokens MINIMUM-LIQUIDITY))
            ERR-MINIMUM-LIQUIDITY))
      ;; Subsequent providers: LP tokens = min((amount-a / reserve-a), (amount-b / reserve-b)) * total-supply
      (let (
        (lp-from-a (/ (* amount-a total-supply) reserve-a))
        (lp-from-b (/ (* amount-b total-supply) reserve-b))
      )
        (ok (if (< lp-from-a lp-from-b) lp-from-a lp-from-b)))))

;; Create new liquidity pool
(define-public (create-pool 
  (token-a principal) 
  (token-b principal) 
  (amount-a uint) 
  (amount-b uint))
  (let (
    ;; Use the token principals directly
    (pair (get-token-pair token-a token-b))
  )
    (begin
      (asserts! (not (is-paused)) ERR-POOL-PAUSED)
      (asserts! (not (is-eq token-a token-b)) ERR-SAME-TOKEN)
      (asserts! (> amount-a u0) ERR-INVALID-AMOUNT)
      (asserts! (> amount-b u0) ERR-INVALID-AMOUNT)
      (asserts! (is-none (map-get? liquidity-pools pair)) ERR-POOL-EXISTS)
      (asserts! (>= (* amount-a amount-b) (* MINIMUM-LIQUIDITY MINIMUM-LIQUIDITY)) ERR-MINIMUM-LIQUIDITY)
      
      ;; For simplicity, assume we're working with the defibrls-token contract
      ;; In production, implement proper trait handling
      (try! (contract-call? .defibrls-token transfer amount-a tx-sender (as-contract tx-sender) none))
      (try! (contract-call? .defibrls-token transfer amount-b tx-sender (as-contract tx-sender) none))
      
      ;; Calculate initial LP tokens
      (let ((initial-lp-tokens (- (pow (/ (* amount-a amount-b) LP-TOKEN-PRECISION) u1) MINIMUM-LIQUIDITY)))
        
        ;; Create pool
        (map-set liquidity-pools
          pair
          {
            reserve-a: amount-a,
            reserve-b: amount-b,
            total-lp-tokens: (+ initial-lp-tokens MINIMUM-LIQUIDITY),
            created-at: stacks-block-height,
            is-active: true,
            total-volume: u0,
            fee-collected: u0
          })
        
        ;; Mint LP tokens to creator
        (map-set lp-balances
          { 
            user: tx-sender, 
            token-a: (get token-a pair), 
            token-b: (get token-b pair)
          }
          { balance: initial-lp-tokens })
        
        ;; Update contract state
        (var-set total-pools (+ (var-get total-pools) u1))
        
        (emit-pool-created token-a token-b amount-a amount-b)
        (ok initial-lp-tokens)))))

;; Add liquidity to existing pool
(define-public (add-liquidity 
  (token-a principal) 
  (token-b principal) 
  (amount-a-desired uint) 
  (amount-b-desired uint)
  (amount-a-min uint)
  (amount-b-min uint))
  (let (
    (pair (get-token-pair token-a token-b))
    (pool-data (unwrap! (map-get? liquidity-pools pair) ERR-POOL-NOT-FOUND))
  )
    (begin
      (asserts! (not (is-paused)) ERR-POOL-PAUSED)
      (asserts! (get is-active pool-data) ERR-POOL-PAUSED)
      
      ;; Calculate optimal amounts
      (let (
        (reserve-a (get reserve-a pool-data))
        (reserve-b (get reserve-b pool-data))
        (amount-b-optimal (/ (* amount-a-desired reserve-b) reserve-a))
      )
        (if (<= amount-b-optimal amount-b-desired)
            ;; Use amount-a-desired and amount-b-optimal
            (begin
              (asserts! (>= amount-b-optimal amount-b-min) ERR-SLIPPAGE-EXCEEDED)
              (add-liquidity-internal token-a token-b amount-a-desired amount-b-optimal pair pool-data))
            ;; Use amount-a-optimal and amount-b-desired
            (let ((amount-a-optimal (/ (* amount-b-desired reserve-a) reserve-b)))
              (begin
                (asserts! (>= amount-a-optimal amount-a-min) ERR-SLIPPAGE-EXCEEDED)
                (add-liquidity-internal token-a token-b amount-a-optimal amount-b-desired pair pool-data))))))))

;; Internal function to add liquidity
(define-private (add-liquidity-internal 
  (token-a principal) 
  (token-b principal) 
  (amount-a uint) 
  (amount-b uint)
  (pair { token-a: principal, token-b: principal })
  (pool-data { reserve-a: uint, reserve-b: uint, total-lp-tokens: uint, created-at: uint, is-active: bool, total-volume: uint, fee-collected: uint }))
  (let (
    (lp-tokens (unwrap! (calculate-lp-tokens amount-a amount-b (get reserve-a pool-data) (get reserve-b pool-data) (get total-lp-tokens pool-data)) ERR-INSUFFICIENT-LIQUIDITY))
    (current-lp-balance (default-to u0 (get balance (map-get? lp-balances { user: tx-sender, token-a: (get token-a pair), token-b: (get token-b pair) }))))
  )
    (begin
      ;; Transfer tokens to contract - using defibrls-token for simplicity
      (try! (contract-call? .defibrls-token transfer amount-a tx-sender (as-contract tx-sender) none))
      (try! (contract-call? .defibrls-token transfer amount-b tx-sender (as-contract tx-sender) none))
      
      ;; Update pool
      (map-set liquidity-pools
        pair
        (merge pool-data {
          reserve-a: (+ (get reserve-a pool-data) amount-a),
          reserve-b: (+ (get reserve-b pool-data) amount-b),
          total-lp-tokens: (+ (get total-lp-tokens pool-data) lp-tokens)
        }))
      
      ;; Update user LP balance
      (map-set lp-balances
        { user: tx-sender, token-a: (get token-a pair), token-b: (get token-b pair) }
        { balance: (+ current-lp-balance lp-tokens) })
      
      (emit-liquidity-added tx-sender (get token-a pair) (get token-b pair) amount-a amount-b lp-tokens)
      (ok lp-tokens))))

;; Remove liquidity from pool
(define-public (remove-liquidity 
  (token-a principal) 
  (token-b principal) 
  (lp-tokens uint)
  (amount-a-min uint)
  (amount-b-min uint))
  (let (
    (pair (get-token-pair token-a token-b))
    (pool-data (unwrap! (map-get? liquidity-pools pair) ERR-POOL-NOT-FOUND))
    (user-lp-balance (default-to u0 (get balance (map-get? lp-balances { user: tx-sender, token-a: (get token-a pair), token-b: (get token-b pair) }))))
  )
    (begin
      (asserts! (not (is-paused)) ERR-POOL-PAUSED)
      (asserts! (> lp-tokens u0) ERR-INVALID-AMOUNT)
      (asserts! (>= user-lp-balance lp-tokens) ERR-INSUFFICIENT-LP-TOKENS)
      
      ;; Calculate amounts to return
      (let (
        (total-lp-supply (get total-lp-tokens pool-data))
        (amount-a (/ (* lp-tokens (get reserve-a pool-data)) total-lp-supply))
        (amount-b (/ (* lp-tokens (get reserve-b pool-data)) total-lp-supply))
      )
        (begin
          (asserts! (>= amount-a amount-a-min) ERR-SLIPPAGE-EXCEEDED)
          (asserts! (>= amount-b amount-b-min) ERR-SLIPPAGE-EXCEEDED)
          
          ;; Transfer tokens back to user - using defibrls-token for simplicity
          (try! (as-contract (contract-call? .defibrls-token transfer amount-a tx-sender tx-sender none)))
          (try! (as-contract (contract-call? .defibrls-token transfer amount-b tx-sender tx-sender none)))
          
          ;; Update pool
          (map-set liquidity-pools
            pair
            (merge pool-data {
              reserve-a: (- (get reserve-a pool-data) amount-a),
              reserve-b: (- (get reserve-b pool-data) amount-b),
              total-lp-tokens: (- total-lp-supply lp-tokens)
            }))
          
          ;; Update user LP balance
          (map-set lp-balances
            { user: tx-sender, token-a: (get token-a pair), token-b: (get token-b pair) }
            { balance: (- user-lp-balance lp-tokens) })
          
          (ok { amount-a: amount-a, amount-b: amount-b }))))))

;; Swap tokens
(define-public (swap-tokens 
  (token-in principal) 
  (token-out principal) 
  (amount-in uint)
  (amount-out-min uint))
  (let (
    (pair (get-token-pair token-in token-out))
    (pool-data (unwrap! (map-get? liquidity-pools pair) ERR-POOL-NOT-FOUND))
    (swap-id (var-get next-swap-id))
  )
    (begin
      (asserts! (not (is-paused)) ERR-POOL-PAUSED)
      (asserts! (get is-active pool-data) ERR-POOL-PAUSED)
      (asserts! (> amount-in u0) ERR-INVALID-AMOUNT)
      (asserts! (not (is-eq token-in token-out)) ERR-SAME-TOKEN)
      
      ;; Determine reserves based on token order
      (let (
        (is-token-a-in (is-eq token-in (get token-a pair)))
        (reserve-in (if is-token-a-in (get reserve-a pool-data) (get reserve-b pool-data)))
        (reserve-out (if is-token-a-in (get reserve-b pool-data) (get reserve-a pool-data)))
        (amount-out (unwrap! (get-swap-output amount-in reserve-in reserve-out) ERR-INSUFFICIENT-LIQUIDITY))
        (fee-amount (/ (* amount-in FEE-BASIS-POINTS) u10000))
      )
        (begin
          (asserts! (>= amount-out amount-out-min) ERR-SLIPPAGE-EXCEEDED)
          (asserts! (< amount-out reserve-out) ERR-INSUFFICIENT-LIQUIDITY)
          
          ;; Transfer tokens - using defibrls-token for simplicity
          (try! (contract-call? .defibrls-token transfer amount-in tx-sender (as-contract tx-sender) none))
          (try! (as-contract (contract-call? .defibrls-token transfer amount-out tx-sender tx-sender none)))
          
          ;; Update pool reserves
          (map-set liquidity-pools
            pair
            (merge pool-data {
              reserve-a: (if is-token-a-in 
                           (+ (get reserve-a pool-data) amount-in) 
                           (- (get reserve-a pool-data) amount-out)),
              reserve-b: (if is-token-a-in 
                           (- (get reserve-b pool-data) amount-out) 
                           (+ (get reserve-b pool-data) amount-in)),
              total-volume: (+ (get total-volume pool-data) amount-in),
              fee-collected: (+ (get fee-collected pool-data) fee-amount)
            }))
          
          ;; Record swap
          (map-set swap-history
            { id: swap-id }
            {
              user: tx-sender,
              token-in: token-in,
              token-out: token-out,
              amount-in: amount-in,
              amount-out: amount-out,
              fee-paid: fee-amount,
              timestamp: stacks-block-height
            })
          
          ;; Update contract state
          (var-set next-swap-id (+ swap-id u1))
          (var-set total-swaps (+ (var-get total-swaps) u1))
          
          (emit-swap tx-sender token-in token-out amount-in amount-out fee-amount)
          (ok amount-out))))))

;; Read-only functions
(define-read-only (get-pool (token-a principal) (token-b principal))
  (let ((pair (get-token-pair token-a token-b)))
    (map-get? liquidity-pools pair)))

(define-read-only (get-lp-balance (user principal) (token-a principal) (token-b principal))
  (let ((pair (get-token-pair token-a token-b)))
    (default-to u0 (get balance (map-get? lp-balances { user: user, token-a: (get token-a pair), token-b: (get token-b pair) })))))

(define-read-only (get-swap-quote (token-in principal) (token-out principal) (amount-in uint))
  (let (
    (pair (get-token-pair token-in token-out))
    (pool-data (unwrap! (map-get? liquidity-pools pair) ERR-POOL-NOT-FOUND))
  )
    (let (
      (is-token-a-in (is-eq token-in (get token-a pair)))
      (reserve-in (if is-token-a-in (get reserve-a pool-data) (get reserve-b pool-data)))
      (reserve-out (if is-token-a-in (get reserve-b pool-data) (get reserve-a pool-data)))
    )
      (get-swap-output amount-in reserve-in reserve-out))))

(define-read-only (get-contract-stats)
  {
    total-pools: (var-get total-pools),
    total-swaps: (var-get total-swaps),
    paused: (var-get paused)
  })

;; Administrative functions
(define-public (set-paused (paused-state bool))
  (begin
    (asserts! (is-contract-owner) ERR-UNAUTHORIZED)
    (var-set paused paused-state)
    (ok paused-state)))

(define-public (set-protocol-fee-rate (new-rate uint))
  (begin
    (asserts! (is-contract-owner) ERR-UNAUTHORIZED)
    (asserts! (<= new-rate u50) ERR-INVALID-AMOUNT) ;; Max 50% of trading fees
    (var-set protocol-fee-rate new-rate)
    (ok new-rate)))

(define-public (set-contract-owner (new-owner principal))
  (begin
    (asserts! (is-contract-owner) ERR-UNAUTHORIZED)
    (var-set contract-owner new-owner)
    (ok new-owner)))
