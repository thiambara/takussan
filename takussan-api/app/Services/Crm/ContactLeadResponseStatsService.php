<?php

namespace App\Services\Crm;

use App\Models\Enums\ContactLeadChannel;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2583 (ADR-0103 § 7) — le délai de première réponse aux demandes de contact d'une agence.
 *
 *   · **Ce qui est mesuré** : les demandes du FORMULAIRE (les clics WhatsApp / Appeler ne sont pas
 *     des demandes, TCK-590) de l'agence, déposées dans la période, et le délai entre leur dépôt et
 *     le premier geste de contact (`first_responded_at`, posé par {@see ContactGestureService}).
 *   · **La médiane, jamais la moyenne**, en secondes, en temps calendaire et brute : la présentation
 *     (heures ouvrées, arrondi) est au front. `null` quand aucune demande de la période n'a reçu de
 *     réponse.
 *   · **Ouvertes depuis plus de 24 h** : ni répondues ni traitées, déposées il y a plus de 24 h —
 *     un état COURANT, compté sans borne de période (une demande ignorée depuis 40 jours reste à
 *     rappeler), rangé sous son destinataire.
 *
 * Le délai par agent ne sort que pour le personnel qui lit toute la boîte de l'agence
 * (`PropertyContactLeadPolicy::viewResponseStats`).
 */
class ContactLeadResponseStatsService
{
    public const OPEN_AFTER_HOURS = 24;

    /** TCK-2871 — la médiane de l'agence servie à ses clients : sur 90 jours… */
    public const CLIENT_PERIOD_DAYS = 90;

    /** TCK-2871 — … et jamais sous 10 premières réponses mesurées (pas de chiffre sur un trop petit échantillon). */
    public const CLIENT_MIN_SAMPLE = 10;

    private const MEDIAN_SQL = 'percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (first_responded_at - created_at)))';

    /**
     * @return array{
     *     period_days: int,
     *     agency: array{median_first_response_seconds: ?int, responded_count: int, open_over_24h_count: int},
     *     agents: list<array{user: array{id: int, first_name: ?string, last_name: ?string}, median_first_response_seconds: ?int, responded_count: int, open_over_24h_count: int}>
     * }
     */
    public function compute(int $agencyId, int $periodDays, ?CarbonInterface $now = null): array
    {
        $now ??= now();
        $since = $now->copy()->subDays($periodDays);
        $openBefore = $now->copy()->subHours(self::OPEN_AFTER_HOURS);
        $form = ContactLeadChannel::Form->value;

        $median = self::MEDIAN_SQL;

        $responded = fn () => $this->responded($agencyId, $since);

        $open = fn () => DB::table('property_contact_leads')
            ->where('agency_id', $agencyId)
            ->where('channel', $form)
            ->whereNull('first_responded_at')
            ->whereNull('handled_at')
            ->where('created_at', '<=', $openBefore);

        $agencyRow = $responded()->selectRaw("{$median} AS median, COUNT(*) AS n")->first();

        $byAgent = $responded()
            ->whereNotNull('first_responded_by_id')
            ->groupBy('first_responded_by_id')
            ->selectRaw("first_responded_by_id AS user_id, {$median} AS median, COUNT(*) AS n")
            ->get()
            ->keyBy('user_id');

        $openByAgent = $open()
            ->whereNotNull('recipient_user_id')
            ->groupBy('recipient_user_id')
            ->selectRaw('recipient_user_id AS user_id, COUNT(*) AS n')
            ->pluck('n', 'user_id');

        $userIds = $byAgent->keys()->merge($openByAgent->keys())->map(fn ($id) => (int) $id)->unique()->values();
        $users = User::query()->whereIn('id', $userIds)->get(['id', 'first_name', 'last_name'])->keyBy('id');

        $agents = $userIds
            ->filter(fn (int $id) => $users->has($id))
            ->map(fn (int $id) => [
                'user' => [
                    'id' => $id,
                    'first_name' => $users[$id]->first_name,
                    'last_name' => $users[$id]->last_name,
                ],
                'median_first_response_seconds' => $this->seconds($byAgent->get($id)?->median),
                'responded_count' => (int) ($byAgent->get($id)?->n ?? 0),
                'open_over_24h_count' => (int) ($openByAgent->get($id) ?? 0),
            ])
            ->sortBy(fn (array $a) => [$a['user']['last_name'] ?? '', $a['user']['first_name'] ?? '', $a['user']['id']])
            ->values()
            ->all();

        return [
            'period_days' => $periodDays,
            'agency' => [
                'median_first_response_seconds' => $this->seconds($agencyRow?->median),
                'responded_count' => (int) ($agencyRow?->n ?? 0),
                'open_over_24h_count' => $open()->count(),
            ],
            'agents' => $agents,
        ];
    }

    /**
     * TCK-2871 — le délai de première réponse de l'AGENCE, tel que son client le lit (« L'agence vous
     * répond d'ordinaire en 2 h ») : la médiane sur {@see CLIENT_PERIOD_DAYS} jours, arrondie à l'heure
     * (une heure au moins : « 0 h » ne dit rien), `null` sous {@see CLIENT_MIN_SAMPLE} réponses. Jamais
     * le délai d'un agent : une seule requête, sur l'agence, sans regroupement.
     *
     * @return array{median_hours: int, sample: int}|null
     */
    public function forClients(int $agencyId, ?CarbonInterface $now = null): ?array
    {
        $since = ($now ?? now())->copy()->subDays(self::CLIENT_PERIOD_DAYS);
        $row = $this->responded($agencyId, $since)->selectRaw(self::MEDIAN_SQL.' AS median, COUNT(*) AS n')->first();
        $sample = (int) ($row?->n ?? 0);
        $seconds = $this->seconds($row?->median);
        if ($seconds === null || $sample < self::CLIENT_MIN_SAMPLE) {
            return null;
        }

        return ['median_hours' => max(1, (int) round($seconds / 3600)), 'sample' => $sample];
    }

    /** Les demandes du formulaire de l'agence, déposées depuis `$since`, qui ont reçu une première réponse. */
    private function responded(int $agencyId, CarbonInterface $since): Builder
    {
        return DB::table('property_contact_leads')
            ->where('agency_id', $agencyId)
            ->where('channel', ContactLeadChannel::Form->value)
            ->where('created_at', '>=', $since)
            ->whereNotNull('first_responded_at');
    }

    private function seconds(mixed $value): ?int
    {
        return $value === null ? null : (int) round((float) $value);
    }
}
