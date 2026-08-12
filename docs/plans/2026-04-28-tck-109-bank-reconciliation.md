# TCK-109 — Rapprochement bancaire semi-automatique (plan d'implémentation)

> Ce plan sera également enregistré dans `docs/plans/2026-04-28-tck-109-bank-reconciliation.md` à l'implémentation (cohérent avec les patterns TCK-105/106/107/108).

## Contexte

Le triptyque paiements de Takussan — `BookingPayment` (TCK-028), `LeasePayment` (TCK-028) et `Invoice` (TCK-028 + TCK-077 PDF + TCK-079 passerelles Wave/OM) — est en place et stable. L'agence reçoit aujourd'hui ses fonds soit en espèces (saisie manuelle), soit via mobile money (idempotent côté webhook), mais le rapprochement avec le **relevé bancaire de son compte d'encaissement** reste manuel et chronophage : un comptable ouvre son CSV/OFX en parallèle de la liste des paiements et coche à la main. TCK-109 introduit un import semi-automatique : le comptable upload un fichier de relevé, le système parse + suggère des appariements (heuristiques déterministes), et l'humain valide/ajuste/ignore avant clôture.

**Choix de scope confirmés via exploration** :

- **Dépendances `done`** : TCK-028 (paiements), TCK-077 (PDF templates) et TCK-079 (passerelles + idempotence webhook) sont mergés. Les 3 modèles cibles existent avec leurs traits/casts/enums (`BookingPayment`, `LeasePayment`, `Invoice`). On n'invente rien côté domaine paiement — on **lit/écrit** uniquement deux nouvelles colonnes additives par table (`bank_reconciled_at`, `bank_statement_line_id`).
- **Aucun morph-map enregistré** dans `AppServiceProvider` ; tous les `morphTo` du repo (ex. `Invoice::invoiceable`) utilisent les FQCN. On garde cette convention pour `BankStatementLine::matchedPayment()` — `matched_payment_type` stockera `App\Models\BookingPayment` etc.
- **`Currency` enum existant** (`app/Models/Enums/Currency.php`) : XOF/XAF/EUR/USD. Toutes les `Payment` tables ont `currency` cast vers cette enum. On compare donc `$line->currency === $payment->currency->value` à l'appariement (AC5).
- **Stockage privé** : `config/filesystems.php` default = `local` (privé), Spatie MediaLibrary servant les fichiers via signed URLs courtes (cf. TCK-016/105). Pour les fichiers de relevé, on utilise **Spatie MediaLibrary** sur une nouvelle collection `statement` du modèle `BankStatement` (pattern cohérent avec `Property::photos`, `Document::file`). Pas de stockage direct via `Storage::put`.
- **Routes** : `routes/api/` est découpé par domaine (`payments.php`, `payouts.php`, `invoices.php`, `properties.php`...). On crée `routes/api/accounting.php` enregistré dans `bootstrap/app.php` pour rester cohérent.
- **NotificationType (TCK-049)** étendu avec 2 cas (`bank_statement_imported`, `bank_statement_finalized`). Notification critique = `false`, canal = `app` (in-app uniquement, pas d'email — conforme hors-périmètre).
- **Sidebar admin** : `Finances` est déjà déclarée (`/admin/finances` stub). On crée `/admin/finances/reconciliation` comme sous-page (pas un nouveau silo) — cohérent avec le ticket "Page `Compta → Rapprochement bancaire`".
- **Spatie QueryBuilder** : pattern projet via `HasQueryBuilder` trait + `static::buildQuery($base, $request)`. Tous les nouveaux endpoints l'utilisent (mémoire utilisateur — sparse fields obligatoires).
- **OFX** : pas de package PHP mature unique. On utilise un parser custom léger basé sur `tonicospinelli/ofx-parser` ou `asgrim/ofxparser` (à confirmer à l'install ; fallback parser maison sur `<STMTTRN>` blocs si l'install échoue — la grammaire OFX 1.x est triviale en SGML strict).
- **CSV** : parser maison via `League\Csv` (déjà dépendance transitive de Laravel via `league/flysystem`). Configuration mapping par agence (séparateur, colonnes) stockée dans `agencies.bank_csv_mapping` (nouvelle colonne JSON, pas dans `settings` car spec ticket explicite).
- **Idempotence import** : hash SHA-256 du fichier brut stocké sur `bank_statements.file_hash` ; index unique partiel `(agency_id, file_hash)`.
- **Frontend** : pas d'existant `accounting/compta` à réutiliser. On démarre la page from scratch en suivant la structure `(dashboard)/admin/team` (TCK-108) — Tabs si besoin, table principale, dialog upload, dialog modification.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND (Next.js 16, App Router)                              │
│                                                                 │
│  app/(dashboard)/admin/finances/reconciliation/                 │
│   ├─ page.tsx                  → liste relevés + bouton upload  │
│   └─ [statementId]/page.tsx    → détail relevé + lignes         │
│                                                                 │
│  Composants:                                                    │
│   ├─ <StatementUploadDialog />   (drop-zone + preview 10 lignes)│
│   ├─ <StatementList />            (table relevés filtrable)     │
│   ├─ <StatementDetailHeader />    (% réconcilié, Finalize CTA)  │
│   ├─ <StatementLinesTable />      (lignes + suggestion + actions│
│   ├─ <ConfirmMatchButton />       (one-click si suggestion)     │
│   ├─ <ManualMatchDialog />        (recherche payment + override)│
│   └─ <PaymentSearchCombobox />    (Base UI Combobox + autocomp.)│
└──────────────┬──────────────────────────────────────────────────┘
               │
   POST   /api/agencies/{agency}/bank-statements      (multipart)
   GET    /api/agencies/{agency}/bank-statements
   GET    /api/bank-statements/{id}
   POST   /api/bank-statements/{id}/finalize
   GET    /api/bank-statements/{id}/lines             (paginated)
   POST   /api/bank-statement-lines/{id}/match
   DELETE /api/bank-statement-lines/{id}/match
   POST   /api/bank-statement-lines/{id}/ignore
               │
┌──────────────▼──────────────────────────────────────────────────┐
│  BACKEND (Laravel 13)                                           │
│                                                                 │
│  routes/api/accounting.php (auth:sanctum)                       │
│   ├─ BankStatementController       (resource: index/store/show) │
│   ├─ BankStatementLineController   (match/unmatch/ignore)       │
│   └─ FinalizeBankStatementController                            │
│         │                                                       │
│         ▼  FormRequest + Policy                                 │
│   StatementParser (driver-based)                                │
│    ├─ CsvDriver  (League\Csv + agency.bank_csv_mapping)         │
│    └─ OfxDriver  (parser SGML léger)                            │
│         │                                                       │
│         ▼                                                       │
│   ParseBankStatementJob (queue 'reconciliation')                │
│    1. read media file via Spatie                                │
│    2. driver = match($source_format)                            │
│    3. hydrate BankStatementLines (chunk insert)                 │
│    4. enqueue MatchBankStatementJob                             │
│         │                                                       │
│         ▼                                                       │
│   MatchBankStatementJob                                         │
│    ├─ ReconciliationMatcher::scoreLine($line)                   │
│    │   ├─ exactAmountAndReference  (≥ 95)                       │
│    │   ├─ exactAmountAndCounterpart(80–95)                      │
│    │   ├─ amountAndDateNear        (60–80)                      │
│    │   └─ noMatch                  (unmatched)                  │
│    ├─ pour chaque candidate ≥ 60 → suggested + confidence       │
│    └─ persist match_status, matched_payment_type/id, score      │
│         │                                                       │
│         ▼  status statement → ready_for_review                  │
│   Event BankStatementImported  → NotifyImported (queued)        │
│                                                                 │
│   ReconciliationManager (orchestrateur HTTP)                    │
│    ├─ confirmMatch($line, $payment, $caller)                    │
│    │   - guards: scope agence, devise, double-rapproch., closed │
│    │   - DB::transaction:                                       │
│    │       update line.match_status=confirmed                   │
│    │       set payment.bank_reconciled_at + statement_line_id   │
│    │   - activity log + event BankStatementLineMatched          │
│    ├─ unmatch($line, $caller)  (refuse si statement closed)     │
│    ├─ ignore($line, $caller)                                    │
│    └─ finalize($statement, $caller)                             │
│         - all lines must be confirmed/ignored/unmatched         │
│         - status → reconciled OR partially_reconciled           │
│         - event BankStatementFinalized                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Fichiers critiques (existants à modifier ou référencer)

| Fichier | Rôle dans le plan |
|---|---|
| `takussan-api/app/Models/BookingPayment.php` | **Étendu** : 2 nouvelles colonnes additives `bank_reconciled_at`, `bank_statement_line_id` ; relation `bankStatementLine()` ; scope `whereNotReconciled()`. |
| `takussan-api/app/Models/LeasePayment.php` | **Étendu** : idem (2 colonnes + relation + scope). |
| `takussan-api/app/Models/Invoice.php` | **Étendu** : idem (2 colonnes + relation + scope). |
| `takussan-api/app/Models/Agency.php` | **Étendu** : nouvelle colonne `bank_csv_mapping` (JSON nullable) + cast `array` ; relation `bankStatements()`. |
| `takussan-api/app/Models/Enums/Currency.php` | **Lecture seule** — utilisé pour valider la devise des lignes vs paiements ciblés. |
| `takussan-api/app/Models/Bases/AbstractModel.php` | Base de tous les nouveaux modèles (`BankStatement`, `BankStatementLine`). |
| `takussan-api/app/Models/Bases/Auditable.php` | Trait à appliquer sur `BankStatement` et `BankStatementLine` (auto-log dirty fillable). |
| `takussan-api/app/Models/Concerns/HasQueryBuilder.php` | Trait à appliquer sur les 2 nouveaux modèles pour `static::buildQuery()`. |
| `takussan-api/app/Models/AppNotification.php` + `app/Models/Enums/NotificationType.php` | **Étendu** : 2 nouveaux cas (`bank_statement_imported`, `bank_statement_finalized`). |
| `takussan-api/app/Services/Model/NotificationService.php` | **Réutilisé tel quel** par les listeners. Pas de modif. |
| `takussan-api/app/Policies/BasePolicy.php` | Référence du pattern `super_admin` bypass via `Gate::before`. Les 2 nouvelles policies l'étendent. |
| `takussan-api/routes/console.php` | **Pas modifié** — pas de scheduler récurrent côté reconciliation (l'import est utilisateur-déclenché). Le matching tourne dans la queue, pas en cron. |
| `takussan-api/bootstrap/app.php` | **Étendu** : enregistrement de `routes/api/accounting.php` dans le `withRouting()->api()`. |
| `takussan-api/app/Providers/AppServiceProvider.php` | **Étendu** : `Event::listen(...)` pour les 3 listeners reconciliation. |
| `takussan-api/lang/{fr,en,wo}/notifications.php` | **Étendu** : titres/corps des 2 nouveaux types. |
| `takussan-api/lang/{fr,en,wo}/reconciliation.php` | **Nouveau** : labels statuts, messages validation, libellés actions. |
| `takussan-api/composer.json` | **Étendu** : `league/csv: ^9.16` (parser CSV robuste). Pas de package OFX (parser maison). |
| `takussan-web/src/components/layout/AdminSidebar.tsx` | **Pas modifié** — `Finances` existe déjà ; on accroche le sous-écran via le routing Next, pas via un nouveau NavItem. (Optionnel : ajouter un sous-item si la sidebar supporte un 2e niveau — sinon page index `/admin/finances` liste les sous-sections.) |
| `takussan-web/src/app/(dashboard)/admin/finances/page.tsx` | **Étendu** : remplace le `StubPlaceholder` par une vraie page index avec carte d'accès "Rapprochement bancaire" (et placeholders futurs). |
| `takussan-web/src/lib/api.ts` + `src/hooks/useApiQuery.ts` + `useApiForm.ts` | **Réutilisés tels quels**. |
| `takussan-web/src/components/ui/dialog.tsx` + `combobox` (Base UI) | **Réutilisés** pour modals + autocomplete payment. |
| `takussan-web/src/messages/{fr,en,wo}.json` | **Étendu** : namespace `admin.reconciliation.*`. |
| `docs/backlog/INDEX.md` | TCK-109 `todo → review` à l'ouverture de la PR ; **target = `dev`** (mémoire utilisateur). |
| `docs/plans/2026-04-28-tck-109-bank-reconciliation.md` | **Nouveau** — doc courte (workflow comptable, règles, mapping CSV). |

---

## Nouveaux fichiers à créer

### Backend — migrations

- `takussan-api/database/migrations/2026_04_28_000001_create_bank_statements_table.php`
  ```php
  Schema::create('bank_statements', function (Blueprint $table) {
      $table->id();
      $table->foreignId('agency_id')->constrained('agencies')->cascadeOnDelete();
      $table->foreignId('uploaded_by')->constrained('users')->restrictOnDelete();
      $table->string('source_format', 8);                  // BankStatementSourceFormat
      $table->string('file_hash', 64);                     // sha256 hex
      $table->string('bank_name')->nullable();
      $table->string('account_iban_masked')->nullable();   // ex. 'FR76 **** **** **** **** **42'
      $table->date('period_start')->nullable();
      $table->date('period_end')->nullable();
      $table->unsignedInteger('lines_count')->default(0);
      $table->string('status')->default('processing');     // BankStatementStatus
      $table->dateTime('finalized_at')->nullable();
      $table->foreignId('finalized_by')->nullable()->constrained('users')->nullOnDelete();
      $table->timestamps();
      $table->unique(['agency_id', 'file_hash'], 'bank_statements_agency_hash_unique');
      $table->index(['agency_id', 'status']);
      $table->index(['agency_id', 'created_at']);
  });
  ```

- `takussan-api/database/migrations/2026_04_28_000002_create_bank_statement_lines_table.php`
  ```php
  Schema::create('bank_statement_lines', function (Blueprint $table) {
      $table->id();
      $table->foreignId('bank_statement_id')->constrained('bank_statements')->cascadeOnDelete();
      $table->date('posted_at');
      $table->decimal('amount', 12, 2);
      $table->string('direction', 8);                     // credit|debit
      $table->char('currency', 3);
      $table->text('label');
      $table->string('reference')->nullable();
      $table->string('counterparty')->nullable();
      $table->json('raw_payload');
      $table->string('match_status')->default('unmatched'); // BankStatementLineMatchStatus
      $table->string('matched_payment_type')->nullable();
      $table->unsignedBigInteger('matched_payment_id')->nullable();
      $table->unsignedTinyInteger('match_confidence')->nullable(); // 0..100
      $table->dateTime('confirmed_at')->nullable();
      $table->foreignId('confirmed_by')->nullable()->constrained('users')->nullOnDelete();
      $table->timestamps();
      $table->index(['bank_statement_id', 'match_status']);
      $table->index(['matched_payment_type', 'matched_payment_id']);
      $table->index(['posted_at', 'amount']);             // accélère le matcher
  });
  ```

- `takussan-api/database/migrations/2026_04_28_000003_add_bank_reconciliation_to_booking_payments_table.php`
  ```php
  Schema::table('booking_payments', function (Blueprint $table) {
      $table->dateTime('bank_reconciled_at')->nullable()->after('paid_at');
      $table->unsignedBigInteger('bank_statement_line_id')->nullable()->after('bank_reconciled_at');
      $table->foreign('bank_statement_line_id')->references('id')->on('bank_statement_lines')->nullOnDelete();
  });
  // Index unique partiel (anti double-rapprochement)
  // SQLite/Postgres syntax differ — gérer via raw via DB::statement avec when()
  DB::statement(...);  // CREATE UNIQUE INDEX IF NOT EXISTS booking_payments_bank_line_unique ON booking_payments (bank_statement_line_id) WHERE bank_statement_line_id IS NOT NULL;
  ```
  Note : SQLite et Postgres supportent les index uniques partiels (`WHERE`) ; MySQL ne supporte pas — fallback `unique` non-partiel sur la colonne nullable (MySQL admet les NULL multiples sur un unique). On utilise `Schema::hasTable()` + `DB::getDriverName()` pour adapter le SQL — détail dans la migration.

- Idem pour `2026_04_28_000004_add_bank_reconciliation_to_lease_payments_table.php` (colonnes + index unique partiel).
- Idem pour `2026_04_28_000005_add_bank_reconciliation_to_invoices_table.php`.
- `2026_04_28_000006_add_bank_csv_mapping_to_agencies_table.php` :
  ```php
  Schema::table('agencies', function (Blueprint $table) {
      $table->json('bank_csv_mapping')->nullable()->after('settings');
  });
  ```

### Backend — enums

- `takussan-api/app/Models/Enums/BankStatementStatus.php`
  ```php
  enum BankStatementStatus: string {
      case Processing = 'processing';
      case ReadyForReview = 'ready_for_review';
      case PartiallyReconciled = 'partially_reconciled';
      case Reconciled = 'reconciled';
      case Archived = 'archived';
      public function isClosed(): bool {
          return in_array($this, [self::Reconciled, self::Archived], true);
      }
  }
  ```

- `takussan-api/app/Models/Enums/BankStatementLineMatchStatus.php`
  ```php
  enum BankStatementLineMatchStatus: string {
      case Unmatched = 'unmatched';
      case Suggested = 'suggested';
      case Confirmed = 'confirmed';
      case Ignored = 'ignored';
  }
  ```

- `takussan-api/app/Models/Enums/BankStatementSourceFormat.php`
  ```php
  enum BankStatementSourceFormat: string {
      case Csv = 'csv';
      case Ofx = 'ofx';
  }
  ```

- `takussan-api/app/Models/Enums/BankStatementLineDirection.php`
  ```php
  enum BankStatementLineDirection: string {
      case Credit = 'credit';
      case Debit = 'debit';
  }
  ```

### Backend — modèles

- `takussan-api/app/Models/BankStatement.php`
  - Étend `AbstractModel` ; traits : `Auditable`, `HasQueryBuilder`, `InteractsWithMedia` (Spatie).
  - Casts : `status => BankStatementStatus::class`, `source_format => BankStatementSourceFormat::class`, `period_start|period_end => date`, `finalized_at => datetime`.
  - Relations : `agency()`, `uploadedBy()`, `finalizedBy()`, `lines()` (HasMany).
  - `registerMediaCollections()` : single-file `statement` (collection privée, un seul fichier par statement).
  - Scopes : `scopeForAgency`, `scopeOpen` (pas closed), `scopeOpenForLine` (helper pour gates UI).
  - `static $requestFilterable = ['status', 'source_format', 'agency_id']`.
  - `static $requestSortable = ['created_at', '-created_at', 'period_start', '-period_start']`.
  - `static $queryFields = ['id','agency_id','source_format','status','bank_name','account_iban_masked','period_start','period_end','lines_count','finalized_at','created_at','updated_at']`.
  - `static $requestLoadable = ['uploadedBy', 'finalizedBy', 'agency']`.
  - **Accessor** `getReconciledRatioAttribute(): array` — retourne `['confirmed' => x, 'ignored' => y, 'remaining' => z, 'total' => n]`. Pas de stockage, calcul via `lines()->selectRaw('match_status, count(*) ...')`.

- `takussan-api/app/Models/BankStatementLine.php`
  - Étend `AbstractModel` ; traits : `Auditable`, `HasQueryBuilder`.
  - Casts : `match_status => BankStatementLineMatchStatus::class`, `direction => BankStatementLineDirection::class`, `posted_at => date`, `amount => decimal:2`, `raw_payload => array`, `confirmed_at => datetime`.
  - Relations : `statement()` (BelongsTo), `matchedPayment()` (MorphTo via `matched_payment`), `confirmedBy()`.
  - Scopes : `scopeUnmatched`, `scopeSuggested`, `scopeConfirmed`, `scopeIgnored`, `scopeReadyToConfirm` (suggested + confidence ≥ seuil).
  - `static $requestFilterable = ['match_status', 'direction']`.
  - `static $requestRangeFilters = ['amount', 'posted_at']`.
  - `static $requestSearchFields = ['label', 'reference', 'counterparty']`.
  - `static $queryFields = ['id','bank_statement_id','posted_at','amount','direction','currency','label','reference','counterparty','match_status','matched_payment_type','matched_payment_id','match_confidence','confirmed_at','confirmed_by','created_at']`.

### Backend — services

#### `app/Services/Accounting/StatementParser/StatementParserInterface.php`
```php
interface StatementParserInterface {
    /** @return iterable<ParsedLine> */
    public function parse(string $absolutePath, ParserContext $context): iterable;
}
```

#### `app/Services/Accounting/StatementParser/ParsedLine.php`
DTO immuable (`readonly class`) : `postedAt: CarbonImmutable, amount: float, direction: BankStatementLineDirection, currency: string, label: string, reference: ?string, counterparty: ?string, raw: array`.

#### `app/Services/Accounting/StatementParser/ParserContext.php`
DTO : `agency: Agency, format: BankStatementSourceFormat, csvMapping: ?array` (uniquement pour CSV — défini sur `agency.bank_csv_mapping` ou défaut).

#### `app/Services/Accounting/StatementParser/CsvDriver.php`
- Utilise `League\Csv\Reader` : `setDelimiter`, `setHeaderOffset(0)` (sauf si mapping `has_header=false`), itère via `getRecords()`.
- Mapping : par défaut `{ delimiter: ',', date_column: 'date', date_format: 'd/m/Y', amount_column: 'amount', label_column: 'label', reference_column: 'reference', counterparty_column: 'counterparty', sign_convention: 'amount_signed' }` ; sign_convention `amount_signed` (négatif = debit) ou `direction_column` (colonne séparée debit/credit).
- Validation par ligne : amount parseable (`(float)str_replace(',', '.', $raw)`), date parseable (`Carbon::createFromFormat`). Ligne invalide → skip avec warning logué (pas de hard fail sur 1 ligne).
- Détection devise : par défaut `$context->agency->currency->value` (XOF), surchargeable via `currency_column` du mapping.

#### `app/Services/Accounting/StatementParser/OfxDriver.php`
- Parser SGML léger maison : `preg_match_all('#<STMTTRN>(.*?)</STMTTRN>#s', $content, $blocks)`. Pour chaque bloc, extraire `<TRNTYPE>`, `<DTPOSTED>` (format `YYYYMMDD[HHMMSS]`), `<TRNAMT>` (signed), `<FITID>` (référence), `<NAME>` ou `<MEMO>` (label/counterparty), `<CURDEF>` (au niveau STMTRS pour défaut).
- Pas de dépendance externe (les libs OFX PHP sont peu maintenues ; le sous-ensemble OFX 1.x dont on a besoin tient en ~80 lignes de code testé).
- Test fixture : `tests/fixtures/bank/sample.ofx` (200 lignes, vrai relevé anonymisé).

#### `app/Services/Accounting/StatementParser/StatementParserFactory.php`
```php
public function for(BankStatementSourceFormat $format): StatementParserInterface {
    return match ($format) {
        BankStatementSourceFormat::Csv => app(CsvDriver::class),
        BankStatementSourceFormat::Ofx => app(OfxDriver::class),
    };
}
```

#### `app/Services/Accounting/ReconciliationMatcher.php`
- Constructeur : pas de dépendance externe (queries directes via Eloquent).
- `public function suggestFor(BankStatementLine $line): ?MatchSuggestion`
  - `MatchSuggestion` DTO : `paymentType: string, paymentId: int, confidence: int`.
  - Algorithme :
    1. Fenêtre temporelle `[posted_at - 7d, posted_at + 7d]`.
    2. Direction : `credit` lignes → cherche dans paiements **encaissés** (status `paid|partially_paid`) **non encore rapprochés** (`bank_reconciled_at IS NULL`). Lignes `debit` → ignorées par défaut V1 (les remboursements sortants ne déclenchent pas de match auto — le comptable peut ignorer).
    3. Devise : `$line->currency === $payment->currency->value` filtré en SQL.
    4. Scope agence : `$payment->agency_id === $line->statement->agency_id` (joint via `booking->agency`, `lease->agency`, ou `invoice->agency_id`).
    5. **Score** :
       - `exactAmountAndReference` (montant exact + reference exacte sur `reference_number`) → **95**.
       - `exactAmountAndCounterpart` (montant exact + similarité counterparty ↔ payer.full_name ≥ 0.85 via similar_text/Jaro) → **80**.
       - `amountAndDateNear` (montant exact + posted_at à ±2j de paid_at) → **70**.
       - `amountOnly` (montant exact, mais > 1 candidat possible) → on choisit le plus proche en date, score **60**, **sauf** ambiguïté ≥ 2 candidats à même score → on retourne `null` (laisse `unmatched` plutôt que de proposer au hasard).
    6. Si plusieurs scores possibles → on garde le **plus haut**.
    7. **Aucune** confirmation auto : retourne juste `MatchSuggestion` ou `null`.
  - Une seule passe par ligne. Performance cible : 5000 lignes en < 60s = 12ms/ligne — large.
  - Query optimisée : `whereIn(amount)`, `whereBetween(paid_at)`, `where('agency_id', ...)`, `whereNull('bank_reconciled_at')`. L'index `(posted_at, amount)` créé sur `bank_statement_lines` n'est pas pertinent ici (on query les paiements, pas les lignes) ; côté paiements, les index existants `(agency_id, paid_at)` (TCK-028) suffisent.

#### `app/Services/Accounting/ReconciliationManager.php`
- Constructeur : `__construct(private readonly Dispatcher $events)`.
- **`confirmMatch(BankStatementLine $line, Model $payment, User $caller): BankStatementLine`** :
  1. **Guards** :
     - `$line->statement->status` doit être `ReadyForReview|PartiallyReconciled` ; sinon `ValidationException`.
     - `$payment->agency_id === $line->statement->agency_id` ; sinon 403 (déjà filtré côté policy mais double-ceinture).
     - `$line->currency === $payment->currency->value` ; sinon `ValidationException` (AC5).
     - `$payment->bank_statement_line_id === null` ; sinon `ValidationException` "déjà rapproché" (AC9).
     - `in_array(class($payment), ['App\Models\BookingPayment','App\Models\LeasePayment','App\Models\Invoice'])`.
  2. `DB::transaction`:
     - Lock `$line` (lockForUpdate), re-vérifier guards.
     - Update line : `match_status = Confirmed, matched_payment_type = ::class, matched_payment_id = $payment->id, confirmed_at = now, confirmed_by = $caller->id`.
     - Update payment : `bank_reconciled_at = $line->posted_at, bank_statement_line_id = $line->id`.
  3. `activity('BankStatementLine')->causedBy($caller)->performedOn($line)->withProperties([...])->event('matched')->log('matched');`
  4. `$this->events->dispatch(new BankStatementLineMatched($line));`
  5. Return `$line->refresh()`.
- **`unmatch(BankStatementLine $line, User $caller)`** :
  - Guard : `$line->statement->status` doit être ouvert (pas `Reconciled|Archived`) ; sinon ValidationException "relevé clôturé".
  - Charge `matchedPayment` ; si présent, lui retire `bank_reconciled_at` et `bank_statement_line_id`.
  - Reset `line.match_status = Unmatched`, `matched_payment_type/id = null`, `confirmed_at/by = null`.
  - `match_confidence` est conservé (suggestion d'origine restée affichable).
  - Activity log + event.
- **`ignore(BankStatementLine $line, User $caller)`** :
  - Guard : statement ouvert.
  - Si la ligne était `Confirmed` → unmatch d'abord (libère le payment), puis set `Ignored`.
  - Activity log.
- **`finalize(BankStatement $statement, User $caller): BankStatement`** :
  - Guard : status courant `ReadyForReview|PartiallyReconciled`.
  - Compte les lignes : si toutes `Confirmed|Ignored` → `Reconciled` ; sinon (présence d'`Unmatched|Suggested`) → `PartiallyReconciled` (le ticket autorise la finalisation partielle).
  - `finalized_at = now, finalized_by = $caller->id`.
  - Activity log + `BankStatementFinalized` event.

#### `app/Services/Accounting/PaymentSearchService.php`
- Pour la recherche manuelle dans `ManualMatchDialog` (frontend autocomplete).
- `public function search(Agency $agency, string $query, ?float $amountHint, int $limit = 20): Collection<MatchCandidate>` — union de `BookingPayment`, `LeasePayment`, `Invoice` filtrés par agence + non rapprochés + LIKE sur `reference_number` ou `payer.full_name` ou `notes`.
- Retourne un DTO `MatchCandidate { id, type, label (string composite), amount, currency, reference, paid_at, payer_name }` pour affichage UI.

### Backend — jobs

- `app/Jobs/Accounting/ParseBankStatementJob.php`
  - `implements ShouldQueue` ; `public string $queue = 'reconciliation'` ; `public int $tries = 1` (idempotence par hash garantie en amont).
  - Constructeur : `int $statementId`.
  - `handle(StatementParserFactory $factory)` :
    1. `BankStatement::find($statementId)` ; si null → return.
    2. `$media = $statement->getFirstMedia('statement')` ; si null → mark `processing` → ValidationException (cas anormal).
    3. `$path = $media->getPath()` (chemin local Spatie).
    4. `$context = new ParserContext($statement->agency, $statement->source_format, $statement->agency->bank_csv_mapping);`
    5. `$parser = $factory->for($statement->source_format);`
    6. `$lines = []; foreach ($parser->parse($path, $context) as $parsed) { $lines[] = [...mapping...]; }` → `BankStatementLine::insert(array_chunk($lines, 500))`.
    7. Calcule `period_start` / `period_end` (min/max `posted_at`), met à jour `lines_count`.
    8. Update `status = ReadyForReview`.
    9. `MatchBankStatementJob::dispatch($statementId)`.
    10. `event(new BankStatementImported($statement))` (queued listener notifie l'uploader).

- `app/Jobs/Accounting/MatchBankStatementJob.php`
  - `implements ShouldQueue` ; `public string $queue = 'reconciliation'` ; `tries = 1`.
  - `handle(ReconciliationMatcher $matcher)` :
    1. Charge le statement + lines `unmatched` (cursor).
    2. Pour chaque ligne : `$suggestion = $matcher->suggestFor($line);`
    3. Si `$suggestion !== null` → `$line->update(['match_status' => Suggested, 'matched_payment_type' => $suggestion->paymentType, 'matched_payment_id' => $suggestion->paymentId, 'match_confidence' => $suggestion->confidence]);`
    4. Sinon : laisse `Unmatched` (pas d'écriture).
  - **Idempotence** : on ne réécrit jamais une ligne dont `match_status !== Unmatched` (donc une suggestion humainement validée n'est pas écrasée par une 2e passe).

### Backend — events & listeners

- `app/Events/Accounting/BankStatementImported.php` — `public BankStatement $statement;` ; `Dispatchable, SerializesModels`.
- `app/Events/Accounting/BankStatementLineMatched.php` — `public BankStatementLine $line;`.
- `app/Events/Accounting/BankStatementFinalized.php` — `public BankStatement $statement;`.

- `app/Listeners/Accounting/NotifyStatementImported.php` (`ShouldQueue`) :
  - `handle(BankStatementImported $e, NotificationService $svc)` :
    - Notify `$statement->uploadedBy` avec `NotificationType::BankStatementImported`, body interpolé (`:lines_count`, `:bank_name`).
    - `is_critical = false`.
    - **Anonymisation** : ne JAMAIS référencer dans le body le contenu d'une ligne (label, IBAN tiers, etc.) — uniquement les métadonnées du statement (cf. contrainte ticket).
    - `referenceableType = BankStatement::class`, `referenceableId = $statement->id`.

- `app/Listeners/Accounting/NotifyStatementFinalized.php` (`ShouldQueue`) :
  - Notify le finalizer + (optionnellement) le primary_admin de l'agence si différent.
  - Body : "Relevé du :period clôturé (:confirmed/:total lignes rapprochées)".

- (Pas de listener pour `BankStatementLineMatched` — pas de notification, juste un hook futur. L'event est publié pour permettre des intégrations downstream — ex. journal comptable export.)

- Modification `app/Models/Enums/NotificationType.php` :
  ```php
  case BankStatementImported = 'bank_statement_imported';
  case BankStatementFinalized = 'bank_statement_finalized';
  ```

- Modification `lang/fr/notifications.php` (et en, wo) — section `types` :
  ```php
  'bank_statement_imported' => 'Relevé bancaire importé',
  'bank_statement_finalized' => 'Relevé bancaire clôturé',
  ```
  + nouveau fichier `lang/{locale}/reconciliation.php` :
  ```php
  return [
      'notifications' => [
          'imported' => ['title' => 'Relevé importé', 'body' => 'Votre relevé :bank (:lines_count lignes) est prêt à être rapproché.'],
          'finalized' => ['title' => 'Relevé clôturé', 'body' => 'Le relevé :period a été clôturé (:confirmed/:total lignes rapprochées).'],
      ],
      'validation' => [
          'duplicate_file' => 'Ce relevé a déjà été importé pour cette agence.',
          'currency_mismatch' => 'La devise de la ligne (:line) ne correspond pas à celle du paiement (:payment).',
          'cross_agency' => 'Le paiement ciblé n\'appartient pas à cette agence.',
          'already_reconciled' => 'Ce paiement est déjà rapproché à une autre ligne.',
          'statement_closed' => 'Ce relevé est clôturé, modification impossible.',
      ],
      'status' => [
          'processing' => 'En cours d\'analyse',
          'ready_for_review' => 'À vérifier',
          'partially_reconciled' => 'Partiellement rapproché',
          'reconciled' => 'Rapproché',
          'archived' => 'Archivé',
      ],
      'line_status' => [
          'unmatched' => 'Non matchée',
          'suggested' => 'Suggérée',
          'confirmed' => 'Rapprochée',
          'ignored' => 'Ignorée',
      ],
  ];
  ```

- Modification `app/Providers/AppServiceProvider.php::boot()` :
  ```php
  Event::listen(BankStatementImported::class, NotifyStatementImported::class);
  Event::listen(BankStatementFinalized::class, NotifyStatementFinalized::class);
  ```

### Backend — endpoints HTTP

#### Requests

- `app/Http/Requests/Accounting/StoreBankStatementRequest.php` (extends `BaseFormRequest`) :
  - `authorize()`: true (policy gère la fine).
  - `rules()`:
    ```php
    'file' => ['required', 'file', 'max:10240', 'mimes:csv,txt,ofx'], // .csv .txt (souvent banques) .ofx
    'source_format' => ['required', new Enum(BankStatementSourceFormat::class)],
    'bank_name' => ['nullable', 'string', 'max:120'],
    'account_iban' => ['nullable', 'string', 'max:34', 'regex:/^[A-Z0-9]+$/'],
    ```
  - `prepareForValidation()` : auto-détection du `source_format` si absent (extension `.ofx` → ofx, sinon csv).
  - `withValidator()` : check anti-doublon (`file_hash`) — on hash le fichier ici pour répondre 422 immédiatement, plutôt qu'attendre le job. Hash réutilisé par le controller.

- `app/Http/Requests/Accounting/MatchBankStatementLineRequest.php` :
  - `rules()`:
    ```php
    'payment_type' => ['required', Rule::in(['booking_payment', 'lease_payment', 'invoice'])],
    'payment_id' => ['required', 'integer'],
    ```
  - Le mapping `payment_type` → FQCN se fait dans le controller (table de mapping) — on ne stocke pas les `short keys` côté DB, c'est juste l'API surface pour le frontend.

#### Controllers

- `app/Http/Controllers/Api/Accounting/BankStatementController.php` (resource : index, store, show — pas update/destroy publics) :
  - `index(Agency $agency, Request $request)` :
    - `$this->authorize('viewAny', [BankStatement::class, $agency]);`
    - `$query = BankStatement::query()->where('agency_id', $agency->id);`
    - `return BankStatementResource::collection(BankStatement::buildQuery($query, $request)->paginate());`
  - `store(Agency $agency, StoreBankStatementRequest $request)` :
    - `$this->authorize('create', [BankStatement::class, $agency]);`
    - Hash déjà calculé dans `withValidator` ; vérifier via `BankStatement::where('agency_id', $agency->id)->where('file_hash', $hash)->exists()` → 422 si oui (AC6).
    - Crée `BankStatement` (status `Processing`), attache le fichier sur la collection `statement` (Spatie MediaLibrary).
    - `ParseBankStatementJob::dispatch($statement->id);`
    - 202 `BankStatementResource::make($statement)`.
  - `show(BankStatement $statement)` :
    - `$this->authorize('view', $statement);`
    - Includes whitelist : `lines` (avec sub-pagination si demandée séparément), `uploadedBy`, `finalizedBy`, `agency`.
    - Retourne `BankStatementResource` avec `reconciled_ratio`.

- `app/Http/Controllers/Api/Accounting/BankStatementLineController.php` :
  - `index(BankStatement $statement, Request $request)` :
    - `$this->authorize('viewAny', [BankStatementLine::class, $statement]);`
    - `$query = $statement->lines()->getQuery();`
    - `return BankStatementLineResource::collection(BankStatementLine::buildQuery($query, $request)->paginate());`
  - `match(BankStatementLine $line, MatchBankStatementLineRequest $request, ReconciliationManager $manager)` :
    - `$this->authorize('match', $line);`
    - Mapping `$paymentType` (short key) → FQCN + résolution `Model::findOrFail($id)`.
    - `$updated = $manager->confirmMatch($line, $payment, $request->user());`
    - Retourne `BankStatementLineResource::make($updated)`.
  - `unmatch(BankStatementLine $line, ReconciliationManager $manager)` :
    - `$this->authorize('unmatch', $line);`
    - `$manager->unmatch($line, $request->user());`
    - 200 + resource.
  - `ignore(BankStatementLine $line, ReconciliationManager $manager)` :
    - `$this->authorize('ignore', $line);`
    - `$manager->ignore($line, $request->user());`
    - 200 + resource.

- `app/Http/Controllers/Api/Accounting/FinalizeBankStatementController.php` (single-action) :
  - `__invoke(BankStatement $statement, ReconciliationManager $manager)` :
    - `$this->authorize('finalize', $statement);`
    - `$manager->finalize($statement, $request->user());`
    - 200 + resource.

- `app/Http/Controllers/Api/Accounting/PaymentSearchController.php` (single-action, GET) :
  - `__invoke(Agency $agency, Request $request, PaymentSearchService $service)` :
    - `$this->authorize('viewAny', [BankStatement::class, $agency]);` (même droit que reconciliation)
    - Retourne `MatchCandidateResource::collection($service->search($agency, $request->query('q', ''), $request->float('amount'), 20));`

#### Resources

- `app/Http/Resources/Accounting/BankStatementResource.php`
  - Champs : tous les colonnes + `status_label`, `source_format_label`, `reconciled_ratio` (accessor), `uploaded_by` (mini), `finalized_by` (mini), `file_url` (signed URL via Spatie pour la collection `statement`, **uniquement si user a la permission `view`** — déjà filtré par la policy en amont).

- `app/Http/Resources/Accounting/BankStatementLineResource.php`
  - Tous les champs + `match_status_label` ; `matched_payment` (whenLoaded — résolution polymorphique via `MatchedPaymentResource`).

- `app/Http/Resources/Accounting/MatchCandidateResource.php` — adapte le DTO `MatchCandidate`.

#### Policies

- `app/Policies/BankStatementPolicy.php` (extends `BasePolicy`) :
  - `viewAny(User $user, Agency $agency)` : `$user->agency_id === $agency->id` ET `$user->id === $agency->primary_admin_id || $user->hasRole(['agency_admin','accountant'], $agency)`.
  - `view(User $user, BankStatement $s)` : `viewAny($user, $s->agency)`.
  - `create(User $user, Agency $agency)` : `viewAny($user, $agency)`.
  - `finalize(User $user, BankStatement $s)` : `viewAny($user, $s->agency)`.
  - **Pas** d'override pour `super_admin` : `Gate::before` global déjà câblé.
  - **Note** : si le rôle `accountant` n'existe pas en seeder, on l'ajoute dans `RolesAndPermissionsSeeder` (sinon on se contente d'`agency_admin`).

- `app/Policies/BankStatementLinePolicy.php` :
  - `viewAny(User $user, BankStatement $s)` : delegate à `BankStatementPolicy::view($user, $s)`.
  - `match`, `unmatch`, `ignore` (User $user, BankStatementLine $line) : delegate à `viewAny($user, $line->statement)` ; **+ guard temporel** : `! $line->statement->status->isClosed()` (sinon 422 — mais c'est déjà géré dans `ReconciliationManager`, redondance UX).

#### Routes — `routes/api/accounting.php`

```php
use App\Http\Controllers\Api\Accounting\BankStatementController;
use App\Http\Controllers\Api\Accounting\BankStatementLineController;
use App\Http\Controllers\Api\Accounting\FinalizeBankStatementController;
use App\Http\Controllers\Api\Accounting\PaymentSearchController;

Route::middleware('auth:sanctum')->group(function () {
    Route::prefix('agencies/{agency}')->group(function () {
        Route::get('bank-statements', [BankStatementController::class, 'index']);
        Route::post('bank-statements', [BankStatementController::class, 'store']);
        Route::get('bank-statements/payment-search', PaymentSearchController::class);
    });

    Route::get('bank-statements/{statement}', [BankStatementController::class, 'show']);
    Route::get('bank-statements/{statement}/lines', [BankStatementLineController::class, 'index']);
    Route::post('bank-statements/{statement}/finalize', FinalizeBankStatementController::class);

    Route::post('bank-statement-lines/{line}/match', [BankStatementLineController::class, 'match']);
    Route::delete('bank-statement-lines/{line}/match', [BankStatementLineController::class, 'unmatch']);
    Route::post('bank-statement-lines/{line}/ignore', [BankStatementLineController::class, 'ignore']);
});
```
Enregistré dans `bootstrap/app.php` :
```php
->withRouting(api: __DIR__.'/../routes/api.php', then: function () {
    Route::middleware('api')->prefix('api')->group(base_path('routes/api/accounting.php'));
})
```
(Suit le pattern existant des autres `routes/api/*.php`.)

### Backend — tests

- `tests/Unit/Services/Accounting/StatementParser/CsvDriverTest.php` (4 tests) :
  1. `test_parses_default_csv_with_header` — fixture `tests/fixtures/bank/sample.csv` 100 lignes.
  2. `test_respects_agency_csv_mapping` — mapping custom (`;` separator, colonne `montant`, format date `Y-m-d`).
  3. `test_handles_signed_amounts` — sign convention `amount_signed` (négatif=debit, positif=credit).
  4. `test_skips_invalid_lines_logs_warning` — 2 lignes valides + 1 ligne avec date invalide → 2 ParsedLine + log.

- `tests/Unit/Services/Accounting/StatementParser/OfxDriverTest.php` (3 tests) :
  1. `test_parses_standard_ofx_v1` — fixture `tests/fixtures/bank/sample.ofx`.
  2. `test_extracts_currency_from_curdef` — fixture multi-devises.
  3. `test_handles_missing_optional_fields` — `<NAME>` absent → `counterparty=null`, OK.

- `tests/Unit/Services/Accounting/ReconciliationMatcherTest.php` (6 tests = 5+ scénarios scoring du ticket) :
  1. `test_exact_amount_and_reference_returns_score_95`
  2. `test_exact_amount_and_counterparty_returns_score_80`
  3. `test_amount_only_within_2_days_returns_score_70`
  4. `test_amount_only_with_multiple_candidates_picks_closest_date_score_60`
  5. `test_amount_only_with_ambiguous_candidates_returns_null` (2 candidats même score → unmatched, pas de proposition au hasard)
  6. `test_skips_already_reconciled_payments`
  7. `test_filters_by_agency_scope` (paiement autre agence ignoré)
  8. `test_filters_by_currency` (XOF ligne ne match pas EUR payment)

- `tests/Feature/Jobs/Accounting/ParseBankStatementJobTest.php` (3 tests) :
  1. `test_parses_csv_and_marks_ready_for_review` (AC1) — assert `lines_count = 100`, status `ready_for_review`.
  2. `test_dispatches_match_job_after_parse`.
  3. `test_handles_invalid_file_gracefully` — fichier corrompu → status reste `processing` + job log error (pas de crash silencieux).

- `tests/Feature/Jobs/Accounting/MatchBankStatementJobTest.php` (3 tests) :
  1. `test_writes_suggestions_for_matchable_lines` (AC2) — assert `match_status=suggested`, `match_confidence>=95` pour ligne avec exact amount + ref.
  2. `test_does_not_overwrite_user_confirmed_lines` (idempotence si re-run).
  3. `test_completes_in_under_30_seconds_for_200_lines` (AC10) — fixture 200 lignes, mesure micro-time, soft assertion warning si > 30s en CI.

- `tests/Feature/Api/Accounting/BankStatementImportTest.php` (4 tests) :
  1. `test_admin_uploads_csv_and_receives_202` (AC1).
  2. `test_duplicate_import_returns_422` (AC6) — upload 2× même fichier → 2e = 422 "Relevé déjà importé".
  3. `test_non_admin_cannot_upload_returns_403`.
  4. `test_validates_file_extension_returns_422` (PDF rejeté).

- `tests/Feature/Api/Accounting/BankStatementLineMatchTest.php` (5 tests) :
  1. `test_admin_confirms_match_updates_payment_and_line` (AC3) — POST match → vérifie `payment.bank_reconciled_at` et `payment.bank_statement_line_id` ; ActivityLog créé (AC11).
  2. `test_simple_agent_cannot_match_returns_403` (AC3 sub).
  3. `test_cross_agency_match_returns_403` (AC4) — line de agence A, payment de agence B.
  4. `test_currency_mismatch_returns_422` (AC5) — line EUR + payment XOF.
  5. `test_double_match_on_same_payment_returns_422` (AC9) — payment déjà rapproché.

- `tests/Feature/Api/Accounting/IgnoreLineTest.php` (2 tests) :
  1. `test_ignore_sets_status_and_decrements_remaining` (AC7).
  2. `test_ignoring_already_confirmed_line_unmatches_payment_first`.

- `tests/Feature/Api/Accounting/FinalizeStatementTest.php` (3 tests) :
  1. `test_finalize_with_all_confirmed_sets_reconciled` — toutes lignes confirmed → status `reconciled`.
  2. `test_finalize_with_unmatched_sets_partially_reconciled`.
  3. `test_finalize_locks_lines_subsequent_match_returns_422` (AC8) — finalize puis tenter `match` → 422 "relevé clôturé".

- `tests/Feature/Database/UniqueReconciliationIndexTest.php` (1 test) :
  1. `test_database_rejects_two_lines_pointing_to_same_payment` (AC9 — niveau DB) — bypass service, INSERT direct DB → unique violation.

### Frontend — types

- `takussan-web/src/types/reconciliation.ts`
  ```ts
  export type BankStatementStatus = 'processing' | 'ready_for_review' | 'partially_reconciled' | 'reconciled' | 'archived';
  export type BankStatementSourceFormat = 'csv' | 'ofx';
  export type LineMatchStatus = 'unmatched' | 'suggested' | 'confirmed' | 'ignored';
  export type LineDirection = 'credit' | 'debit';
  export type PaymentTypeKey = 'booking_payment' | 'lease_payment' | 'invoice';

  export interface BankStatement {
    id: number;
    agency_id: number;
    source_format: BankStatementSourceFormat;
    bank_name: string | null;
    account_iban_masked: string | null;
    period_start: string | null;
    period_end: string | null;
    lines_count: number;
    status: BankStatementStatus;
    status_label: string;
    finalized_at: string | null;
    reconciled_ratio: { confirmed: number; ignored: number; remaining: number; total: number };
    uploaded_by?: { id: number; first_name: string; last_name: string };
    created_at: string;
  }

  export interface BankStatementLine {
    id: number;
    bank_statement_id: number;
    posted_at: string;
    amount: string;          // decimal API → string
    direction: LineDirection;
    currency: string;
    label: string;
    reference: string | null;
    counterparty: string | null;
    match_status: LineMatchStatus;
    match_status_label: string;
    matched_payment_type: string | null;  // FQCN backend
    matched_payment_id: number | null;
    match_confidence: number | null;
    matched_payment?: MatchedPayment | null;
  }

  export interface MatchCandidate {
    id: number;
    type: PaymentTypeKey;
    label: string;
    amount: string;
    currency: string;
    reference: string | null;
    paid_at: string | null;
    payer_name: string | null;
  }
  ```

### Frontend — query layer

- `takussan-web/src/lib/queries/bank-statements.ts`
  - `BANK_STATEMENT_FIELDS` (sparse) + `BANK_STATEMENT_LINE_FIELDS`.
  - `fetchBankStatements(agencyId, token, params)` → `PaginatedResponse<BankStatement>`.
  - `fetchBankStatement(statementId, token)` → `BankStatement`.
  - `fetchBankStatementLines(statementId, token, params)` → `PaginatedResponse<BankStatementLine>`.
  - `uploadBankStatement(agencyId, file, source_format, token)` → `BankStatement` (FormData).
  - `confirmMatch(lineId, paymentType, paymentId, token)`.
  - `unmatchLine(lineId, token)`.
  - `ignoreLine(lineId, token)`.
  - `finalizeStatement(statementId, token)`.
  - `searchPaymentCandidates(agencyId, q, amount, token)` → `MatchCandidate[]`.
  - Tous les `fetch*` passent les sparse fields (mémoire utilisateur — obligatoire).

### Frontend — composants

- `takussan-web/src/app/(dashboard)/admin/finances/page.tsx` (étendu) :
  - Liste de cartes par sous-feature : "Rapprochement bancaire" (link `/admin/finances/reconciliation`), "Paiements" (placeholder), "Exports comptables" (placeholder). On ne casse pas l'existant.

- `takussan-web/src/app/(dashboard)/admin/finances/reconciliation/page.tsx` (RSC) :
  - Vérifie `isAdmin` server-side ; si KO → redirect.
  - Render `<ReconciliationLanding agency={agency} />` (client component).

- `takussan-web/src/components/finances/reconciliation/ReconciliationLanding.tsx` :
  - Header : titre, bouton primaire "Importer un relevé" (ouvre `<StatementUploadDialog />`).
  - `<StatementList agencyId={agency.id} />`.
  - Filtres : status, période (date range), source format.

- `takussan-web/src/components/finances/reconciliation/StatementUploadDialog.tsx` :
  - Drop-zone simple (file input stylé, drag&drop natif sur `<div>` + `dragover` events — pas de dépendance externe).
  - Auto-détection format à la sélection (`.ofx` → `ofx`, sinon `csv`).
  - Preview "10 premières lignes parsées" : appel d'un endpoint léger `POST /api/agencies/{id}/bank-statements/preview` ? **Décision** : pour ne pas multiplier les endpoints, on fait la preview **côté frontend** pour CSV (`papaparse` ? non — readAsText + split simple suffit pour les 10 premières lignes en CSV ; on ne preview pas l'OFX en V1, on affiche juste la taille fichier + nb estimé de transactions).
  - Sur submit → `uploadBankStatement` → toast + redirect vers `/admin/finances/reconciliation/{statementId}`.
  - Si 422 doublon → message clair non bloquant.

- `takussan-web/src/components/finances/reconciliation/StatementList.tsx` :
  - Table TanStack avec colonnes : Importé le, Banque, Période, Lignes, Statut, % rapproché, Actions (Ouvrir).
  - Badges status sobres (style guidelines existant) : `processing` = stone-100/stone-700 spinner, `ready_for_review` = blue-100/blue-700, `partially_reconciled` = amber-100/amber-700, `reconciled` = emerald-100/emerald-700, `archived` = stone-200/stone-500.

- `takussan-web/src/app/(dashboard)/admin/finances/reconciliation/[statementId]/page.tsx` :
  - RSC fetch initial via `fetchBankStatement` (avec token serveur).
  - Render `<StatementDetail statement={statement} />`.

- `takussan-web/src/components/finances/reconciliation/StatementDetail.tsx` :
  - `<StatementDetailHeader>` : période, banque, % rapproché (pie/progress bar), bouton "Finaliser" (disabled si `processing` ou `reconciled`).
  - `<StatementLinesTable>` : table paginée des lignes, mise en surbrillance selon `match_status` + `match_confidence` (cf. UX du ticket : ≥90 vert pâle prominent ; 60-89 neutre ; sans suggestion neutre).
  - Filtres : `match_status` chips (Tous / Suggérées / Non matchées / Confirmées / Ignorées).

- `takussan-web/src/components/finances/reconciliation/StatementLinesTable.tsx` :
  - Une ligne = `<StatementLineRow>`.
  - Colonnes : Date, Label (truncate + tooltip), Montant (avec direction +/-), Suggestion (`<MatchSuggestionBadge>`), Actions (`<LineActionsMenu>`).

- `takussan-web/src/components/finances/reconciliation/StatementLineRow.tsx` :
  - Si `match_status=suggested && confidence>=90` → fond `bg-emerald-50/60`, bouton primaire "Confirmer" (one-click → `confirmMatch`).
  - Si `suggested && confidence in [60,90)` → neutre, "Confirmer" + "Modifier" (`<ManualMatchDialog>`).
  - Si `unmatched` → "Trouver un paiement" (ouvre dialog) + "Ignorer".
  - Si `confirmed` → fond `bg-emerald-50`, badge "Rapproché", lien vers le payment + bouton "Annuler".
  - Si `ignored` → fond grisé, badge "Ignoré".

- `takussan-web/src/components/finances/reconciliation/ManualMatchDialog.tsx` :
  - Combobox Base UI `<PaymentSearchCombobox>` (réutilise `searchPaymentCandidates`) : autocomplete sur référence/nom/notes, hint montant pré-rempli avec celui de la ligne pour faciliter la recherche.
  - Affiche le candidat sélectionné (carte de résumé : type, montant, devise, payer, référence).
  - Bouton "Confirmer" → `confirmMatch(lineId, candidate.type, candidate.id)`.
  - Si erreur 422 (devise/cross-agency/déjà rapproché) → bannière en haut du dialog avec message i18n.

- `takussan-web/src/components/finances/reconciliation/PaymentSearchCombobox.tsx` :
  - Base UI Combobox + debounce 200ms (réutilise pattern `useSuggest` de TCK-107).
  - Affichage par groupes : `Booking payments`, `Lease payments`, `Invoices`.

### Frontend — i18n

- Ajout dans `takussan-web/src/messages/{fr,en,wo}.json` :
  ```json
  "admin": {
    "reconciliation": {
      "title": "Rapprochement bancaire",
      "subtitle": "Importez un relevé et validez les appariements proposés.",
      "list": { "import": "Importer un relevé", "empty": "Aucun relevé importé pour le moment." },
      "table": { "imported_at": "Importé le", "bank": "Banque", "period": "Période", "lines": "Lignes", "status": "Statut", "ratio": "Rapproché" },
      "status": { "processing": "Analyse…", "ready_for_review": "À vérifier", "partially_reconciled": "Partiel", "reconciled": "Clôturé", "archived": "Archivé" },
      "line_status": { "unmatched": "Non matchée", "suggested": "Suggérée", "confirmed": "Rapprochée", "ignored": "Ignorée" },
      "actions": { "confirm": "Confirmer", "edit": "Modifier", "find_payment": "Trouver un paiement", "ignore": "Ignorer", "unmatch": "Annuler", "finalize": "Finaliser le relevé" },
      "upload": { "title": "Importer un relevé", "drop_hint": "Déposez un fichier CSV ou OFX, ou cliquez pour choisir.", "preview_title": "Aperçu (10 premières lignes)", "submit": "Importer" },
      "manual": { "title": "Trouver un paiement", "search_placeholder": "Référence, nom du locataire, montant…", "submit": "Confirmer le rapprochement" },
      "errors": {
        "duplicate_file": "Ce relevé a déjà été importé.",
        "currency_mismatch": "Devise incompatible avec le paiement sélectionné.",
        "cross_agency": "Ce paiement n'appartient pas à votre agence.",
        "already_reconciled": "Ce paiement est déjà rapproché.",
        "statement_closed": "Le relevé est clôturé."
      }
    }
  }
  ```

### Frontend — tests

- `takussan-web/src/components/finances/reconciliation/__tests__/StatementUploadDialog.test.tsx` (3 tests) :
  1. Drop-zone accepte CSV et OFX, refuse PDF.
  2. Auto-détection du format à la sélection.
  3. Affiche le toast + redirect après upload réussi.

- `takussan-web/src/components/finances/reconciliation/__tests__/StatementLineRow.test.tsx` (4 tests) :
  1. Rendu suggested ≥90 → bouton "Confirmer" prominent + fond vert.
  2. Rendu suggested 60-89 → "Confirmer" + "Modifier" neutres.
  3. Rendu unmatched → "Trouver un paiement" + "Ignorer".
  4. Rendu confirmed → "Annuler" disponible.

- `takussan-web/src/components/finances/reconciliation/__tests__/ManualMatchDialog.test.tsx` (2 tests) :
  1. Recherche déclenchée après 200ms de pause.
  2. 422 currency_mismatch affiché en bannière.

- `takussan-web/src/lib/queries/__tests__/bank-statements.test.ts` (2 tests) :
  1. `fetchBankStatements` → params Spatie corrects (sparse fields, filter[status]).
  2. `confirmMatch` → POST body `{payment_type, payment_id}` correct.

### Documentation

- `docs/plans/2026-04-28-tck-109-bank-reconciliation.md` (court, ~80 lignes) :
  - Workflow comptable end-to-end (import → review → confirm/ignore → finalize).
  - Schéma des règles de scoring (table des seuils 95/80/70/60).
  - Format CSV par défaut + comment customiser via `agencies.bank_csv_mapping`.
  - Limitations connues : OFX V1 uniquement, pas d'auto-détection des virements internes, pas d'écriture comptable.

---

## Détails d'implémentation clés

### Pourquoi pas Spatie Pipeline pour le matcher

Le matcher pourrait être implémenté en pipeline (un Pipe par règle de scoring). Mais on n'a que 4 règles, et le score "max" se prête mal au pattern Pipeline (qui est plutôt fait pour transformations séquentielles). Une simple méthode `suggestFor` qui calcule les 4 scores en une passe et retourne le meilleur est plus lisible, plus testable (un test = un scénario isolé), et a l'avantage de fail-fast sur le 95 (pas besoin de calculer le 60 si on a déjà 95). L'extension future (ajouter une 5e règle) reste triviale — c'est juste une condition de plus.

### Pourquoi pas un endpoint preview backend

Le ticket demande un preview "10 premières lignes" avant validation de l'import. Deux options :
- Endpoint backend `POST /preview` qui parse-mais-ne-persiste-pas → duplication du parser, latence réseau.
- Preview frontend par lecture du fichier en JS → 0 latence, marche offline, mais on doit dupliquer la logique de parsing CSV en JS.

**Choisi** : preview frontend uniquement pour CSV (parsing trivial : `text.split('\n').slice(0, 11)`, on affiche les 10 premières lignes brutes — l'utilisateur sait à quoi ressemble son CSV). Pour OFX, pas de preview en V1 — on montre juste le nom de fichier + taille + format détecté ; le parsing complet a lieu côté serveur après upload.

Si l'UX se révèle insuffisante, ticket V2 : endpoint `/preview` backend.

### Pourquoi `bank_csv_mapping` séparé de `settings`

Le ticket précise *"Stocker le mapping sur `agencies.bank_csv_mapping` (json, nullable)"* — colonne dédiée, pas une clé de `settings`. Raison : le mapping est très structuré (delimiter, date_format, sign_convention…), volumineux, et lu/écrit dans un contexte unique (paramétrage relevé). Le mélanger à `settings` rendrait la validation moins claire (`AgencyUpdateRequest` passerait du temps sur des nested rules). On garde une frontière nette.

### Idempotence DB-level vs service-level

Le ticket exige : "un payment ne peut être rapproché qu'une seule ligne. Validé en base via index unique partiel". Trois couches de défense :
1. **DB** : index unique partiel `(bank_statement_line_id) WHERE bank_statement_line_id IS NOT NULL` sur les 3 tables payment.
2. **Service** : `ReconciliationManager::confirmMatch` vérifie `$payment->bank_statement_line_id === null` avant update.
3. **Lock** : `lockForUpdate()` sur la ligne dans la transaction de confirm.

Test dédié `UniqueReconciliationIndexTest` valide que **même en bypassant le service**, la base refuse. Ça garantit qu'un import concurrent (théorique) ne peut pas créer un double rapprochement.

**MySQL fallback** : MySQL ne supporte pas les `WHERE` sur les UNIQUE indexes, mais il accepte plusieurs NULL sur une colonne UNIQUE → un `unique('bank_statement_line_id')` non-partiel suffit (les paiements non rapprochés ont NULL, NULL ≠ NULL). On utilise le pattern `DB::statement` adapté au driver dans la migration.

### Anonymisation des notifications

Contrainte ticket : "ne jamais exposer dans une notification le contenu d'une ligne (peut contenir IBAN, identifiants tiers)". Donc dans `NotifyStatementImported.handle()`, le body utilise uniquement :
- `bank_name` (saisi par l'admin lui-même au moment de l'upload),
- `lines_count` (entier),
- `period_start/end` si présents (dates).

**JAMAIS** `label`, `reference`, `counterparty` (champs ligne). Test E2E manuel pour valider visuellement.

### Performance import (AC10)

Cible : 200 lignes OFX → import + match en < 30s. Décomposition :
- Parse OFX 200 lignes (regex SGML simple) : ~200ms.
- Insert chunked (`array_chunk(500)`) : 1 INSERT pour 200 lignes : ~50ms.
- Match : 200 lignes × 4 queries Eloquent (3 tables payment) × ~5ms cached query plan = ~4s. Acceptable.

Pour 5000 lignes (cible ticket "performance"), il faut :
- Utiliser `cursor()` sur les lines à matcher (pas `get()`).
- Pré-loader **par batch** les paiements de l'agence non rapprochés sur la fenêtre `[min(posted_at)-7d, max(posted_at)+7d]` → 1 seule query par table, indexé par `(agency_id, paid_at, currency)`.
- Filtrer en mémoire par ligne. C'est ce que `ReconciliationMatcher::suggestFor` fait pour 1 ligne ; pour scaler, on ajoute `MatchBankStatementJob` qui pré-charge le pool une fois et passe au matcher.

Pas d'optim pré-mature pour V1 (les agences ont rarement des relevés > 500 lignes/mois) ; le test de perf est **soft** (warning si > 30s).

### Stratégie Spatie Media pour le fichier brut

`BankStatement::registerMediaCollections` :
```php
public function registerMediaCollections(): void {
    $this->addMediaCollection('statement')->singleFile()->useDisk('local');
}
```

Avantages :
- Disque privé natif (pas accessible publiquement).
- Signed URLs automatiques pour téléchargement par admin (`$media->getTemporaryUrl(now()->addMinutes(5))` si on passe sur S3 ; sur local, `media-library:download` route ou stream via Spatie controller).
- Metadata (filename, mime, size) gérée par Spatie.
- Cohérence avec `Property::photos`, `Document::file`.

Pour la V1, l'admin peut télécharger le fichier original via une URL stream protégée (`GET /api/bank-statements/{id}/file` → vérifie policy `view`, puis stream `Storage::disk('local')->response($media->getPath())` — endpoint optionnel non coté dans le ticket). Si non implémenté, le file_path reste interne, l'admin a juste accès aux lignes parsées.

### Mapping `payment_type` short-key ↔ FQCN

Le frontend manipule `'booking_payment'` / `'lease_payment'` / `'invoice'` (lisible, stable). Le backend stocke FQCN (`App\Models\BookingPayment` etc.) car aucun morph map n'est registered globalement. Mapping côté `BankStatementLineController::match` :
```php
private const PAYMENT_TYPE_MAP = [
    'booking_payment' => BookingPayment::class,
    'lease_payment' => LeasePayment::class,
    'invoice' => Invoice::class,
];
$paymentClass = self::PAYMENT_TYPE_MAP[$request->validated('payment_type')];
$payment = $paymentClass::findOrFail($request->validated('payment_id'));
```
Et inverse côté `BankStatementLineResource` :
```php
'matched_payment_type' => $this->matched_payment_type ? array_search($this->matched_payment_type, self::PAYMENT_TYPE_MAP, true) : null,
```

Évite de toucher `AppServiceProvider` (morph map global avec impact transverse).

### Activity log — événements automatiques vs manuels

Le trait `Auditable` log auto les fillable dirty (donc create + update sur les colonnes fillable). Mais on veut un log explicite par **type d'event métier** (matched, ignored, finalized) — d'où les appels manuels `activity()->event('matched')->log('matched')` dans le `ReconciliationManager`. AC11 vérifie qu'on a au minimum 1 ActivityLog par action utilisateur.

### Écriture des index uniques partiels — gestion cross-driver

```php
$driver = DB::getDriverName();
if (in_array($driver, ['pgsql', 'sqlite'], true)) {
    DB::statement("CREATE UNIQUE INDEX booking_payments_bank_line_unique ON booking_payments (bank_statement_line_id) WHERE bank_statement_line_id IS NOT NULL");
} else {
    // MySQL: les NULL multiples sont autorisés sur UNIQUE
    Schema::table('booking_payments', fn ($t) => $t->unique('bank_statement_line_id', 'booking_payments_bank_line_unique'));
}
```
Encapsulé dans une fonction `addPartialUnique($table, $column)` réutilisée par les 3 migrations.

---

## Mapping critères d'acceptation → vérifications

| AC | Vérification |
|---|---|
| **AC1** — Import CSV 100 lignes → status `ready_for_review` avec 100 lignes en base | `ParseBankStatementJobTest::test_parses_csv_and_marks_ready_for_review` + `BankStatementImportTest::test_admin_uploads_csv_and_receives_202` (smoke 100 lignes en E2E) |
| **AC2** — Lignes avec amount + reference exact → `match_status=suggested`, `confidence>=95` | `MatchBankStatementJobTest::test_writes_suggestions_for_matchable_lines` + `ReconciliationMatcherTest::test_exact_amount_and_reference_returns_score_95` |
| **AC3** — Confirm match → `bank_reconciled_at` + `bank_statement_line_id` mis à jour ; agent simple → 403 | `BankStatementLineMatchTest::test_admin_confirms_match_updates_payment_and_line` + `test_simple_agent_cannot_match_returns_403` |
| **AC4** — Cross-agency match → 403 | `BankStatementLineMatchTest::test_cross_agency_match_returns_403` |
| **AC5** — Match EUR ↔ XOF → 422 | `BankStatementLineMatchTest::test_currency_mismatch_returns_422` |
| **AC6** — Réimport même fichier → 422 "Relevé déjà importé" | `BankStatementImportTest::test_duplicate_import_returns_422` |
| **AC7** — Ignore une ligne → status `ignored`, ratio remaining décrémente | `IgnoreLineTest::test_ignore_sets_status_and_decrements_remaining` |
| **AC8** — Finalize → DELETE match suivant retourne 422 "relevé clôturé" | `FinalizeStatementTest::test_finalize_locks_lines_subsequent_match_returns_422` |
| **AC9** — Un payment ne peut être rapproché qu'une seule fois | `BankStatementLineMatchTest::test_double_match_on_same_payment_returns_422` + `UniqueReconciliationIndexTest::test_database_rejects_two_lines_pointing_to_same_payment` |
| **AC10** — OFX 200 lignes → import + match en < 30s | `MatchBankStatementJobTest::test_completes_in_under_30_seconds_for_200_lines` (soft assertion CI) + smoke manuel chrono |
| **AC11** — Chaque action produit un ActivityLog | Asserts dans tous les tests `match`, `unmatch`, `ignore`, `finalize` : `Activity::where('subject_id', $line->id)->where('event', 'matched')->exists()` |
| **AC12** — UI affiche ratio `X/Y` + état clair par ligne | `StatementLineRow.test.tsx` (4 cas de rendu visuels) + smoke manuel sur la page detail |

---

## Variables d'environnement

**Aucune nouvelle variable**. Toutes les configs (queue name `reconciliation`, parser drivers) sont en dur dans le code. Le mapping CSV par agence vit en DB (`agencies.bank_csv_mapping`).

À noter : si le déploiement utilise un worker queue dédié pour la queue `reconciliation`, l'opérateur ajoutera `QUEUE_CONNECTION=database` (déjà configuré) + lancer un worker `php artisan queue:work --queue=reconciliation,default`. Pas de changement infra requis pour la V1.

---

## Étapes d'exécution (ordre recommandé)

### Backend

1. **Composer** : `composer require league/csv:^9.16`. Pas de package OFX (parser maison).
2. **Enums** : `BankStatementStatus`, `BankStatementLineMatchStatus`, `BankStatementSourceFormat`, `BankStatementLineDirection` + tests d'enum (smoke).
3. **Migrations** (6 fichiers) — `php artisan migrate` smoke + `migrate:fresh --seed` pour confirmer.
4. **Modèles** : `BankStatement` (avec InteractsWithMedia, Auditable, HasQueryBuilder, registerMediaCollections), `BankStatementLine` ; étendre `BookingPayment`, `LeasePayment`, `Invoice`, `Agency` (fillable + casts + relations).
5. **Étendre `NotificationType`** + i18n `notifications.php` + nouveau `lang/{locale}/reconciliation.php`.
6. **Services parser** (purement fonctionnels) : `ParserContext`, `ParsedLine`, `CsvDriver`, `OfxDriver`, `StatementParserFactory` + tests unitaires (CsvDriver × 4, OfxDriver × 3).
7. **`ReconciliationMatcher`** + tests unit (8 scénarios scoring).
8. **`PaymentSearchService`** + tests unit (1 test smoke).
9. **`ReconciliationManager`** (confirm/unmatch/ignore/finalize) + tests unit avec mocks (couverture des guards).
10. **Events + Listeners** + registration `AppServiceProvider`.
11. **Policies** `BankStatementPolicy`, `BankStatementLinePolicy`.
12. **FormRequests** (`StoreBankStatementRequest`, `MatchBankStatementLineRequest`).
13. **Resources** (`BankStatementResource`, `BankStatementLineResource`, `MatchCandidateResource`).
14. **Controllers** (4 controllers : 2 resource + 1 single-action `Finalize` + 1 single-action `PaymentSearch`).
15. **Routes** : créer `routes/api/accounting.php`, l'enregistrer dans `bootstrap/app.php`.
16. **Tests Feature API** (`BankStatementImportTest` × 4, `BankStatementLineMatchTest` × 5, `IgnoreLineTest` × 2, `FinalizeStatementTest` × 3, `UniqueReconciliationIndexTest` × 1).
17. **Jobs** : `ParseBankStatementJob`, `MatchBankStatementJob` + tests Feature (`ParseBankStatementJobTest` × 3, `MatchBankStatementJobTest` × 3).
18. **Lint** `./vendor/bin/pint` (mémoire utilisateur — obligatoire avant commit).

### Frontend

19. **Types** `src/types/reconciliation.ts`.
20. **Query layer** `src/lib/queries/bank-statements.ts` + tests Vitest (sparse fields obligatoires).
21. **Composants atomiques** : `<MatchSuggestionBadge>`, `<LineActionsMenu>`, `<PaymentSearchCombobox>` (réutilise pattern Combobox de TCK-107).
22. **Composants reconciliation** :
    - `<StatementUploadDialog>` (preview CSV simple, gestion erreur duplicate).
    - `<StatementList>` + `<ReconciliationLanding>`.
    - `<StatementLinesTable>` + `<StatementLineRow>` + `<StatementDetailHeader>`.
    - `<ManualMatchDialog>`.
23. **Pages** : étendre `app/(dashboard)/admin/finances/page.tsx` (cartes index) ; créer `reconciliation/page.tsx` + `reconciliation/[statementId]/page.tsx`.
24. **i18n** `admin.reconciliation.*` dans fr/en/wo.
25. **Tests** Vitest (`StatementUploadDialog` × 3, `StatementLineRow` × 4, `ManualMatchDialog` × 2, `bank-statements queries` × 2).
26. **Lint** `npm run lint`.

### Final

27. **Documentation** `docs/plans/2026-04-28-tck-109-bank-reconciliation.md`.
28. **INDEX.md** : passer TCK-109 `todo → review` à l'ouverture de la PR ; **target = `dev`** (mémoire utilisateur).
29. **Commit du plan** : `docs(TCK-109): add bank reconciliation implementation plan` (à l'image de TCK-105/106/107/108).

---

## Vérification end-to-end

### Tests automatisés ciblés

```bash
# Backend
cd takussan-api
php artisan test --filter='Statement|Reconciliation|Accounting|UniqueReconciliation'   # toutes vertes
php artisan test                                                                        # pas de régression

# Frontend
cd takussan-web
npx vitest run --reporter=verbose src/components/finances/reconciliation src/lib/queries/bank-statements
npm run lint
```

### Smoke manuel

1. **Backend** : seeder local (`php artisan migrate:fresh --seed`) — agence A avec primary_admin + 3 leases + 5 lease_payments `paid` non rapprochés (devise XOF, refs `LP-2026-001` à `LP-2026-005`).
2. `php artisan serve --port=8002` + `php artisan queue:work --queue=reconciliation,default` (worker actif).
3. `curl -X POST http://localhost:8002/api/agencies/{A.id}/bank-statements -F "file=@tests/fixtures/bank/sample.csv" -F "source_format=csv" -F "bank_name=BNP Paribas" -H "Authorization: Bearer {token primary_admin A}"` → 202 + status `processing`.
4. Attendre 2s (queue) → `GET /api/bank-statements/{id}` → status `ready_for_review`, `lines_count=100`, AppNotification créée pour uploadedBy.
5. `GET /api/bank-statements/{id}/lines?filter[match_status]=suggested` → liste les lignes suggérées avec `match_confidence` ≥ 60.
6. `POST /api/bank-statement-lines/{lineId}/match` body `{payment_type:'lease_payment', payment_id: X}` → 200, JSON `match_status=confirmed` + `LeasePayment::find(X)->bank_reconciled_at` non null.
7. **Cross-agency** : créer agence B avec un payment, tenter `match` avec un line de A pointant payment_id de B → 403.
8. **Devise mismatch** : forcer un payment EUR sur un line XOF (via tinker) → POST match → 422 `currency_mismatch`.
9. **Doublon import** : `curl -X POST` exactement le même fichier → 422 `Relevé déjà importé`.
10. **Ignore** : `POST /api/bank-statement-lines/{id}/ignore` → status `ignored`.
11. **Finalize** : `POST /api/bank-statements/{id}/finalize` → status `partially_reconciled` ou `reconciled` selon le ratio. Tenter `match` ensuite → 422 `statement_closed`.
12. **Audit** : `php artisan tinker → \Spatie\Activitylog\Models\Activity::latest()->take(10)->get(['event','description','subject_type','subject_id','causer_id'])` → 10 events couvrant import, match, ignore, finalize.

13. **Frontend** : `npm run dev`, login primary_admin A, aller `/admin/finances` → carte "Rapprochement bancaire" → `/admin/finances/reconciliation`. Liste vide initialement.
14. Cliquer "Importer un relevé" → drop CSV → preview 10 lignes → submit → row apparaît avec status `processing`, puis `ready_for_review` après 2s (refresh).
15. Cliquer la row → page détail. Lignes suggérées en surbrillance verte pour confidence ≥ 90 — bouton "Confirmer" one-click. Ligne unmatched → bouton "Trouver un paiement" → dialog avec recherche (taper `LP-2026` → propose les 5 lease_payments) → sélectionner → confirmer → row passe `confirmed`.
16. Filtrer par "Confirmées" → ne montre que les rapprochées.
17. Cliquer "Finaliser" → confirmation → status passe à `partially_reconciled`. Tenter de réannuler une ligne confirmée → bannière 422 "relevé clôturé".
18. **i18n** : switch locale en/wo → labels traduits dans la page et les notifications.
19. **a11y** : Lighthouse sur `/admin/finances/reconciliation/{id}` — Accessibility ≥ 90.

### Pint / lint

- `./vendor/bin/pint --test` (backend) : pas de diff.
- `npm run lint` (frontend) : pas de warning.

---

## Hors périmètre (rappel + simplifications)

Repris du ticket :

- **Connexion bancaire directe (PSD2 / Open Banking)** — V2 ou ticket dédié.
- **Génération automatique d'écritures comptables (FEC, journaux)** — couvert par un autre ticket d'export comptable.
- **ML/IA pour scoring d'appariement** — V1 reste sur heuristiques déterministes (4 règles).
- **Multi-banques agrégées sur un même relevé** — un relevé = un compte.
- **Rapprochement intercompte (virements internes)** — détecté comme `ignored` manuellement.
- **Réconciliation des `Payout` (TCK-079)** — ticket dédié si besoin.
- **UI mobile dédiée** — desktop-first ; responsive minimum.

Simplifications explicites du plan :

- **Pas de package OFX** : parser maison (~80 lignes). Évite une dépendance fragile pour une grammaire SGML simple. Si on rencontre un OFX exotique en prod, ticket dédié pour étoffer le parser ou intégrer une lib mature.
- **Preview CSV en frontend uniquement** : pas d'endpoint `/preview` backend en V1. L'utilisateur voit ses 10 premières lignes telles quelles ; le mapping est appliqué après upload.
- **Pas d'endpoint download du fichier brut** : le file_path reste interne. Un admin qui veut le fichier d'origine peut récupérer via SSH/storage. Ticket V2 si demande utilisateur émerge.
- **Pas de notification pour `BankStatementLineMatched`** : trop bruyant (potentiellement N par relevé). On dispatch l'event pour permettre une intégration downstream future, mais aucun listener notification en V1.
- **Pas de rôle dédié `accountant`** : si non présent en seeder, on étend la policy à `agency_admin` (un admin peut faire la compta). Création du rôle = ticket dédié si l'organisation veut séparer les responsabilités.
- **Index unique partiel** : adapté au driver (`pgsql`/`sqlite` → partial WHERE ; `mysql` → unique normal sur colonne nullable, NULL multiples acceptés). Code dans la migration.
- **Pas de scheduler** : le matching est lancé en queue après l'import (one-shot par statement), pas de cron récurrent. Aucun ajout dans `routes/console.php`.
