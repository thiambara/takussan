<?php

namespace App\Services\Dashboard;

use App\Console\Commands\CheckThresholdAlertsCommand;
use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\ThresholdAlert;
use App\Models\User;
use App\Services\Dashboard\Adapters\AgencyMeMetrics;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * TCK-2627 — qui une alerte de seuil prévient : les admins ACTIFS de son agence. Une seule
 * définition, lue par le passage horaire ({@see CheckThresholdAlertsCommand})
 * qui les notifie, et par la lecture de l'alerte qui les nomme.
 */
final class ThresholdAlertRecipients
{
    /** @return Builder<User> */
    public static function query(int $agencyId): Builder
    {
        return User::query()
            ->whereHas('agencyAdminProfiles', fn (Builder $profile) => $profile->active()->where('agency_id', $agencyId));
    }

    /**
     * Contre-vérification de TCK-2627 — les destinataires d'une alerte sur `$metric` : pour un chiffre
     * CONSOLIDÉ ({@see AgencyMeMetrics::CONSOLIDATED_KEYS}), les seuls admins qui lisent les rapports
     * de l'agence (`reports.view_agency`) ; la cloche et le courriel portent la valeur, qu'un admin
     * dont le rôle retire la capacité ne lit pas sur `/dashboard/agency`.
     *
     * @param  Collection<int, User>|null  $admins  les admins actifs déjà lus ({@see self::query()})
     * @return Collection<int, User>
     */
    public static function forMetric(Agency $agency, string $metric, ?Collection $admins = null): Collection
    {
        $admins ??= self::query((int) $agency->id)->get();
        if (! in_array($metric, AgencyMeMetrics::CONSOLIDATED_KEYS, true)) {
            return $admins->values();
        }

        return $admins->filter(fn (User $user): bool => $user->canActAt(Capability::ReportsViewAgency, $agency))->values();
    }

    /**
     * TCK-2866 — les destinataires d'UNE alerte : ceux de sa mesure ({@see self::forMetric()}),
     * réduits à ceux que l'admin a choisis (`recipient_ids`) quand il en a choisi. Re-jugé à chaque
     * lecture et à chaque déclenchement : un choisi qui a quitté l'agence ou perdu
     * `reports.view_agency` n'est plus prévenu, et personne ne le remplace (un choix devenu vide ne
     * revient pas à « tous » : l'alerte ne prévient alors personne, ce que sa lecture montre).
     *
     * @param  Collection<int, User>|null  $admins  les admins actifs déjà lus ({@see self::query()})
     * @return Collection<int, User>
     */
    public static function forAlert(Agency $agency, ThresholdAlert $alert, ?Collection $admins = null): Collection
    {
        $possible = self::forMetric($agency, (string) $alert->metric, $admins);
        $chosen = $alert->chosenRecipientIds();

        return $chosen === []
            ? $possible
            : $possible->filter(fn (User $user): bool => in_array((int) $user->id, $chosen, true))->values();
    }

    /**
     * TCK-2866 — un choix de destinataires est un SOUS-ENSEMBLE de ceux de la mesure : jamais quelqu'un
     * qui ne pourrait pas lire la valeur (un agent sur un chiffre consolidé, un ancien admin, un compte
     * d'une autre agence). Sinon 422 `threshold_alert.recipient_not_allowed`, qui nomme les refusés.
     *
     * @param  list<int>  $ids
     */
    public static function assertChoosable(Agency $agency, string $metric, array $ids): void
    {
        if ($ids === []) {
            return;
        }
        $possible = self::forMetric($agency, $metric)->map(fn (User $user): int => (int) $user->id)->all();
        $refused = array_values(array_diff($ids, $possible));

        abort_code_unless($refused === [], 422, 'threshold_alert.recipient_not_allowed', ['ids' => implode(', ', $refused)]);
    }
}
