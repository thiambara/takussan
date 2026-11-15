<?php

namespace App\Services\Lease;

use App\Models\Enums\LeaseStatus;
use App\Models\Enums\LeaseType;
use App\Models\Lease;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2906 — LA date à partir de laquelle le loyer d'un bail peut être révisé, écrite UNE fois en SQL.
 *
 * Deux lecteurs, une source : le motif `rent_review_open` de la file « À traiter »
 * ({@see LeaseAttention::since()}, « la date est passée ») et `next_revision_date` du dossier du bail
 * ({@see self::nextRevisionDate()}). La date est le plus tardif de :
 *
 *  - un an après le début du bail (`start_date + 12 mois`) ;
 *  - un an après la dernière révision journalisée (`lease_rent_reviewed`, son jour + 12 mois).
 *
 * `NULL` — aucune révision possible — pour un bail qui n'est pas (ou plus) en vigueur ni en préparation
 * (seuls `draft`, `pending_signature` et `active` en portent une), une vente, un bail sans début, et
 * un bail dont le contrat FIGE un plafond de révision à 0 % (« sans clause de révision » : la seule
 * forme qu'elle prenne en base ; un plafond nul exécute le réglage, toujours > 0).
 *
 * Passée (≤ aujourd'hui) sur un bail actif, la révision est ouverte : c'est exactement le motif.
 */
final class RentReviewSchedule
{
    public const REVIEW_EVERY_MONTHS = 12;

    /** Les statuts qui portent une date : en vigueur, ou à venir. */
    public const STATUSES = [LeaseStatus::Draft, LeaseStatus::PendingSignature, LeaseStatus::Active];

    /** L'expression SQL de la date (type `date`), corrélée à la ligne `$table` des baux. */
    public static function possibleFromSql(string $table = 'leases'): string
    {
        $pdo = DB::connection()->getPdo();
        $statuts = implode(', ', array_map(fn (LeaseStatus $s): string => $pdo->quote($s->value), self::STATUSES));
        $vente = $pdo->quote(LeaseType::Sale->value);
        $morph = $pdo->quote((new Lease)->getMorphClass());
        $mois = self::REVIEW_EVERY_MONTHS;

        return "(CASE WHEN {$table}.status IN ({$statuts})"
            ." AND {$table}.type <> {$vente}"
            ." AND {$table}.start_date IS NOT NULL"
            ." AND COALESCE({$table}.rent_review_max_pct, 1) > 0"
            ." THEN GREATEST(({$table}.start_date + make_interval(months => {$mois}))::date,"
            .' (SELECT (MAX(activity_log.created_at)::date + make_interval(months => '.$mois.'))::date FROM activity_log'
            ." WHERE activity_log.subject_type = {$morph} AND activity_log.subject_id = {$table}.id"
            ." AND activity_log.event = 'lease_rent_reviewed'))"
            .' END)';
    }

    /** La date de CE bail, `null` sans révision possible. */
    public static function nextRevisionDate(Lease $lease): ?CarbonImmutable
    {
        $value = DB::table('leases')
            ->where('id', $lease->getKey())
            ->selectRaw(self::possibleFromSql('leases').' AS d')
            ->value('d');

        return $value === null ? null : CarbonImmutable::parse($value)->startOfDay();
    }
}
