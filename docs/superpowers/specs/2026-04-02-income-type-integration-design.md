# Income Type Integration Design

## Context

Budgeter currently models transactions with a top-level `type` of `income` or `expense` plus a shared `category` field. That works for expense budgeting, but it does not let users distinguish between different kinds of income such as salary, meal tickets, bonuses, gifts, or refunds.

The requested change is to make income classification a first-class part of the product, fully integrated into entry, editing, filtering, recurring transactions, CSV import/export, persistence, snapshots, and ledger display.

## Goals

- Let users assign a clear income subtype when creating or editing income transactions.
- Use a fixed built-in list of income types rather than a customizable taxonomy.
- Preserve the current expense category and budgeting model without mixing income semantics into expense budgets.
- Make income subtype visible and filterable in the ledger and other transaction workflows.
- Keep existing data valid after migration, including older income rows that do not yet have a subtype.

## Non-Goals

- No custom income-type management in Settings.
- No changes to expense category budgeting rules.
- No redesign of analytics to create a full income breakdown dashboard in this iteration.
- No automatic backfill of old income rows beyond a safe default display state.

## Recommended Model

### Separate Income Subtype Field

Add a dedicated `incomeSource` field instead of reusing `category`.

This keeps the domain model coherent:

- `category` continues to mean an expense classification used by budgets, analytics, payee rules, and CSV defaults.
- `incomeSource` means the origin or kind of income and applies only when `type === 'income'`.

This avoids corrupting existing expense-oriented assumptions throughout the codebase.

## Income Type Vocabulary

Budgeter will ship with this fixed list:

- `Salary`
- `Meal Tickets`
- `Bonus`
- `Gift`
- `Refund`
- `Other`

Implementation should store stable values in code and render user-facing labels from a shared constant list. The initial version should not allow freeform values.

## Data Model Changes

### Shared Types

- Extend `Transaction` with `incomeSource: IncomeSource | null`.
- Extend `TransactionInput` with `incomeSource?: IncomeSource | null`.
- Change transaction `category` handling so it is required for expenses and nullable for incomes.
- Extend `RecurringTransaction` with `incomeSource: IncomeSource | null`.
- Extend `RecurringTransactionInput` with `incomeSource?: IncomeSource | null`.
- Change recurring transaction `category` handling so it is required for expenses and nullable for incomes.
- Extend `TransactionFilters` with `incomeSource?: IncomeSource | 'all'`.
- Introduce a shared `IncomeSource` union derived from the fixed constant list.

### SQLite

Add nullable `income_source TEXT` to:

- `transactions`
- `recurring_transactions`

Also relax transaction `category` storage so it can be `NULL` for income rows while remaining required for expense rows at the application layer.

The intended storage rules are:

- expense rows: `category` required, `income_source` must be `NULL`
- income rows: `income_source` required, `category` should be `NULL`

Null values are therefore valid for:

- `income_source` on all expense rows
- `income_source` on old income rows created before this feature
- `category` on new or edited income rows

Validation rules:

- if `type === 'income'`, `income_source` is required on all newly created or edited rows
- if `type === 'income'`, `category` must be normalized to `NULL`
- if `type === 'expense'`, `income_source` must be stored as `NULL`
- if `type === 'expense'`, `category` remains required

### Migration

Add a safe schema migration that:

- adds `income_source` to `transactions` if missing
- adds `income_source` to `recurring_transactions` if missing
- rebuilds or migrates the transaction tables as needed so `category` can be null for income rows
- leaves existing rows otherwise unchanged

Existing historical income rows with `NULL` subtype should render as `Unspecified` in the UI until the user edits them.

## UI Design

### Transaction Dialog

Keep the existing top-level `Expense` / `Income` switch.

When `Expense` is selected:

- show the existing expense category input
- hide the income type input
- clear any previously selected income type from form state

When `Income` is selected:

- show a required `Income Type` select using the fixed list
- hide the expense category input
- persist `category` as `NULL` so users are not forced to assign expense categories to income rows

The dialog should make the distinction obvious:

- `Type` answers whether money is coming in or going out
- `Income Type` answers what kind of incoming money it is

### Inline Ledger Editing

Inline edit mode on the Transactions page must support:

- switching between expense and income
- editing `incomeSource` for income rows
- clearing `incomeSource` when switching an edited row back to expense
- clearing `category` when switching an edited row from expense to income

### Ledger Display

The ledger should expose income subtype as normal data, not hidden metadata.

Recommended display:

- keep the existing `Type` column
- render income rows as `Income - Salary`, `Income - Bonus`, and so on
- render legacy income rows without a subtype as `Income - Unspecified`
- render expense rows as `Expense`

This preserves table density without adding another always-visible column.

### Filters

Add an income-type filter to the Transactions page.

Behavior:

- `All Income Types` by default
- active when showing all rows or income rows
- ignored when filtering to `expense` only

This filter should combine cleanly with:

- search
- transaction type
- date range
- amount range
- sorting

### Recurring Transactions

Recurring transaction forms and storage must include `incomeSource` for recurring income entries.

Behavior mirrors the standard transaction dialog:

- recurring expenses keep categories only
- recurring income entries require an income subtype
- recurring income entries persist `category` as `NULL`

### CSV Import and Export

CSV import:

- support an optional mapped income-type column if present
- preserve current signed-amount logic for deciding `income` vs `expense`
- when a row resolves to `income`, parse the mapped income type if available
- when a row resolves to `income`, set `category` to `NULL`
- when a row resolves to `expense`, require or infer an expense category as today
- if a CSV income row lacks a valid subtype, default to `Other` during preview unless the row is invalid for another reason

CSV export:

- add an `incomeSource` column
- export empty value for expense rows

## Search, Sorting, and Persistence

### Search

Transaction search should include `incomeSource` text for income rows so queries like `salary` or `bonus` return matching entries.

### Sorting

The initial implementation does not need a separate sort column for income subtype. Sorting can continue to use the existing `type` column while subtype remains filterable and visible in the rendered label.

If subtype sorting becomes a real user need later, it can be added without changing the underlying model.

### Snapshots and Restore

Application snapshots must include the new field for:

- transactions
- recurring transactions

Restore logic must accept snapshots that do not contain `incomeSource` and normalize those values to `NULL`.

Restore logic must also accept older transaction payloads that still include a non-null `category` on income rows and leave them readable until a later edit normalizes them.

## Analytics and Budget Impact

Budgets and current expense analytics should remain unchanged.

Rules:

- expense budgets continue to aggregate only expense `category`
- dashboard and analytics expense charts continue to ignore income subtype
- summary cards still calculate total income from all income transactions regardless of subtype

This keeps the feature scoped to classification and ledger usability, not a wider reporting rewrite.

## Validation Rules

Validation must cover both renderer and database boundaries.

Required behavior:

- amount must remain greater than zero
- income rows require a valid `incomeSource`
- income rows must not retain stale expense categories
- expense rows must not retain stale `incomeSource`
- legacy rows with null subtype remain readable but become normalized once edited and re-saved

## Payee Rules

Existing payee rules stay category-only for this iteration.

Reasoning:

- they currently support manual entry and CSV import for expense categorization
- extending them to infer income subtype adds a second rule system and more ambiguous behavior

If smart income-source inference is needed later, it should be designed as a separate follow-up.

## Implementation Outline

1. Add shared income-source constants and type definitions.
2. Extend shared transaction and recurring types with `incomeSource`.
3. Add database migrations plus read/write support, including nullable category support for income rows.
4. Update validation for income-specific requirements.
5. Update add/edit transaction UI and inline edit UI.
6. Update recurring transaction flows.
7. Update transaction filtering and search query handling.
8. Update CSV import/export and snapshot serialization.
9. Add or update tests for migrations, validation, transaction CRUD, filters, recurring entries, and CSV flows.

## Testing Requirements

Coverage should include:

- migration adds the new nullable columns without data loss
- migration preserves existing rows while allowing income rows to store null category values
- new income rows require an income subtype
- expense rows save with null subtype
- income rows save with null category
- editing type from income to expense clears subtype
- editing type from expense to income clears category
- transaction filtering by subtype works
- recurring income entries preserve subtype when auto-posted
- CSV import preview and commit carry subtype correctly
- CSV export includes the new column
- snapshot restore works with both old and new payload shapes

## Open Decisions Resolved

- Income types are fixed, not user-configurable.
- Income subtype is fully integrated, not form-only.
- The feature uses a dedicated field rather than overloading `category`.
- Income rows should not be forced into expense categories.
- Legacy income rows remain valid and display as `Unspecified` until edited.
