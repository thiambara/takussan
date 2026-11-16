<?php

namespace App\Services\Payments;

use App\Jobs\SendLeasePaymentReminders;
use App\Services\Reporting\OverdueInstalment;
use Carbon\CarbonImmutable;

/**
 * TCK-2915 — la date du prochain avis d'échéance d'un bail (`next_due_notice_date`).
 *
 * L'avis d'échéance N'EST PAS un envoi de plus : c'est le rappel J-`DUE_SOON_DAYS` de
 * {@see SendLeasePaymentReminders} (jalon `due_soon`). Ce service n'en sert que la date :
 *
 *  - la prochaine échéance que le job relancerait ({@see SendLeasePaymentReminders::remindable()},
 *    LA sélection du job), due aujourd'hui ou plus tard (heure de Dakar), dont l'avis n'est pas
 *    encore parti (sa trace `metadata.reminder_due_soon_sent_at`, clé lue dans
 *    {@see LeasePaymentReminderReader::automaticKeys()}, vide) ;
 *  - moins {@see SendLeasePaymentReminders::DUE_SOON_DAYS} — la constante, jamais un 3 recopié ;
 *  - `null` si aucune échéance ne l'attend. Une fois l'avis parti, la date passe à l'échéance
 *    suivante.
 *
 * Une échéance due dans moins de `DUE_SOON_DAYS` jours et pas encore avisée (bail créé tard) rend une
 * date passée : le job la rattrape (`CATCH_UP_DAYS`), la date dit quand l'avis était dû.
 *
 * Une requête pour toute une page de baux.
 */
final class NextDueNotice
{
    /**
     * @param  list<int>  $leaseIds
     * @return array<int, string> bail → date `Y-m-d` ; un bail sans avis à venir est absent
     */
    public static function forLeases(array $leaseIds): array
    {
        if ($leaseIds === []) {
            return [];
        }
        $key = LeasePaymentReminderReader::automaticKeys()['due_soon'];

        $rows = SendLeasePaymentReminders::remindable()
            ->whereIn('lease_payments.lease_id', $leaseIds)
            ->whereNotNull('lease_payments.due_date')
            ->whereDate('lease_payments.due_date', '>=', OverdueInstalment::today())
            ->whereRaw("COALESCE(lease_payments.metadata->>?, '') = ''", [$key])
            ->toBase()
            ->selectRaw('lease_payments.lease_id, MIN(lease_payments.due_date) AS due_date')
            ->groupBy('lease_payments.lease_id')
            ->get();

        $out = [];
        foreach ($rows as $row) {
            $out[(int) $row->lease_id] = CarbonImmutable::parse($row->due_date)
                ->subDays(SendLeasePaymentReminders::DUE_SOON_DAYS)
                ->toDateString();
        }

        return $out;
    }
}
