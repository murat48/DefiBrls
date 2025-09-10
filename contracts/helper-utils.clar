;; DefiBrls Helper Utilities Contract
;; Provides common utility functions used across DeFi contracts

;; Error codes
(define-constant ERR-UNAUTHORIZED (err u1001))
(define-constant ERR-INVALID-AMOUNT (err u1002))
(define-constant ERR-INSUFFICIENT-BALANCE (err u1003))
(define-constant ERR-DIVISION-BY-ZERO (err u1004))
(define-constant ERR-OVERFLOW (err u1005))

;; Constants
(define-constant ONE_8 u100000000) ;; 10^8 for 8-decimal precision
(define-constant SECONDS_PER_YEAR u31536000) ;; 365 * 24 * 60 * 60
(define-constant BLOCKS-PER-YEAR u52560) ;; Approximate blocks per year

;; Safe math functions with overflow protection
(define-read-only (safe-add (a uint) (b uint))
  (let ((result (+ a b)))
    (if (>= result a)
        (ok result)
        ERR-OVERFLOW)))

(define-read-only (safe-sub (a uint) (b uint))
  (if (>= a b)
      (ok (- a b))
      ERR-INSUFFICIENT-BALANCE))

(define-read-only (safe-mul (a uint) (b uint))
  (let ((result (* a b)))
    (if (or (is-eq a u0) (is-eq (/ result a) b))
        (ok result)
        ERR-OVERFLOW)))

(define-read-only (safe-div (a uint) (b uint))
  (if (> b u0)
      (ok (/ a b))
      ERR-DIVISION-BY-ZERO))

;; Calculate percentage with 8-decimal precision
;; Returns (amount * percentage) / 100
(define-read-only (calculate-percentage (amount uint) (percentage uint))
  (let ((result (/ (* amount percentage) u100)))
    (ok result)))

;; Calculate compound interest with annual rate
;; Formula: principal * (1 + rate/100)^time_in_years
;; Simplified for basic interest: principal + (principal * rate * time) / (100 * seconds_per_year)
;; Calculate time-based interest with compound effect
(define-read-only (calculate-interest (principal uint) (rate uint) (start-height uint))
  (let ((blocks-elapsed 
         (if (> stacks-block-height start-height)
             (- stacks-block-height start-height)
             u0)))
    (let ((periods (/ blocks-elapsed BLOCKS-PER-YEAR)))
      (if (is-eq periods u0)
          u0
          (let ((compound-factor (pow (+ u10000 rate) periods)))
            (/ (* principal (- compound-factor u10000)) u10000))))))

;; Validate amount is positive
(define-read-only (is-valid-amount (amount uint))
  (> amount u0))

;; Get current block height
;; Helper function to get current block height
(define-read-only (get-block-height)
  stacks-block-height)

;; Calculate time difference in blocks
(define-read-only (get-time-diff (start-height uint))
  (- stacks-block-height start-height))

;; Convert blocks to approximate seconds (assuming 10-minute blocks)
(define-read-only (blocks-to-seconds (blocks uint))
  (* blocks u600)) ;; 600 seconds = 10 minutes

;; Validate principal is not zero for interest calculations
(define-read-only (is-valid-principal (amount uint))
  (and (> amount u0) (<= amount u1000000000000))) ;; Max 10^12 to prevent overflow

;; Get contract balance utility
(define-read-only (get-contract-stx-balance)
  (stx-get-balance (as-contract tx-sender)))

;; Emergency stop functionality (can be extended by inheriting contracts)
(define-data-var emergency-stop bool false)
(define-data-var contract-owner principal tx-sender)

(define-read-only (is-emergency-stopped)
  (var-get emergency-stop))

(define-read-only (is-contract-owner)
  (is-eq tx-sender (var-get contract-owner)))

(define-public (set-emergency-stop (stop bool))
  (begin
    (asserts! (is-contract-owner) ERR-UNAUTHORIZED)
    (var-set emergency-stop stop)
    (ok stop)))

(define-public (transfer-ownership (new-owner principal))
  (begin
    (asserts! (is-contract-owner) ERR-UNAUTHORIZED)
    (var-set contract-owner new-owner)
    (ok new-owner)))
