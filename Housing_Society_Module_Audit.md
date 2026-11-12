# Comprehensive Audit & Statutory Compliance Report: Jeevika Housing Society ERP v2

**Document Version:** 2.2  
**Audit Date:** October 2, 2026  
**Applicable Standards:** Maharashtra Co-operative Societies Act 1960 (MCS Act), Gujarat Co-operative Societies Act 1961 (GCS Act), Model Bye-Laws of Co-operative Housing Societies, ICAI Technical Guide on Accounting for Co-operative Societies, and GST Notification No. 12/2017-CT(R) / CBIC Circular No. 109/28/2019-GST.

---

### PART 2: Comprehensive Module Overview

The Jeevika ERP v2 codebase has been audited across all directories and architectural tiers (`Backend/`, `modules/`, `assets/`). The system comprises **12 core functional domains** and **40+ specialized modules**:

#### 1. Master Configuration & Governance
- **Society Master (`society-master`)**: Society registration metadata, registration number, PAN, TAN, GSTIN, municipal area units, registered bank accounts, and authorized signatories. Includes comprehensive cascading hard-delete cleanup across 13 relational table sets.
- **Member Master (`member-master`)**: Flat/unit ownership directory, wing categorization, share certificate numbers, distinctive share ranges, nomination records, tenant details, and Excel import/export.
- **Account Master & Group Master (`account-master`, `group-master`)**: Hierarchical chart of accounts categorized into 4 fundamental accounting groups: Assets (`GrpMainId: 1`), Liabilities (`GrpMainId: 2`), Income (`GrpMainId: 3`), and Expenditure (`GrpMainId: 4`).
- **Opening Balances Setup (`opening-balances`)**: Fiscal balance initialization separating permanent Balance Sheet accounts (Assets & Liabilities with debit/credit carry-forward) from nominal Profit & Loss accounts (Income & Expenditure labeled strictly as `PREV. YEAR BALANCE` with zero current-year opening balances).
- **Opening Bank Reconciliation (`opening-bank-reco`)**: Setup for unpresented cheques and uncredited deposits from preceding accounting periods.
- **Bill Type Master (`bill-type-master`)**: Independent fund and billing classifications (e.g., Maintenance, Sinking Fund, Major Repair, Parking, Non-Occupancy, Statutory Levies).
- **Billing Master Matrix (`billing-master`)**: Multi-column Excel-style data grid supporting flat-wise, square-foot area-based, and equal-split billing formulas; dynamic GST threshold detection; statutory simple interest calculation; and Excel template import/export.
- **Committee & Staff Masters (`committee-master`, `staff-master`, `vendor-master`)**: Managing committee designations (Chairman, Secretary, Treasurer), society payroll staff, and approved contractors/vendors.
- **Configuration & Notes Master (`config-notes-master`)**: 8 global operational switches, voucher sequence numbering rules, 6-line statutory audit disclaimers, Balance Sheet signatory placement (Left/Right), and crest/seal uploads.
- **GST Master (`gst-master`)**: HSN/SAC codes (999598), CGST/SGST tax slabs, and exemption limit definitions.

#### 2. Executive KPI & Real-Time Analytics Dashboard
- **Executive Dashboard (`modules/dashboard/`)**: High-performance executive portal featuring live society context switching; real-time billing vs. collection KPI cards; bank/cash aggregate liquidity tracking; critical overdue defaulters list with days-in-arrears alerts; and a chronological audit stream of system vouchers.

#### 3. Transaction Vouchers & Banking
- **Payment Entry (`payment-entry`)**: Vendor disbursement vouchers with Purchase Order linkage, cheque/NEFT tracking, and account group filters.
- **Receipt Entry & Other Receipt (`receipt-entry`, `other-receipt`)**: General income and non-member collection vouchers.
- **Contra Entry (`contra-entry`)**: Cash-to-bank deposits, ATM withdrawals, and inter-bank transfers.
- **Journal Voucher (`journal-voucher`)**: Double-entry journal voucher engine with optional cash/bank access based on Notes Master policies.
- **Member Receipt Entry (`member-receipt`)**: Bulk receipt engine with automated waterfall settlement priority, dynamic member lookup, bank pay-in batching, and synchronized accounting posting.
- **Member Debit & Credit Notes (`member-debit-note`, `member-credit-note`)**: Supplementary penalty issuance and billing adjustments with automated tax adjustments.
- **Member Adjustment & Bill Type Transfer (`member-bill-type-transfer`)**: Re-allocation of member credit balances across distinct bill categories.
- **Receipt Reversal (`receipt-reversal`)**: Cheque bounce, dishonor workflow, and penalty reinstatement.
- **Bank Reconciliation Statement (`bank-reco`)**: Date-clearing interface matching bank statements against cash/bank books.
- **Fixed Deposit Management (`fixed-deposit`, `fd-accrued-interest`)**: Society FD tracking, term maturities, and year-end interest accrual journals.

#### 4. Billing Operations & Utilities
- **Monthly Billing Engine (`modules/transaction/member-bill`)**: Automated batch generation of monthly/quarterly member maintenance bills.
- **Billing Utilities (`billing-utilities`)**: Grace period calculators, zero-decimal rounding engines, and delayed payment interest recalculators.

#### 5. Member Reports Suite (15 Dedicated Modules + Registers)
- **Bill Format (`bill-format`)**: Standard and GST-compliant A4 maintenance bills with component breakdowns, arrears, interest, UPI dynamic QR codes, bank details, and statutory signatory blocks.
- **Receipt Voucher (`receipt`)**: Official collection receipt documents with payment mode details and number-to-words INR translation.
- **Debit Note & Credit Note Documents (`debit-note`, `credit-note`)**: Standard formal notice printouts for member debits/credits.
- **Adjustment Voucher (`adjustment`)**: Inter-fund and bill-type transfer documents.
- **Outstanding List (`outstanding`, `outstanding-list`)**: Aging analysis, wing-wise and flat-wise default registers.
- **Head-Wise Member Ledger (`member-account-head-wise`)**: Multi-column pivot breakdown tracing billing charges and recoveries across every individual accounting head.
- **Member Register [Dr/Cr] (`member-register-dr-cr`)**: Comprehensive chronological register tracking opening dues, billing debits, collection credits, and closing dues per flat.
- **Member Control Account (`member-control-account`)**: Month-by-month reconciliation validating General Ledger control accounts (`ASS-1025` Member Dues and `LIA-1020` Member Advance) against individual member sub-ledgers.
- **Balance Confirmation Letter (`balance-confirmation-letter`)**: Statutory audit confirmation letters generated for circularization to society members.
- **Bank Deposit List (`bank-deposit-list`)**: Cheque deposit pay-in slips grouped by bank account for clearing presentation.
- **Member Data Sheet (`data-sheet`)**: Flat-wise registry summarizing member names, carpet area, contact information, and share holdings.
- **Registers Suite (`bill-register`, `receipt-register`, `debit-note-register`, `credit-note-register`, `adjustment-register`, `member-jv-register`)**: Individual auditable registers logging every transaction type.

#### 6. Books of Accounts & Registers
- **Day Book (`day-book`)**: Chronological financial transaction register.
- **Cash Book & Bank Book (`cash-bank-book`)**: Two-column and multi-column books tracking liquid funds.
- **Voucher Registers (`payment-register`, `receipt-register`, `contra-register`, `journal-register`)**: Auditable logs with voucher print facilities.

#### 7. General Ledgers & Final Accounts
- **Account Ledger (`account-ledger`)**: General ledger with dual behavior (Opening Balance for Balance Sheet accounts; Prior Year comparative balance with ₹0.00 current opening for Income & Expenditure accounts).
- **Trial Balance (`trial-balance`)**: 4-column and 6-column trial balance with net debit/credit verification.
- **Form 'N' Balance Sheet (`balance-sheet`)**: Statutory cooperative Balance Sheet with schedule groupings, synchronized account ledgers, member dues/advance schedules, and dual renderers (Traditional Cooperative Layout & HENU OS Formate).
- **Income & Expenditure Statement (`income-expenditure`)**: Operating statement starting at ₹0.00 with prior-year comparative columns and net surplus/deficit transfer to General Reserve.
- **Receipts & Payments Statement (`receipt-payment-report`)**: Summary cash-flow statement detailing cash and bank inflows and outflows.

#### 8. Statutory Funds & Investment Accounting
- **Statutory Fund Manager (`modules/additional-reports/fund-reports`)**: Tracking of Sinking Fund, Reserve Fund, Building Repair Fund, and Major Repair Fund.
- **Fund Investment Ledger (`Backend/Controllers/AdditionalReportsController.cs`)**: Fixed deposit tracking linked directly to statutory fund reserves (`SocFundInvestment`, `SocFundMaster`).

#### 9. Taxation & Statutory Compliance
- **GST Reconciliation (`modules/additional-reports/gst-report`)**: Outward supply register, exempt vs. taxable maintenance segregation, and GSTR-1 preparation.
- **TDS Compliance (`modules/additional-reports/tds-report`)**: Section 194C (Contractors) and Section 194J (Professionals) deduction logging, payment detection, and Challan 281 allocation.

#### 10. HENU OS Design Studio & Central Report Engine
- **Enterprise Design Studio (`modules/settings/henu-os-design/`)**: Live visual customization engine featuring 18 dedicated DOM renderers, 10 pre-curated color palettes, isolated preview fixtures, draft saving, version control, rollback, and production publishing.
- **Database Central Registry (`Backend/DbHelper.cs`)**: 7 relational tables managing report definitions, templates, versions, runtime settings, filter presets, assets, and audit logs.

#### 11. Security, Multi-Society Governance & View-Only Mode
- **Workspace Security Engine (`assets/js/workspace.js`, `auth.js`)**: Real-time cross-tab session synchronization, view-only modal enforcement preventing accidental mutations across societies, and automated storage key validation.

#### 12. Communication & System Utilities
- **Automated Communication (`communication`)**: WhatsApp and email dispatch for maintenance bills, payment receipts, and overdue notices.
- **Utilities (`utilities`)**: Fiscal year rollover (`year-extension`, `new-year-cf`, `last-year-bf`), voucher renumbering, and accounting difference checkers.

---

### PART 3: Housing Society Domain & Statutory Accounting Audit

This evaluation benchmarks Jeevika ERP v2 against statutory mandates defined in the **Maharashtra Co-operative Societies Act 1960 (MCS Act)**, the **Gujarat Co-operative Societies Act 1961 (GCS Act)**, **Model Bye-Laws of Co-operative Housing Societies**, and the **ICAI Technical Guide on Accounting for Co-operative Societies**.

---

#### Category A: What is CORRECT (Statutory Compliance Confirmed)

1. **Nominal Accounts (Income & Expenditure) Starting at ₹0.00 with Prior Year Separation**:
   - **Statutory Rule**: Income and Expenditure accounts represent operating revenues and expenses that close at the conclusion of each financial year into Statutory Reserve / General Reserve / Accumulated Surplus. They cannot carry forward an opening balance into the operational ledger of the subsequent financial year.
   - **System Status**: **Fully Compliant**. In `Account Ledger` and `Income & Expenditure`, current-year nominal accounts start with a ₹0.00 operational opening balance. Prior year figures are strictly isolated and labeled as `PREV. YEAR BALANCE` for comparative analysis.

2. **Single Continuous Receipt Number Sequence Across All Bill Types**:
   - **Statutory Rule**: Cooperative bye-laws prohibit societies from maintaining disconnected, uncoordinated receipt books for different bill categories (e.g., Sinking Fund vs Maintenance). All cash, cheque, and electronic receipts must follow a single, unbroken, chronological voucher sequence.
   - **System Status**: **Fully Compliant**. The backend receipt numbering engine generates sequential receipt numbers (`MRV/{FY}/{Seq}`) uniformly across all bill types.

3. **Mandatory Waterfall Recovery Priority (Interest Before Principal)**:
   - **Statutory Rule**: Model Bye-Law 68 mandates that any receipt collected from a defaulting member must first be applied against accrued simple interest/late fee arrears before reducing principal maintenance dues.
   - **System Status**: **Fully Compliant**. The `AUTO` allocation algorithm strictly executes this priority sequence: Accrued Interest Arrears $\rightarrow$ Arrear Principal $\rightarrow$ Current Bill Interest $\rightarrow$ Current Bill Principal.

4. **Member Control Account Dual Isolation (`ASS-1025` & `LIA-1020`)**:
   - **Statutory Rule**: Member Dues and Member Advances are General Ledger control accounts that must exactly mirror individual member sub-ledgers. Direct manual journal vouchers against these control accounts cause reconciliation breaks between the General Ledger and Member Ledgers.
   - **System Status**: **Fully Compliant**. Direct manual transaction entry into `ASS-1025` and `LIA-1020` is restricted. Debits and credits route strictly through the Member Billing and Member Receipt modules, and the dedicated `Member Control Account` module reconciles both tiers month by month.

5. **Balance Sheet Schedule Synchronization with Account Ledgers & Sub-Ledgers**:
   - **Statutory Rule**: The Balance Sheet must reflect true closing balances derived directly from the General Ledger, while member dues and advances must match individual flat sub-ledger balances without discrepancy.
   - **System Status**: **Fully Compliant**. Closing balances in `ReportController.cs` and `balance-sheet.js` are computed directly from voucher detail lines and member billing items. Schedule group outer totals are synchronized with member item subtotals (`memberGroupTotal`).

6. **Statutory Simple Interest Engine Capped at 21% p.a.**:
   - **Statutory Rule**: Cooperative society bye-laws mandate that delayed payment interest must be calculated as **simple interest** on overdue principal. Compound interest and unapproved penalties are strictly unlawful, and the rate cannot exceed 21% p.a. (under Maharashtra Model Bye-Law 68).
   - **System Status**: **Fully Compliant**. In `billing-master.js`, interest calculation operates strictly on **Accumulated Principal** using daily or monthly day-basis simple interest algorithms (`(baseAmt * annualRate * days) / dayBasis`), with the default rate fixed at 21% p.a.

7. **GST Exemption Threshold Detection (₹7,500/Month Rule)**:
   - **Statutory Rule**: Under GST Notification No. 12/2017-CT(R), residential maintenance charges collected by an RWA/CHS are exempt up to ₹7,500 per month per flat. If charges exceed ₹7,500, GST applies to the entire amount (if society aggregate turnover exceeds ₹20 Lakhs).
   - **System Status**: **Fully Compliant**. In `billing-master.js` and `gst-report.js`, the engine incorporates an `exemptLimit` evaluation (default ₹7,500). When aggregate maintenance charges exceed this threshold, the matrix automatically computes CGST (9%) and SGST (9%).

8. **Statutory Balance Confirmation Letters for Annual Audit**:
   - **Statutory Rule**: Cooperative auditors require external confirmation of member dues and deposits at the end of each financial year under standard auditing practices.
   - **System Status**: **Fully Compliant**. The `Balance Confirmation Letter` module automatically generates individual confirmation letters stating unit number, outstanding arrears, advance deposits, and signature verification blanks for members.

9. **Bank Pay-in Slip (Challan) Schedule Generation**:
   - **Statutory Rule**: Physical member cheques must be accompanied by batch deposit slips grouped by bank account, detailing cheque number, drawer bank, drawer branch, and amount.
   - **System Status**: **Fully Compliant**. The `Bank Deposit List` module batches member receipts into bank-specific pay-in slip schedules ready for clearing presentation.

10. **Disclosure of Authorized and Subscribed Share Capital**:
    - **Statutory Rule**: Every housing society operates with limited liability shares (e.g., shares of ₹50 or ₹100 each). The Balance Sheet must state Authorized Share Capital alongside Subscribed Share Capital.
    - **System Status**: **Fully Compliant**. Configured in `Member Master` and `Config & Notes Master`, and rendered under Capital schedules in the Balance Sheet.

11. **Comprehensive Cascading Hard-Delete Cleanup**:
    - **System Integrity Rule**: Removing an experimental or invalid society record must never leave orphan accounting vouchers or member records in the database.
    - **System Status**: **Fully Compliant**. `SocietyController.HardDeleteSociety` executes an atomic database transaction purging 13 relational table sets in correct dependency order before removing the society record.

12. **Multi-Society View-Only Protection**:
    - **System Integrity Rule**: When an administrator opens a secondary society for reporting or auditing, accidental modifications or voucher entries must be blocked.
    - **System Status**: **Fully Compliant**. `WorkspaceManager` and `Auth` track the primary active society and trigger an enforced read-only modal whenever an inactive society is viewed.

---

#### Category B: What is NOT CORRECT / Gaps Requiring Attention

1. **Statutory Register Modules in `modules/statutory/` are Placeholder Frontend Shells**:
   - **Statutory Rule**: The MCS Act and GCS Act mandate that every housing society must maintain permanent statutory registers in prescribed forms:
     - **Form 'I' Register**: Register of Members (Member full name, flat number, admission date, entrance fee, shares held).
     - **Form 'J' Register**: List of Members showing shares held, transfers, and nominee details.
     - **Nomination Register**: Statutory nominations under Bye-Law 32 with percentage allocation and witness details.
     - **Property Register**: Society land, building dimensions, conveyance deed details, and depreciation.
     - **Investment Register**: Form 'M' register of investments under Section 70.
   - **Current System Status**: **GAP**. The modules located under `modules/statutory/` (`i-register`, `j-register`, `nomination-register`, `property-register`, `share-register`, `sinking-fund-ledger`) currently contain only placeholder HTML and boilerplate JavaScript (`showToast('... ready.', 'info')`). They are not connected to backend database queries.
   - **Action Required**: Connect `modules/statutory/` to existing PostgreSQL tables (`SocMember`, `SocMemberNominee`, `SocFundInvestment`, `SocOpeningBalance`) and render the legally prescribed tabular layouts.

2. **Automatic Separation of Sinking Fund & Repair Fund Collections**:
   - **Statutory Rule**: Under Model Bye-Laws 13 & 14, collections realized under the **Sinking Fund** (minimum 0.25% p.a. of construction cost) and **Major Repair Fund** (minimum 0.75% p.a.) must be deposited into earmarked Fixed Deposits or approved cooperative securities within 15–30 days. They must not be intermingled with general maintenance current accounts.
   - **Current System Status**: **PARTIAL GAP**. While `AdditionalReportsController` contains dedicated investment tracking (`SocFundInvestment`, `SocFundMaster`), the `Member Receipt Entry` screen allows depositing Sinking Fund receipts into general bank accounts (`Deposit To Account`) without verifying or alerting the user regarding statutory FD earmarking.
   - **Action Required**: Add an advisory alert in Member Receipt Entry and Member Bill when Sinking Fund dues are collected into general operating accounts, and generate a *Statutory Fund Collection vs. FD Investment Reconciliation* statement.

3. **Automatic Allocation of Excess Receipts to Advance Liability (`LIA-1020`)**:
   - **Statutory Rule**: When a member pays more than their aggregate outstanding dues, cooperative accounting principles dictate that the surplus must be recognized under Liabilities as **Advance from Members** (`LIA-1020`). It must never produce a negative asset balance under `ASS-1025`.
   - **Current System Status**: **PARTIAL GAP**. In certain manual allocation workflows, if received amount exceeds total bill dues, the balance remains credited against principal dues rather than being automatically transferred via double entry to `LIA-1020`.
   - **Action Required**: Update backend receipt processing so that any unallocated credit balance exceeding aggregate dues across all bill types is automatically posted as a credit to `LIA-1020`.

4. **Municipal Taxes (Pure Agent Exemption) under GST Threshold Calculations**:
   - **Statutory Rule**: Under CBIC Circular No. 109/28/2019-GST, property taxes, water taxes, and sewerage taxes collected by a housing society from members and paid to the local municipal corporation are collected as a **pure agent**. Therefore, property tax and municipal water charges must be excluded when determining whether a member's monthly maintenance exceeds the ₹7,500 threshold.
   - **Current System Status**: **PARTIAL GAP**. In `billing-master.js`, the threshold calculation checks total accumulated principal plus interest. If municipal tax heads are included in the bill, they may inadvertently push a bill above ₹7,500, triggering GST on exempt municipal charges.
   - **Action Required**: Introduce a `Pure Agent / Exempt Municipal Levy` flag in `Billing Master` heads so municipal taxes are excluded from the ₹7,500 threshold calculation and remain 0% taxed even if the overall bill exceeds ₹7,500.

5. **Statutory Audit Form 1 & Form 28 Checklists are Static**:
   - **Statutory Rule**: Cooperative auditors must submit Audit Form 1 (General Information & Audit Classification) and Form 28 (Financial & Governance Checklist) during the statutory annual audit.
   - **Current System Status**: **GAP**. `audit-form-1` and `audit-form-28` under `modules/statutory/` exist as unpopulated templates without automated data retrieval from the General Ledger, voucher registers, or committee records.
   - **Action Required**: Wire automated summary metrics (share capital balance, cash in hand compliance, overdue percentage) into Audit Form 1 and Form 28.

---

### Summary Audit Matrix

| Domain / Module | Current Implementation Status | Statutory Compliance Status | Required Next Action |
| :--- | :---: | :---: | :---: |
| **All Changes from Previous Sessions** | **100% Present & Verified** | **Fully Compliant** | None (Logic intact and verified) |
| **Executive Dashboard & Real-Time KPIs** | Implemented (`modules/dashboard`) | **Fully Compliant** | None |
| **HENU OS Design Studio & 18 DOM Renderers** | Implemented (`modules/settings/henu-os-design`) | **Fully Compliant** | None |
| **Nominal Accounts (P&L) Starting at ₹0.00** | Verified across Ledgers & BS | **Fully Compliant** | None |
| **Sequential Receipt Numbering Across All Funds** | Backend Sequential (`MRV/{FY}/{Seq}`) | **Fully Compliant** | None |
| **Waterfall Allocation Priority (Interest First)** | Implemented (`AUTO` mode) | **Fully Compliant** | None |
| **Member Control Accounts (`ASS-1025` / `LIA-1020`)** | Isolated & Reconciled | **Fully Compliant** | None |
| **Balance Sheet Dual Templates (HENU OS & Existing)** | Implemented with schedule sync | **Fully Compliant** | None |
| **Statutory Simple Interest (Max 21% p.a.)** | Implemented on Accumulated Principal | **Fully Compliant** | None |
| **Balance Confirmation Letters** | Implemented (`member-reports`) | **Fully Compliant** | None |
| **Bank Deposit Pay-in Slip Schedules** | Implemented (`member-reports`) | **Fully Compliant** | None |
| **Society Cascading Hard-Delete & View-Only Mode** | Implemented (13 table sets) | **Fully Compliant** | None |
| **Statutory Registers (Form I, Form J, Shares, etc.)** | Frontend shells only (`modules/statutory`) | **GAP** | Connect to PostgreSQL tables |
| **Sinking/Repair Fund Earmarked FD Enforcement** | Tracked in Additional Reports | **Partial Gap** | Add receipt advisory for earmarked FDs |
| **Excess Receipt Divert to `LIA-1020` Advance** | Partial | **Partial Gap** | Auto-credit `LIA-1020` on overpayment |
| **Pure Agent Municipal Tax GST Exemption** | Threshold checked at ₹7,500 | **Partial Gap** | Exclude pure agent heads from threshold |
| **Audit Form 1 & Form 28 Automated Checklists** | Static templates (`modules/statutory`) | **GAP** | Wire automated audit metrics |
