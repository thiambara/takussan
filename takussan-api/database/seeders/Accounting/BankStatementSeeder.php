<?php

namespace Database\Seeders\Accounting;

use App\Events\Accounting\BankStatementFinalized;
use App\Events\Accounting\BankStatementImported;
use App\Jobs\Accounting\MatchBankStatementLinesJob;
use App\Jobs\Accounting\ParseBankStatementJob;
use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\BookingPayment;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\BankStatementLineMatchStatus;
use App\Models\Enums\BankStatementStatus;
use App\Models\Enums\IgnoredPaymentReason;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\ReconciliationIgnoredPayment;
use App\Models\User;
use App\Services\Accounting\IgnoredPaymentService;
use App\Services\Accounting\ReconciliationManager;
use App\Services\Accounting\ReconciliationOverviewService;
use App\Services\Accounting\StatementParser\CsvDriver;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Database\Seeders\Support\Tirage;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Event;
use RuntimeException;

/**
 * TCK-2381 — le rapprochement bancaire des trois derniers mois clos de chaque agence, par le chemin de
 * l'application : le relevé CSV déposé comme le fait `BankStatementController::store` (fichier au disque
 * privé, mapping figé), lu par `ParseBankStatementJob` puis apparié par le matcher, confirmé par
 * `ReconciliationManager`, clôturé — sauf le dernier mois, laissé en cours de revue.
 *
 * Les lignes DÉRIVENT de ce qui est semé : un crédit par encaissement que le compte de l'agence reçoit
 * (au montant que le matcher attend, `expectedBankAmount()`, sous sa référence), un débit par reversement
 * émis (son net), et les frais bancaires du mois, ignorés. Les espèces et le Free Money n'arrivent pas sur
 * ce compte : l'agence sort l'un de chacun du reste à rapprocher (`IgnoredPaymentService`).
 *
 * L'analyse et l'appariement sont joués en ligne, et non mis en file : la file `sync` diffère ses jobs à la
 * validation de la transaction englobante (`after_commit`), et la revue doit les suivre.
 * Les avis d'import et de clôture ne partent pas pendant le seed (aucun envoi sortant).
 */
class BankStatementSeeder extends Seeder
{
    private const MOIS = 3;

    private const FRAIS_DE_TENUE = 5000;

    /** Les moyens qui n'arrivent pas sur le compte bancaire, et le motif qui les sort du reste à rapprocher. */
    private const HORS_DU_COMPTE = [
        'cash' => [IgnoredPaymentReason::CashKept, 'Loyer réglé en espèces au bureau'],
        'free_money' => [IgnoredPaymentReason::OtherAccount, 'Encaissé sur le compte Free Money de l\'agence'],
    ];

    public function __construct(
        private readonly SeedingContext $ctx,
        private readonly IgnoredPaymentService $ignored,
    ) {}

    /** Résolu SOUS le faux des avis : le gestionnaire garde le répartiteur reçu à sa construction. */
    private ReconciliationManager $manager;

    public function run(): void
    {
        Event::fakeFor(function (): void {
            $this->manager = app(ReconciliationManager::class);
            foreach ($this->ctx->agencies as $agency) {
                $admin = $agency->primary_admin_id !== null ? User::query()->find($agency->primary_admin_id) : null;
                if ($admin === null) {
                    continue;
                }
                // Rien à déposer (aucun encaissement ni reversement sur trois mois, ou relevés déjà là) n'est
                // pas une faute ; des relevés déposés dont rien ne se rapproche en est une.
                [$deposes, $confirmees] = $this->agence($agency, $admin);
                if ($deposes > 0 && $confirmees === 0 && $agency->kind === AgencyKind::Standard) {
                    throw new RuntimeException("BankStatementSeeder : aucune ligne rapprochée pour l'agence standard {$agency->id}.");
                }
            }
        }, [BankStatementImported::class, BankStatementFinalized::class]);
    }

    /** @return array{0: int, 1: int} relevés déposés, lignes confirmées */
    private function agence(Agency $agency, User $admin): array
    {
        $deposes = 0;
        $confirmees = 0;
        $courant = CarbonImmutable::now()->startOfMonth();
        for ($i = self::MOIS; $i >= 1; $i--) {
            $confirmes = $this->releve($agency, $admin, $courant->subMonths($i), $i === 1);
            if ($confirmes !== null) {
                $deposes++;
                $confirmees += $confirmes;
            }
        }
        $this->horsDuCompte($agency, $admin);

        return [$deposes, $confirmees];
    }

    /** Les lignes confirmées du relevé déposé, ou `null` si rien n'a été déposé. */
    private function releve(Agency $agency, User $admin, CarbonImmutable $mois, bool $dernier): ?int
    {
        $lignes = $this->lignes($agency, $mois);
        if ($lignes->isEmpty()) {
            return null;
        }
        $csv = "date,amount,label,reference,counterparty\n".$lignes
            ->sortBy(fn (array $l) => $l['date']->format('Ymd').$l['reference'])
            ->map(fn (array $l) => implode(',', [$l['date']->format('d/m/Y'), $l['montant'], $this->champ($l['libelle']), $l['reference'], $this->champ($l['contrepartie'])]))
            ->implode("\n")."\n";
        $hash = hash('sha256', $csv);
        if (BankStatement::query()->where('agency_id', $agency->id)->where('file_hash', $hash)->exists()) {
            return null;
        }

        $depot = $mois->endOfMonth()->addDays(Tirage::un([2, 3, 4]))->setTime(9, 30);
        $statement = Timeline::aLaDate($depot, function () use ($agency, $admin, $csv, $hash, $mois): BankStatement {
            $statement = BankStatement::create([
                'agency_id' => $agency->id,
                'uploaded_by' => $admin->id,
                'source_format' => 'csv',
                'file_hash' => $hash,
                'bank_name' => 'CBAO',
                'account_iban_masked' => 'SN08 **** **** **** 4512',
                'status' => BankStatementStatus::Processing->value,
                'csv_mapping' => CsvDriver::effectiveMapping($agency->bank_csv_mapping),
            ]);
            $statement->addMediaFromString($csv)
                ->usingFileName('releve-'.$mois->format('Y-m').'.csv')
                ->toMediaCollection('statement');
            // Les deux jobs du dépôt, joués ICI : la file `sync` diffère ses jobs à la validation de la
            // transaction englobante (`after_commit`), et la revue qui suit trouvait un relevé encore
            // `processing`. L'enchaînement que le job met en file rejoue ensuite à vide (idempotent).
            app()->call([new ParseBankStatementJob($statement->id), 'handle']);
            $nonApparies = $statement->lines()->where('match_status', BankStatementLineMatchStatus::Unmatched->value)->orderBy('id')->pluck('id');
            foreach ($nonApparies->chunk(MatchBankStatementLinesJob::LOT) as $lot) {
                app()->call([new MatchBankStatementLinesJob($statement->id, $lot->map(fn ($id) => (int) $id)->values()->all()), 'handle']);
            }

            return $statement->refresh();
        });
        if ($statement->status !== BankStatementStatus::ReadyForReview) {
            throw new RuntimeException("BankStatementSeeder : le relevé {$statement->id} n'a pas été lu ({$statement->status->value}).");
        }

        // La revue, le lendemain du dépôt : les propositions sûres confirmées d'un geste, les frais ignorés.
        return Timeline::aLaDate($depot->addDay()->setTime(10, 15), function () use ($agency, $admin, $statement, $dernier): int {
            $sures = $statement->lines()
                ->where('match_status', BankStatementLineMatchStatus::Suggested->value)
                ->where('match_confidence', '>=', ReconciliationManager::BATCH_MIN_CONFIDENCE)
                ->orderBy('id')
                ->pluck('id');
            // Le dernier mois reste en cours : un tiers des propositions attend encore sa confirmation.
            if ($dernier) {
                $sures = $sures->take((int) ceil($sures->count() * 2 / 3));
            }
            $confirmees = $sures->isEmpty() ? [] : $this->manager->confirmSuggestedBatch($agency, $sures->map(fn ($id) => (int) $id)->all(), $admin);

            foreach ($statement->lines()->where('match_status', BankStatementLineMatchStatus::Unmatched->value)->where('label', 'like', 'Frais%')->get() as $frais) {
                $this->manager->ignore($frais, $admin);
            }
            if (! $dernier) {
                $this->manager->finalize($statement->refresh(), $admin);
            }

            return count($confirmees);
        });
    }

    /**
     * @return Collection<int, array{date: CarbonImmutable, montant: string, libelle: string, reference: string, contrepartie: string}>
     */
    private function lignes(Agency $agency, CarbonImmutable $mois): Collection
    {
        [$debut, $fin] = [$mois->startOfMonth(), $mois->endOfMonth()];
        $lignes = collect();

        LeasePayment::query()->awaitingBankCredit((int) $agency->id)
            ->where('status', PaymentStatus::Paid->value)
            ->whereNotIn('payment_method', array_keys(self::HORS_DU_COMPTE))
            ->whereBetween('paid_at', [$debut, $fin])
            ->with('payer:id,first_name,last_name')
            ->orderBy('id')
            ->get()
            ->each(function (LeasePayment $p) use ($lignes, $fin): void {
                $lignes->push($this->credit($p->paid_at, $fin, $p->expectedBankAmount(), $p->reference_number, $p->payer?->first_name.' '.$p->payer?->last_name));
            });

        BookingPayment::query()->awaitingBankCredit((int) $agency->id)
            ->where('status', PaymentStatus::Paid->value)
            ->whereNotIn('payment_method', array_keys(self::HORS_DU_COMPTE))
            ->whereBetween('paid_at', [$debut, $fin])
            ->orderBy('id')
            ->get()
            ->each(function (BookingPayment $p) use ($lignes, $fin): void {
                $lignes->push($this->credit($p->paid_at, $fin, (float) $p->amount, $p->reference_number, 'Client réservation'));
            });

        Payout::query()
            ->where('agency_id', $agency->id)
            ->where('status', PayoutStatus::Completed->value)
            ->whereNull('bank_reconciled_at')
            ->whereBetween('processed_at', [$debut, $fin])
            ->with('landlord:id,first_name,last_name')
            ->orderBy('id')
            ->get()
            ->each(function (Payout $p) use ($lignes): void {
                $lignes->push([
                    'date' => CarbonImmutable::parse($p->processed_at)->startOfDay(),
                    'montant' => '-'.number_format((float) $p->net_amount, 0, '.', ''),
                    'libelle' => 'Virement émis '.$p->reference_number,
                    'reference' => (string) $p->reference_number,
                    'contrepartie' => trim($p->landlord?->first_name.' '.$p->landlord?->last_name),
                ]);
            });

        if ($lignes->isNotEmpty()) {
            $lignes->push([
                'date' => $fin->startOfDay(),
                'montant' => '-'.self::FRAIS_DE_TENUE,
                'libelle' => 'Frais de tenue de compte',
                'reference' => '',
                'contrepartie' => 'CBAO',
            ]);
        }

        return $lignes;
    }

    /** @return array{date: CarbonImmutable, montant: string, libelle: string, reference: string, contrepartie: string} */
    private function credit(mixed $payeLe, CarbonImmutable $fin, float $montant, ?string $reference, string $contrepartie): array
    {
        // Le virement arrive le jour même ou le lendemain, sans sortir du mois du relevé.
        $date = CarbonImmutable::parse($payeLe)->startOfDay()->addDays(Tirage::un([0, 0, 1]));

        return [
            'date' => $date->greaterThan($fin) ? $fin->startOfDay() : $date,
            'montant' => number_format($montant, 0, '.', ''),
            'libelle' => 'Virement reçu '.$reference,
            'reference' => (string) $reference,
            'contrepartie' => trim($contrepartie),
        ];
    }

    /**
     * Ce qui n'arrivera jamais sur ce compte, sorti du reste à rapprocher par l'agence : un loyer payé en
     * espèces au bureau, et un loyer encaissé sur le compte Free Money de l'agence — le plus récent des
     * trois mois de relevés, pour chacun.
     *
     * TCK-2381 (CI de #1688) — ces deux moyens pèsent 15 % des loyers, tirés à des dates relatives au jour
     * du seed : sur trois mois d'une petite agence, il arrive qu'aucun ne tombe (mesuré en CI, agence 1524),
     * et la table restait vide pour elle. Repli déterministe : le plus récent loyer encaissé AVANT le premier
     * relevé importé n'aura jamais de ligne non plus (il est arrivé sur l'ancien compte) ; l'agence le sort.
     * Une agence qui n'a encaissé aucun loyer n'a rien à sortir.
     */
    private function horsDuCompte(Agency $agency, User $admin): void
    {
        $courant = CarbonImmutable::now()->startOfMonth();
        $premierReleve = $courant->subMonths(self::MOIS);
        $aRapprocher = fn () => LeasePayment::query()->awaitingBankCredit((int) $agency->id)
            ->where('status', PaymentStatus::Paid->value)
            ->whereNotNull('paid_at')
            ->whereNotExists(fn ($q) => $q->selectRaw('1')->from('reconciliation_ignored_payments as r')
                ->where('r.payable_type', LeasePayment::class)
                ->whereColumn('r.payable_id', 'lease_payments.id'))
            ->orderByDesc('paid_at')
            ->orderByDesc('id');

        $sortis = 0;
        foreach (self::HORS_DU_COMPTE as $moyen => [$motif, $note]) {
            $paiement = $aRapprocher()->where('payment_method', $moyen)->whereBetween('paid_at', [$premierReleve, $courant])->first();
            if ($paiement !== null) {
                $this->sortir($agency, $admin, $paiement, $motif, $note, CarbonImmutable::parse($paiement->paid_at)->endOfMonth()->addDays(6));
                $sortis++;
            }
        }
        if ($sortis > 0 || ReconciliationIgnoredPayment::query()->where('agency_id', $agency->id)->exists()) {
            return;
        }

        $ancien = $aRapprocher()->where('paid_at', '<', $premierReleve)->first();
        if ($ancien !== null) {
            $this->sortir($agency, $admin, $ancien, IgnoredPaymentReason::OtherAccount, 'Encaissé sur l\'ancien compte, avant le premier relevé importé', $premierReleve->endOfMonth()->addDays(6));
        }
    }

    private function sortir(Agency $agency, User $admin, LeasePayment $paiement, IgnoredPaymentReason $motif, string $note, CarbonImmutable $le): void
    {
        Timeline::aLaDate($le->setTime(11, 0)->min(CarbonImmutable::now()->subHour()), fn () => $this->ignored->ignore(
            $agency,
            (string) array_search(LeasePayment::class, ReconciliationOverviewService::PAYMENT_TYPES, true),
            (int) $paiement->id,
            $motif,
            $note,
            $admin,
        ));
    }

    private function champ(string $valeur): string
    {
        return str_replace([',', "\n"], ' ', $valeur);
    }
}
