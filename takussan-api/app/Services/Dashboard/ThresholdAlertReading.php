<?php

namespace App\Services\Dashboard;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Activity;
use App\Models\Agency;
use App\Models\ThresholdAlert;
use App\Models\User;
use App\Notifications\ThresholdAlertTriggered;
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
     * @param  Collection<int, ThresholdAlert>  $alerts
     * @return array<int, array<string, mixed>> par identifiant d'alerte
     */
    public function forAlerts(Collection $alerts, bool $withTriggers): array
    {
        $agencyIds = $alerts->pluck('agency_id')->filter()->map(fn ($id): int => (int) $id)->unique()->values();

        $metrics = [];
        $recipients = [];
        foreach ($agencyIds as $agencyId) {
            $agency = Agency::query()->find($agencyId);
            $metrics[$agencyId] = $agency !== null ? $this->resolver->forAgency($agency) : [];
            $users = ThresholdAlertRecipients::query($agencyId)
                ->orderBy('id')
                ->get(['id', 'first_name', 'last_name', 'username'])
                ->map(fn (User $user): array => ['id' => (int) $user->id, 'name' => $user->nameWithoutContact()])
                ->values()
                ->all();
            $recipients[$agencyId] = ['count' => count($users), 'users' => $users];
        }

        $triggers = $withTriggers ? $this->triggers($alerts) : [];

        $out = [];
        foreach ($alerts as $alert) {
            $agencyId = (int) $alert->agency_id;
            $values = $metrics[$agencyId] ?? [];
            $value = $values[$alert->metric] ?? null;
            $row = [
                'current_value' => $value === null ? null : (float) $value,
                'recipients' => $recipients[$agencyId] ?? ['count' => 0, 'users' => []],
                'channels' => ThresholdAlertTriggered::CHANNELS,
            ];
            if ($withTriggers) {
                $row['triggers'] = $triggers[(int) $alert->id] ?? [];
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
