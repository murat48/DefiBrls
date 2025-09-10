;; DefiBrls STX Savings Account Contract
;; Interest-bearing savings contract with deposit and withdrawal functionality

;; Error codes
(define-constant ERR-UNAUTHORIZED (err u4001))
(define-constant ERR-ACCOUNT-NOT-FOUND (err u4002))
(define-constant ERR-ACCOUNT-EXISTS (err u4003))
(define-constant ERR-INVALID-AMOUNT (err u4004))
(define-constant ERR-INSUFFICIENT-BALANCE (err u4005))
(define-constant ERR-WITHDRAWAL-TOO-EARLY (err u4006))
(define-constant ERR-TRANSFER-FAILED (err u4007))
(define-constant ERR-INTEREST-CALCULATION-FAILED (err u4008))
(define-constant ERR-CONTRACT-PAUSED (err u4009))
(define-constant ERR-INVALID-INTEREST-RATE (err u4010))

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant MIN-DEPOSIT u1000000) ;; Minimum 0.01 STX
(define-constant MIN-LOCK-PERIOD u144) ;; Minimum 24 hours (144 blocks)
(define-constant MAX-LOCK-PERIOD u52560) ;; Maximum 1 year (365 days)
(define-constant BASE-INTEREST-RATE u5) ;; 5% annual base rate
(define-constant BONUS-RATE-PER_MONTH u1) ;; Additional 1% per month locked
(define-constant SECONDS_PER_BLOCK u600) ;; 10 minutes per block
(define-constant BLOCKS_PER_YEAR u52560) ;; Approximately 365 days
(define-constant PRECISION u100000000) ;; 8 decimal places for calculations

;; Account structure
(define-map savings-accounts
  { owner: principal }
  {
    balance: uint,
    deposited-at: uint,
    last-interest-claim: uint,
    lock-period: uint,
    total-deposited: uint,
    total-interest-earned: uint,
    is-locked: bool
  })

;; Contract state
(define-data-var contract-owner principal CONTRACT-OWNER)
(define-data-var paused bool false)
(define-data-var total-deposits uint u0)
(define-data-var total-accounts uint u0)
(define-data-var total-interest-paid uint u0)
(define-data-var base-interest-rate uint BASE-INTEREST-RATE)
(define-data-var contract-reserve uint u0)

;; Interest rate tiers based on lock period (in blocks)
(define-map interest-rate-tiers
  { min-lock-period: uint }
  { rate-bonus: uint })

;; Events
(define-private (emit-deposit (owner principal) (amount uint) (new-balance uint))
  (print {
    event: "deposit",
    owner: owner,
    amount: amount,
    new-balance: new-balance,
    stacks-block-height: stacks-block-height
  }))

(define-private (emit-withdrawal (owner principal) (amount uint) (remaining-balance uint))
  (print {
    event: "withdrawal",
    owner: owner,
    amount: amount,
    remaining-balance: remaining-balance,
    stacks-block-height: stacks-block-height
  }))

(define-private (emit-interest-claim (owner principal) (interest uint))
  (print {
    event: "interest-claim",
    owner: owner,
    interest: interest,
    stacks-block-height: stacks-block-height
  }))

;; Helper functions
(define-read-only (is-contract-owner)
  (is-eq tx-sender (var-get contract-owner)))

(define-read-only (is-paused)
  (var-get paused))

;; Calculate interest based on lock period and time elapsed
(define-read-only (calculate-interest (principal-amount uint) (lock-period uint) (time-elapsed uint))
  (let (
    (base-rate (var-get base-interest-rate))
    (lock-bonus (calculate-lock-bonus lock-period))
    (total-rate (+ base-rate lock-bonus))
    (annual-interest (/ (* principal-amount total-rate) u100))
    (time-fraction (/ (* time-elapsed PRECISION) BLOCKS_PER_YEAR))
    (interest (/ (* annual-interest time-fraction) PRECISION))
  )
    (ok interest)))

;; Calculate bonus rate based on lock period
(define-read-only (calculate-lock-bonus (lock-period uint))
  (let ((months-locked (/ lock-period u4380))) ;; ~30 days per month
    (* months-locked BONUS-RATE-PER_MONTH)))

;; Get effective interest rate for a lock period
(define-read-only (get-effective-rate (lock-period uint))
  (+ (var-get base-interest-rate) (calculate-lock-bonus lock-period)))

;; Create savings account
(define-public (create-account (lock-period uint))
  (begin
    (asserts! (not (is-paused)) ERR-CONTRACT-PAUSED)
    (asserts! (is-none (map-get? savings-accounts { owner: tx-sender })) ERR-ACCOUNT-EXISTS)
    (asserts! (>= lock-period MIN-LOCK-PERIOD) ERR-INVALID-AMOUNT)
    (asserts! (<= lock-period MAX-LOCK-PERIOD) ERR-INVALID-AMOUNT)
    
    ;; Create account
    (map-set savings-accounts
      { owner: tx-sender }
      {
        balance: u0,
        deposited-at: stacks-block-height,
        last-interest-claim: stacks-block-height,
        lock-period: lock-period,
        total-deposited: u0,
        total-interest-earned: u0,
        is-locked: false
      })
    
    (var-set total-accounts (+ (var-get total-accounts) u1))
    (ok true)))

;; Deposit STX into savings account
(define-public (deposit (amount uint))
  (let (
    (account-data (unwrap! (map-get? savings-accounts { owner: tx-sender }) ERR-ACCOUNT-NOT-FOUND))
    (new-balance (+ (get balance account-data) amount))
  )
    (begin
      (asserts! (not (is-paused)) ERR-CONTRACT-PAUSED)
      (asserts! (>= amount MIN-DEPOSIT) ERR-INVALID-AMOUNT)
      
      ;; Transfer STX to contract
      (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
      
      ;; Update account
      (map-set savings-accounts
        { owner: tx-sender }
        (merge account-data {
          balance: new-balance,
          total-deposited: (+ (get total-deposited account-data) amount),
          deposited-at: stacks-block-height,
          is-locked: true
        }))
      
      ;; Update contract state
      (var-set total-deposits (+ (var-get total-deposits) amount))
      
      (emit-deposit tx-sender amount new-balance)
      (ok new-balance))))

;; Calculate current interest earned
(define-read-only (get-accrued-interest (owner principal))
  (match (map-get? savings-accounts { owner: owner })
    account-data (let (
      (time-elapsed (- stacks-block-height (get last-interest-claim account-data)))
      (principal-amount (get balance account-data))
      (lock-period (get lock-period account-data))
    )
      (if (> principal-amount u0)
          (unwrap-panic (calculate-interest principal-amount lock-period time-elapsed))
          u0))
    u0))

;; Claim accrued interest
(define-public (claim-interest)
  (let (
    (account-data (unwrap! (map-get? savings-accounts { owner: tx-sender }) ERR-ACCOUNT-NOT-FOUND))
    (accrued-interest (get-accrued-interest tx-sender))
  )
    (begin
      (asserts! (not (is-paused)) ERR-CONTRACT-PAUSED)
      (asserts! (> accrued-interest u0) ERR-INVALID-AMOUNT)
      
      ;; Check contract has enough reserve
      (asserts! (>= (stx-get-balance (as-contract tx-sender)) accrued-interest) ERR-INSUFFICIENT-BALANCE)
      
      ;; Transfer interest to user
      (try! (as-contract (stx-transfer? accrued-interest tx-sender tx-sender)))
      
      ;; Update account
      (map-set savings-accounts
        { owner: tx-sender }
        (merge account-data {
          last-interest-claim: stacks-block-height,
          total-interest-earned: (+ (get total-interest-earned account-data) accrued-interest)
        }))
      
      ;; Update contract state
      (var-set total-interest-paid (+ (var-get total-interest-paid) accrued-interest))
      
      (emit-interest-claim tx-sender accrued-interest)
      (ok accrued-interest))))

;; Withdraw from savings account
(define-public (withdraw (amount uint))
  (let (
    (account-data (unwrap! (map-get? savings-accounts { owner: tx-sender }) ERR-ACCOUNT-NOT-FOUND))
    (current-balance (get balance account-data))
    (lock-end (+ (get deposited-at account-data) (get lock-period account-data)))
    (remaining-balance (- current-balance amount))
  )
    (begin
      (asserts! (not (is-paused)) ERR-CONTRACT-PAUSED)
      (asserts! (> amount u0) ERR-INVALID-AMOUNT)
      (asserts! (>= current-balance amount) ERR-INSUFFICIENT-BALANCE)
      
      ;; Check if lock period has ended (allow early withdrawal with penalty)
      (let ((is-early-withdrawal (< stacks-block-height lock-end)))
        (begin
          ;; Apply early withdrawal penalty if applicable
          (let ((withdrawal-amount 
                  (if is-early-withdrawal
                      ;; 10% early withdrawal penalty
                      (- amount (/ amount u10))
                      amount)))
            
            ;; Transfer STX to user
            (try! (as-contract (stx-transfer? withdrawal-amount tx-sender tx-sender)))
            
            ;; Update account
            (map-set savings-accounts
              { owner: tx-sender }
              (merge account-data {
                balance: remaining-balance,
                is-locked: (if (is-eq remaining-balance u0) false (get is-locked account-data))
              }))
            
            ;; Update contract state
            (var-set total-deposits (- (var-get total-deposits) amount))
            
            (emit-withdrawal tx-sender withdrawal-amount remaining-balance)
            (ok withdrawal-amount)))))))

;; Close account and withdraw all funds
(define-public (close-account)
  (let (
    (account-data (unwrap! (map-get? savings-accounts { owner: tx-sender }) ERR-ACCOUNT-NOT-FOUND))
    (total-balance (get balance account-data))
    (accrued-interest (get-accrued-interest tx-sender))
  )
    (begin
      (asserts! (not (is-paused)) ERR-CONTRACT-PAUSED)
      
      ;; First claim any accrued interest
      (if (> accrued-interest u0)
          (try! (claim-interest))
          u0)
      
      ;; Then withdraw all principal
      (if (> total-balance u0)
          (try! (withdraw total-balance))
          u0)
      
      ;; Remove account
      (map-delete savings-accounts { owner: tx-sender })
      (var-set total-accounts (- (var-get total-accounts) u1))
      
      (ok total-balance))))

;; Emergency withdraw (forfeit all interest)
(define-public (emergency-withdraw)
  (let (
    (account-data (unwrap! (map-get? savings-accounts { owner: tx-sender }) ERR-ACCOUNT-NOT-FOUND))
    (principal-balance (get balance account-data))
  )
    (begin
      (asserts! (not (is-paused)) ERR-CONTRACT-PAUSED)
      (asserts! (> principal-balance u0) ERR-INSUFFICIENT-BALANCE)
      
      ;; Transfer only principal (no interest)
      (try! (as-contract (stx-transfer? principal-balance tx-sender tx-sender)))
      
      ;; Close account
      (map-delete savings-accounts { owner: tx-sender })
      
      ;; Update contract state
      (var-set total-deposits (- (var-get total-deposits) principal-balance))
      (var-set total-accounts (- (var-get total-accounts) u1))
      
      (emit-withdrawal tx-sender principal-balance u0)
      (ok principal-balance))))

;; Read-only functions
(define-read-only (get-account (owner principal))
  (map-get? savings-accounts { owner: owner }))

(define-read-only (get-account-balance (owner principal))
  (default-to u0 (get balance (map-get? savings-accounts { owner: owner }))))

(define-read-only (get-total-value (owner principal))
  (+ (get-account-balance owner) (get-accrued-interest owner)))

(define-read-only (is-account-locked (owner principal))
  (match (map-get? savings-accounts { owner: owner })
    account-data (and 
      (get is-locked account-data)
      (< stacks-block-height (+ (get deposited-at account-data) (get lock-period account-data))))
    false))

(define-read-only (get-lock-time-remaining (owner principal))
  (match (map-get? savings-accounts { owner: owner })
    account-data (let ((lock-end (+ (get deposited-at account-data) (get lock-period account-data))))
      (if (> lock-end stacks-block-height)
          (- lock-end stacks-block-height)
          u0))
    u0))

(define-read-only (get-contract-stats)
  {
    total-deposits: (var-get total-deposits),
    total-accounts: (var-get total-accounts),
    total-interest-paid: (var-get total-interest-paid),
    contract-balance: (stx-get-balance (as-contract tx-sender)),
    base-interest-rate: (var-get base-interest-rate)
  })

;; Administrative functions
(define-public (set-paused (paused-state bool))
  (begin
    (asserts! (is-contract-owner) ERR-UNAUTHORIZED)
    (var-set paused paused-state)
    (ok paused-state)))

(define-public (set-base-interest-rate (new-rate uint))
  (begin
    (asserts! (is-contract-owner) ERR-UNAUTHORIZED)
    (asserts! (<= new-rate u20) ERR-INVALID-INTEREST-RATE) ;; Max 20% annual rate
    (var-set base-interest-rate new-rate)
    (ok new-rate)))

(define-public (add-reserve (amount uint))
  (begin
    (asserts! (is-contract-owner) ERR-UNAUTHORIZED)
    (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
    (var-set contract-reserve (+ (var-get contract-reserve) amount))
    (ok amount)))

(define-public (set-contract-owner (new-owner principal))
  (begin
    (asserts! (is-contract-owner) ERR-UNAUTHORIZED)
    (var-set contract-owner new-owner)
    (ok new-owner)))

;; Initialize interest rate tiers
(map-set interest-rate-tiers { min-lock-period: u144 } { rate-bonus: u0 })    ;; 1 day: +0%
(map-set interest-rate-tiers { min-lock-period: u1008 } { rate-bonus: u1 })   ;; 1 week: +1%
(map-set interest-rate-tiers { min-lock-period: u4320 } { rate-bonus: u3 })   ;; 1 month: +3%
(map-set interest-rate-tiers { min-lock-period: u12960 } { rate-bonus: u6 })  ;; 3 months: +6%
(map-set interest-rate-tiers { min-lock-period: u26280 } { rate-bonus: u10 }) ;; 6 months: +10%
(map-set interest-rate-tiers { min-lock-period: u52560 } { rate-bonus: u15 }) ;; 1 year: +15%
