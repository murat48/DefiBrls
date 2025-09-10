;; DefiBrls Basic Escrow Contract
;; Two-party escrow system with deposit, release, and refund mechanisms

;; Error codes
(define-constant ERR-UNAUTHORIZED (err u3001))
(define-constant ERR-ESCROW-NOT-FOUND (err u3002))
(define-constant ERR-ESCROW-ALREADY-EXISTS (err u3003))
(define-constant ERR-INVALID-AMOUNT (err u3004))
(define-constant ERR-INVALID-STATE (err u3005))
(define-constant ERR-INSUFFICIENT-FUNDS (err u3006))
(define-constant ERR-TRANSFER-FAILED (err u3007))
(define-constant ERR-INVALID-PARTICIPANT (err u3008))
(define-constant ERR-TIMEOUT-NOT-REACHED (err u3009))
(define-constant ERR-ALREADY-RELEASED (err u3010))
(define-constant ERR-ALREADY-REFUNDED (err u3011))
(define-constant ERR-RELEASE-FAILED (err u3012))

;; Escrow states
(define-constant STATE-CREATED u1)
(define-constant STATE-FUNDED u2)
(define-constant STATE-RELEASED u3)
(define-constant STATE-REFUNDED u4)
(define-constant STATE-DISPUTED u5)

;; Contract constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant ESCROW-FEE-BASIS-POINTS u250) ;; 2.5% fee
(define-constant MIN-ESCROW-AMOUNT u1000000) ;; Minimum 0.01 STX
(define-constant DEFAULT-TIMEOUT-BLOCKS u1008) ;; ~1 week (10-minute blocks)

;; Data structures
(define-map escrows
  { id: uint }
  {
    buyer: principal,
    seller: principal,
    arbiter: principal,
    amount: uint,
    state: uint,
    created-at: uint,
    timeout-at: uint,
    description: (string-ascii 256),
    buyer-confirmed: bool,
    seller-confirmed: bool,
    arbiter-decision: (optional bool) ;; true = release, false = refund
  })

(define-map escrow-balances
  { id: uint }
  { stx-balance: uint })

;; Contract state
(define-data-var next-escrow-id uint u1)
(define-data-var contract-owner principal CONTRACT-OWNER)
(define-data-var paused bool false)
(define-data-var total-escrows uint u0)
(define-data-var total-volume uint u0)

;; Events
(define-private (emit-escrow-created (id uint) (buyer principal) (seller principal) (amount uint))
  (print {
    event: "escrow-created",
    id: id,
    buyer: buyer,
    seller: seller,
    amount: amount,
    stacks-block-height: stacks-block-height
  }))

(define-private (emit-escrow-funded (id uint) (amount uint))
  (print {
    event: "escrow-funded",
    id: id,
    amount: amount,
    stacks-block-height: stacks-block-height
  }))

(define-private (emit-escrow-released (id uint) (to principal) (amount uint))
  (print {
    event: "escrow-released",
    id: id,
    to: to,
    amount: amount,
    stacks-block-height: stacks-block-height
  }))

(define-private (emit-escrow-refunded (id uint) (to principal) (amount uint))
  (print {
    event: "escrow-refunded",
    id: id,
    to: to,
    amount: amount,
    stacks-block-height: stacks-block-height
  }))

;; Helper functions
(define-read-only (is-contract-owner)
  (is-eq tx-sender (var-get contract-owner)))

(define-read-only (is-paused)
  (var-get paused))

(define-read-only (calculate-fee (amount uint))
  (/ (* amount ESCROW-FEE-BASIS-POINTS) u10000))

(define-read-only (calculate-net-amount (amount uint))
  (- amount (calculate-fee amount)))

;; Create new escrow
(define-public (create-escrow 
  (seller principal) 
  (arbiter principal) 
  (amount uint) 
  (timeout-blocks uint)
  (description (string-ascii 256)))
  (let (
    (escrow-id (var-get next-escrow-id))
    (timeout-at (+ stacks-block-height (if (> timeout-blocks u0) timeout-blocks DEFAULT-TIMEOUT-BLOCKS)))
  )
    (begin
      (asserts! (not (is-paused)) ERR-INVALID-STATE)
      (asserts! (>= amount MIN-ESCROW-AMOUNT) ERR-INVALID-AMOUNT)
      (asserts! (not (is-eq tx-sender seller)) ERR-INVALID-PARTICIPANT)
      (asserts! (not (is-eq tx-sender arbiter)) ERR-INVALID-PARTICIPANT)
      (asserts! (not (is-eq seller arbiter)) ERR-INVALID-PARTICIPANT)
      (asserts! (is-none (map-get? escrows { id: escrow-id })) ERR-ESCROW-ALREADY-EXISTS)
      
      ;; Create escrow record
      (map-set escrows
        { id: escrow-id }
        {
          buyer: tx-sender,
          seller: seller,
          arbiter: arbiter,
          amount: amount,
          state: STATE-CREATED,
          created-at: stacks-block-height,
          timeout-at: timeout-at,
          description: description,
          buyer-confirmed: false,
          seller-confirmed: false,
          arbiter-decision: none
        })
      
      ;; Initialize balance
      (map-set escrow-balances
        { id: escrow-id }
        { stx-balance: u0 })
      
      ;; Update contract state
      (var-set next-escrow-id (+ escrow-id u1))
      (var-set total-escrows (+ (var-get total-escrows) u1))
      
      (emit-escrow-created escrow-id tx-sender seller amount)
      (ok escrow-id))))

;; Fund escrow (buyer deposits STX)
(define-public (fund-escrow (id uint))
  (let (
    (escrow-data (unwrap! (map-get? escrows { id: id }) ERR-ESCROW-NOT-FOUND))
    (amount (get amount escrow-data))
  )
    (begin
      (asserts! (not (is-paused)) ERR-INVALID-STATE)
      (asserts! (is-eq tx-sender (get buyer escrow-data)) ERR-UNAUTHORIZED)
      (asserts! (is-eq (get state escrow-data) STATE-CREATED) ERR-INVALID-STATE)
      (asserts! (< stacks-block-height (get timeout-at escrow-data)) ERR-TIMEOUT-NOT-REACHED)
      
      ;; Transfer STX to contract
      (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
      
      ;; Update escrow state
      (map-set escrows
        { id: id }
        (merge escrow-data { state: STATE-FUNDED }))
      
      ;; Update balance
      (map-set escrow-balances
        { id: id }
        { stx-balance: amount })
      
      ;; Update total volume
      (var-set total-volume (+ (var-get total-volume) amount))
      
      (emit-escrow-funded id amount)
      (ok true))))

;; Buyer confirms receipt of goods/services
(define-public (buyer-confirm (id uint))
  (let (
    (escrow-data (unwrap! (map-get? escrows { id: id }) ERR-ESCROW-NOT-FOUND))
  )
    (begin
      (asserts! (not (is-paused)) ERR-INVALID-STATE)
      (asserts! (is-eq tx-sender (get buyer escrow-data)) ERR-UNAUTHORIZED)
      (asserts! (is-eq (get state escrow-data) STATE-FUNDED) ERR-INVALID-STATE)
      
      ;; Update confirmation
      (map-set escrows
        { id: id }
        (merge escrow-data { buyer-confirmed: true }))
      
      ;; Auto-release if both parties confirmed
      (begin
        (if (get seller-confirmed escrow-data)
            (unwrap! (release-funds id) ERR-RELEASE-FAILED)
            u0)
        (ok true)))))

;; Seller confirms delivery
(define-public (seller-confirm (id uint))
  (let (
    (escrow-data (unwrap! (map-get? escrows { id: id }) ERR-ESCROW-NOT-FOUND))
  )
    (begin
      (asserts! (not (is-paused)) ERR-INVALID-STATE)
      (asserts! (is-eq tx-sender (get seller escrow-data)) ERR-UNAUTHORIZED)
      (asserts! (is-eq (get state escrow-data) STATE-FUNDED) ERR-INVALID-STATE)
      
      ;; Update confirmation
      (map-set escrows
        { id: id }
        (merge escrow-data { seller-confirmed: true }))
      
      ;; Auto-release if both parties confirmed
      (begin
        (if (get buyer-confirmed escrow-data)
            (unwrap! (release-funds id) ERR-RELEASE-FAILED)
            u0)
        (ok true)))))

;; Release funds to seller
(define-public (release-funds (id uint))
  (let (
    (escrow-data (unwrap! (map-get? escrows { id: id }) ERR-ESCROW-NOT-FOUND))
    (balance-data (unwrap! (map-get? escrow-balances { id: id }) ERR-ESCROW-NOT-FOUND))
    (amount (get stx-balance balance-data))
    (fee (calculate-fee amount))
    (net-amount (- amount fee))
    (seller (get seller escrow-data))
  )
    (begin
      (asserts! (not (is-paused)) ERR-INVALID-STATE)
      (asserts! (is-eq (get state escrow-data) STATE-FUNDED) ERR-INVALID-STATE)
      (asserts! (> amount u0) ERR-INSUFFICIENT-FUNDS)
      
      ;; Check authorization (buyer, arbiter, or both parties confirmed)
      (asserts! (or 
        (is-eq tx-sender (get buyer escrow-data))
        (is-eq tx-sender (get arbiter escrow-data))
        (and (get buyer-confirmed escrow-data) (get seller-confirmed escrow-data))
        (>= stacks-block-height (get timeout-at escrow-data))) ;; Timeout allows seller to claim
        ERR-UNAUTHORIZED)
      
      ;; Transfer funds to seller
      (try! (as-contract (stx-transfer? net-amount tx-sender seller)))
      
      ;; Transfer fee to contract owner
      (try! (as-contract (stx-transfer? fee tx-sender (var-get contract-owner))))
      
      ;; Update escrow state
      (map-set escrows
        { id: id }
        (merge escrow-data { state: STATE-RELEASED }))
      
      ;; Clear balance
      (map-set escrow-balances
        { id: id }
        { stx-balance: u0 })
      
      (emit-escrow-released id seller net-amount)
      (ok net-amount))))

;; Refund to buyer
(define-public (refund-escrow (id uint))
  (let (
    (escrow-data (unwrap! (map-get? escrows { id: id }) ERR-ESCROW-NOT-FOUND))
    (balance-data (unwrap! (map-get? escrow-balances { id: id }) ERR-ESCROW-NOT-FOUND))
    (amount (get stx-balance balance-data))
    (fee (calculate-fee amount))
    (net-amount (- amount fee))
    (buyer (get buyer escrow-data))
  )
    (begin
      (asserts! (not (is-paused)) ERR-INVALID-STATE)
      (asserts! (is-eq (get state escrow-data) STATE-FUNDED) ERR-INVALID-STATE)
      (asserts! (> amount u0) ERR-INSUFFICIENT-FUNDS)
      
      ;; Check authorization (seller agreement or arbiter decision)
      (asserts! (or 
        (is-eq tx-sender (get seller escrow-data))
        (is-eq tx-sender (get arbiter escrow-data))
        (>= stacks-block-height (+ (get timeout-at escrow-data) u144))) ;; Additional 24h after timeout
        ERR-UNAUTHORIZED)
      
      ;; Transfer funds back to buyer
      (try! (as-contract (stx-transfer? net-amount tx-sender buyer)))
      
      ;; Transfer fee to contract owner
      (try! (as-contract (stx-transfer? fee tx-sender (var-get contract-owner))))
      
      ;; Update escrow state
      (map-set escrows
        { id: id }
        (merge escrow-data { state: STATE-REFUNDED }))
      
      ;; Clear balance
      (map-set escrow-balances
        { id: id }
        { stx-balance: u0 })
      
      (emit-escrow-refunded id buyer net-amount)
      (ok net-amount))))

;; Arbiter decision
(define-public (arbiter-decide (id uint) (release bool))
  (let (
    (escrow-data (unwrap! (map-get? escrows { id: id }) ERR-ESCROW-NOT-FOUND))
  )
    (begin
      (asserts! (not (is-paused)) ERR-INVALID-STATE)
      (asserts! (is-eq tx-sender (get arbiter escrow-data)) ERR-UNAUTHORIZED)
      (asserts! (is-eq (get state escrow-data) STATE-FUNDED) ERR-INVALID-STATE)
      
      ;; Record arbiter decision
      (map-set escrows
        { id: id }
        (merge escrow-data { 
          arbiter-decision: (some release),
          state: STATE-DISPUTED 
        }))
      
      ;; Execute decision
      (if release
          (release-funds id)
          (refund-escrow id)))))

;; Read-only functions
(define-read-only (get-escrow (id uint))
  (map-get? escrows { id: id }))

(define-read-only (get-escrow-balance (id uint))
  (map-get? escrow-balances { id: id }))

(define-read-only (get-next-escrow-id)
  (var-get next-escrow-id))

(define-read-only (get-total-escrows)
  (var-get total-escrows))

(define-read-only (get-total-volume)
  (var-get total-volume))

(define-read-only (is-escrow-participant (id uint) (user principal))
  (match (map-get? escrows { id: id })
    escrow-data (or 
      (is-eq user (get buyer escrow-data))
      (is-eq user (get seller escrow-data))
      (is-eq user (get arbiter escrow-data)))
    false))

;; Administrative functions
(define-public (set-paused (paused-state bool))
  (begin
    (asserts! (is-contract-owner) ERR-UNAUTHORIZED)
    (var-set paused paused-state)
    (ok paused-state)))

(define-public (set-contract-owner (new-owner principal))
  (begin
    (asserts! (is-contract-owner) ERR-UNAUTHORIZED)
    (var-set contract-owner new-owner)
    (ok new-owner)))

;; Emergency withdrawal (only for unclaimed funds after extended timeout)
(define-public (emergency-withdraw (id uint))
  (let (
    (escrow-data (unwrap! (map-get? escrows { id: id }) ERR-ESCROW-NOT-FOUND))
    (balance-data (unwrap! (map-get? escrow-balances { id: id }) ERR-ESCROW-NOT-FOUND))
    (amount (get stx-balance balance-data))
  )
    (begin
      (asserts! (is-contract-owner) ERR-UNAUTHORIZED)
      (asserts! (is-eq (get state escrow-data) STATE-FUNDED) ERR-INVALID-STATE)
      (asserts! (>= stacks-block-height (+ (get timeout-at escrow-data) u4032)) ERR-TIMEOUT-NOT-REACHED) ;; 4 weeks after timeout
      (asserts! (> amount u0) ERR-INSUFFICIENT-FUNDS)
      
      ;; Transfer to contract owner
      (try! (as-contract (stx-transfer? amount tx-sender (var-get contract-owner))))
      
      ;; Update state
      (map-set escrows
        { id: id }
        (merge escrow-data { state: STATE-REFUNDED }))
      
      (map-set escrow-balances
        { id: id }
        { stx-balance: u0 })
      
      (ok amount))))
