<?php

namespace App\Services\Dashboard;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Activity;
use App\Models\Agency;
use App\Models\ThresholdAlert;
use App\Models\User;
use App\Notifications\ThresholdAlertTriggered;
use App\Policies\AgencyIndicatorPolicy;
use App\Services\Dashboard\Adapters\AgencyMeMetrics;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2627 — ce qu'une alerte de seuil dit à qui la lit, en plus de sa configuration :
 *
 * - `current_value` : la valeur ACTUELLE de sa mesure, par {@see KpiResolver::forAgency()} comme le
 *   passage horaire ; `null` sans dénominateur (TCK-1114). `last_value` n'est écrite qu'au
 *   déclenchement, une alerte jamais déclenchée n'en a pas.
 * - `recipients {count, users [{id, name}]}` : {@see ThresholdAlertRecipients}, la requête du passage.
 *   TCK-2723 (décision du porteur du 2026-11-11) — les NOMS au seul lecteur qui peut modifier
 *   l'alerte ({@see AgencyIndicatorPolicy::update()}, la règle de l'écriture) ; les autres lisent le
 *   même `count` et `users: []`.
 * - `channels` : les canaux de l'événement ({@see ThresholdAlertTriggered::CHANNELS}), sans les
 *   préférences de chacun.
 * - `triggers [{at, value}]` sur demande : les dix derniers déclenchements, au journal
 *   (`threshold_alert` / `triggered`), le plus récent d'abord.
 *
 * Le coût ne dépend pas du nombre d'alertes : une résolution et une requête de destinataires PAR
 * AGENCE de la page (une seule pour le personnel), et une requête pour tous les déclenchements.
 */
final class ThresholdAlertReading
{
    public const TRIGGERS_LIMIT = 10;

    public const LOG_NAME = 'threshold_alert';

    public const EVENT = 'triggered';

    public function __construct(private readonly KpiResolver $resolver) {}

    /**
     * Vérification adverse de TCK-2627 — un chiffre CONSOLIDÉ ({@see AgencyMeMetrics::CONSOLIDATED_KEYS} :
     * impayés, taux d'impayés, chiffre d'affaires, commissions) ne sort qu'à qui lit les rapports de
     * l'agence de l'alerte (`AgencyPolicy::viewReports`, la garde de `/dashboard/agency`) : pour les
     * autres, `current_value`, `last_value` et `triggers[].value` valent `null` — la configuration
     * (métrique, seuil, sévérité) reste lisible.
     *
     * @param  Collection<int, ThresholdAlert>  $alerts
     * @return array<int, array<string, mixed>> par identifiant d'alerte
     */
    public function forAlerts(Collection $alerts, bool $withTriggers, ?User $reader = null): array
    {
        $agencyIds = $alerts->pluck('agency_id')->filter()->map(fn ($id): int => (int) $id)->unique()->values();

        $metrics = [];
        $recipients = [];
        $readsMoney = [];
        $readsNames = [];
        foreach ($agencyIds as $agencyId) {
            $agency = Agency::query()->find($agencyId);
            // TCK-2723 — un jugement par agence de la page, sur une de ses alertes : la règle ne
            // dépend que de l'agence de l'alerte (`managesIndicatorsOf`), pas de l'alerte elle-même.
            // Sur une COPIE : la relation posée sur l'alerte de l'appelant sortirait dans la ressource
            // (`whenLoaded('agency')`), l'agence entière, sans `include=agency`.
            $sample = clone $alerts->first(fn (ThresholdAlert $alert): bool => (int) $alert->agency_id === $agencyId);
            if ($agency !== null) {
                $sample->setRelation('agency', $agency);
            }
            $readsNames[$agencyId] = $reader === null || $reader->can('update', $sample);
            $metrics[$agencyId] = $agency !== null ? $this->resolver->forAgency($agency) : [];
            $readsMoney[$agencyId] = $reader === null
                || ($agency !== null && $reader->can('viewReports', $agency));
            $admins = ThresholdAlertRecipients::query($agencyId)
                ->orderBy('id')
                ->get(['id', 'first_name', 'last_name', 'username']);
            $named = fn (Collection $users): array => [
                'count' => $users->count(),
                'users' => $users->map(fn (User $user): array => ['id' => (int) $user->id, 'name' => $user->nameWithoutContact()])->values()->all(),
            ];
            // Deux listes par agence : tous les admins actifs, et ceux qu'une alerte sur un chiffre
            // consolidé prévient ({@see ThresholdAlertRecipients::forMetric()}).
            $recipients[$agencyId] = $agency === null ? null : [
                'all' => $named($admins),
                'money' => $named(ThresholdAlertRecipients::forMetric($agency, AgencyMeMetrics::CONSOLIDATED_KEYS[0], $admins)),
            ];
        }

        $triggers = $withTriggers ? $this->triggers($alerts) : [];

        $out = [];
        foreach ($alerts as $alert) {
            $agencyId = (int) $alert->agency_id;
            $values = $metrics[$agencyId] ?? [];
            $value = $values[$alert->metric] ?? null;
            $hidden = ! ($readsMoney[$agencyId] ?? false)
                && in_array($alert->metric, AgencyMeMetrics::CONSOLIDATED_KEYS, true);
            $named = ($recipients[$agencyId] ?? null) === null
                ? ['count' => 0, 'users' => []]
                : $recipients[$agencyId][in_array($alert->metric, AgencyMeMetrics::CONSOLIDATED_KEYS, true) ? 'money' : 'all'];
            $row = [
                'current_value' => $value === null || $hidden ? null : (float) $value,
                // TCK-2723 — la clé reste, la liste est vide ; `count` ne dépend pas du lecteur.
                'recipients' => ($readsNames[$agencyId] ?? false) ? $named : ['count' => $named['count'], 'users' => []],
                'channels' => ThresholdAlertTriggered::CHANNELS,
            ];
            if ($hidden) {
                $row['last_value'] = null;
            }
            if ($withTriggers) {
                $row['triggers'] = $hidden
                    ? array_map(fn (array $t): array => ['at' => $t['at'], 'value' => null], $triggers[(int) $alert->id] ?? [])
                    : ($triggers[(int) $alert->id] ?? []);
            }
            $out[(int) $alert->id] = $row;
        }

        return $out;
    }

    /**
     * @param  Collection<int, ThresholdAlert>  $alerts
     * @return array<int, list<array{at: string|null, value: float|null}>>
     */
    private function triggers(Collection $alerts): array
    {
        $ids = $alerts->pluck('id')->map(fn ($id): int => (int) $id)->all();
        if ($ids === []) {
            return [];
        }

        $ranked = Activity::query()
            ->where('log_name', self::LOG_NAME)
            ->where('event', self::EVENT)
            ->where('subject_type', (new ThresholdAlert)->getMorphClass())
            ->whereIn('subject_id', $ids)
            ->toBase()
            ->select(['subject_id', 'created_at', 'properties'])
            ->selectRaw('ROW_NUMBER() OVER (PARTITION BY subject_id ORDER BY created_at DESC, id DESC) AS rang');

        $rows = DB::query()
            ->fromSub($ranked, 'ranked')
            ->where('rang', '<=', self::TRIGGERS_LIMIT)
            ->orderBy('subject_id')
            ->orderBy('rang')
            ->get();

        $out = [];
        foreach ($rows as $row) {
            $properties = json_decode((string) $row->properties, true) ?: [];
            $out[(int) $row->subject_id][] = [
                'at' => BaseResource::instantOnWire(Carbon::parse($row->created_at)),
                'value' => isset($properties['value']) ? (float) $properties['value'] : null,
            ];
        }

        return $out;
    }
}
