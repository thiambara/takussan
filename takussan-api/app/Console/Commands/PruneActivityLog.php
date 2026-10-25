<?php

namespace App\Console\Commands;

use App\Models\Activity;
use Carbon\CarbonInterface;
use Closure;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-2342 (P19.04, ADR-0044 amendement du 2026-10-25) — décision du porteur : le journal d'activité
 * se conserve par FAMILLE de journaux (`log_name`), durées écrites dans la politique de
 * confidentialité (`takussan-web/src/content/legal/privacy.ts`, § 6) et dans TCK-537 :
 *
 * - 12 mois par défaut, et pour tout journal qu'aucune liste ne nomme (`log_name` nul compris) ;
 * - 5 ans pour les journaux de preuve ({@see self::PROOF_LOG_NAMES}) ;
 * - 10 ans pour les journaux des pièces comptables ({@see self::ACCOUNTING_LOG_NAMES}).
 *
 * `activitylog:clean` du paquet ne sait pas exclure un journal : c'est celle-ci qui est planifiée
 * (`routes/console.php`). Elle supprime par lots, au-delà de la durée comptée depuis `created_at` ;
 * idempotente — une suppression par date, qu'une seconde exécution trouve vide.
 */
class PruneActivityLog extends Command
{
    public const DEFAULT_RETENTION_MONTHS = 12;

    public const PROOF_RETENTION_YEARS = 5;

    public const ACCOUNTING_RETENTION_YEARS = 10;

    /** Consultations de données personnelles, droits, sécurité, support, KYC, compte, rôles, intégrations, exports. */
    public const PROOF_LOG_NAMES = [
        'PersonalDataAccess', 'Privacy', 'Security', 'UserSupport', 'KYC', 'KycDossier',
        'Account', 'Membership', 'AgencyRole', 'Integration', 'export',
    ];

    /** Les pièces comptables, que l'Acte uniforme OHADA garde 10 ans. */
    public const ACCOUNTING_LOG_NAMES = [
        'LeasePayment', 'BookingPayment', 'Invoice', 'Payout', 'PlatformPayout', 'CommissionEntry', 'Billing',
    ];

    protected $signature = 'audit:prune-activity-log {--batch=1000 : Lignes supprimées par requête}';

    protected $description = 'Supprime les lignes du journal d’activité au-delà de la durée de leur famille (12 mois, 5 ans, 10 ans).';

    public function handle(): int
    {
        $batch = max(1, (int) $this->option('batch'));
        $named = [...self::PROOF_LOG_NAMES, ...self::ACCOUNTING_LOG_NAMES];

        $deleted = $this->purge(
            fn (Builder $q) => $q->whereIn('log_name', self::PROOF_LOG_NAMES),
            now()->subYears(self::PROOF_RETENTION_YEARS),
            $batch,
        );
        $deleted += $this->purge(
            fn (Builder $q) => $q->whereIn('log_name', self::ACCOUNTING_LOG_NAMES),
            now()->subYears(self::ACCOUNTING_RETENTION_YEARS),
            $batch,
        );
        $deleted += $this->purge(
            fn (Builder $q) => $q->where(fn (Builder $w) => $w->whereNull('log_name')->orWhereNotIn('log_name', $named)),
            now()->subMonths(self::DEFAULT_RETENTION_MONTHS),
            $batch,
        );

        $this->info("audit:prune-activity-log — lignes supprimées : {$deleted}");

        return self::SUCCESS;
    }

    /** @param  Closure(Builder): Builder  $family */
    private function purge(Closure $family, CarbonInterface $before, int $batch): int
    {
        $deleted = 0;

        do {
            $ids = $family(Activity::query())
                ->where('created_at', '<', $before)
                ->orderBy('id')
                ->limit($batch)
                ->pluck('id');

            if ($ids->isNotEmpty()) {
                $deleted += Activity::query()->whereKey($ids->all())->delete();
            }
        } while ($ids->count() === $batch);

        return $deleted;
    }
}
