<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\StoreThresholdAlertRequest;
use App\Http\Requests\Api\ThresholdAlertCandidatesRequest;
use App\Http\Requests\Api\UpdateThresholdAlertRequest;
use App\Http\Resources\ThresholdAlertResource;
use App\Models\Agency;
use App\Models\ThresholdAlert;
use App\Models\User;
use App\Policies\AgencyIndicatorPolicy;
use App\Services\Dashboard\ThresholdAlertReading;
use App\Services\Dashboard\ThresholdAlertRecipients;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * TCK-032 P3 — CRUD for per-agency alert thresholds.
 */
class ThresholdAlertController extends Controller
{
    public function __construct(private readonly ThresholdAlertReading $reading) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        // TCK-587 — configuration de l'agence : son PERSONNEL (ADR-0031), plus tout membre.
        $staffAgencyId = $user->staffAgencyId();
        abort_code_unless($staffAgencyId !== null || $user->isSuperAdmin(), 403, 'agency.staff_only');

        $base = ThresholdAlert::query();
        if (! $user->isSuperAdmin()) {
            $base->where('agency_id', $staffAgencyId);
        }

        $paginator = ThresholdAlert::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate();

        // TCK-2045 (P61.04) — par la ressource, et non plus le modèle brut.
        // TCK-2627 — plus la valeur actuelle, les destinataires et les canaux, lus pour toute la page.
        return $this->paginated($paginator, $this->withReading(collect($paginator->items()), $request));
    }

    /** TCK-2627 — une alerte, sous la règle de la liste ({@see AgencyIndicatorPolicy::view()}). */
    public function show(Request $request, ThresholdAlert $thresholdAlert): JsonResponse
    {
        $this->authorize('view', $thresholdAlert);

        return $this->json(['data' => $this->withReading(collect([$thresholdAlert]), $request)[0]]);
    }

    /**
     * @param  Collection<int, ThresholdAlert>  $alerts
     * @return list<array<string, mixed>>
     */
    private function withReading(Collection $alerts, Request $request): array
    {
        $includes = array_filter(explode(',', (string) $request->query('include', '')));
        $reading = $this->reading->forAlerts($alerts, in_array('triggers', $includes, true), $request->user());

        // La lecture prime sur la ressource : elle peut taire `last_value` (chiffre consolidé).
        return $alerts->map(fn (ThresholdAlert $alert): array => array_merge(
            (new ThresholdAlertResource($alert))->resolve($request),
            $reading[(int) $alert->id] ?? [],
        ))->values()->all();
    }

    /**
     * TCK-2866 — qui une alerte sur `metric` peut prévenir : {@see ThresholdAlertRecipients::forMetric()},
     * nommés (le lecteur peut créer l'alerte, donc lire ses destinataires, TCK-2723).
     */
    public function candidates(ThresholdAlertCandidatesRequest $request): JsonResponse
    {
        $users = ThresholdAlertRecipients::forMetric($request->agency(), (string) $request->validated('metric'));

        return $this->json(['data' => $users
            ->sortBy('id')
            ->map(fn (User $user): array => ['id' => (int) $user->id, 'name' => $user->nameWithoutContact()])
            ->values()
            ->all()]);
    }

    public function store(StoreThresholdAlertRequest $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validated();

        $agencyId = $validated['agency_id'] ?? $user->agency_id;
        abort_code_unless($agencyId, 422, 'agency.id_required');
        if (! $user->isSuperAdmin()) {
            abort_unless((int) $agencyId === (int) $user->agency_id, 403);
        }
        $validated['agency_id'] = $agencyId;

        // TCK-2866 — les destinataires choisis : ceux de la mesure seulement.
        $agency = Agency::query()->find($agencyId);
        abort_code_unless($agency, 422, 'agency.id_required');
        $validated['recipient_ids'] = $this->chosen($validated['recipient_ids'] ?? null);
        ThresholdAlertRecipients::assertChoosable($agency, (string) $validated['metric'], $validated['recipient_ids'] ?? []);

        $alert = ThresholdAlert::create($validated);

        // Contre-vérification de TCK-2627 — la même lecture que `show` (chiffre consolidé tu à qui
        // ne lit pas les rapports), jamais le modèle brut.
        return $this->json(['data' => $this->withReading(collect([$alert]), $request)[0]], 201);
    }

    public function update(UpdateThresholdAlertRequest $request, ThresholdAlert $thresholdAlert): JsonResponse
    {

        $validated = $request->validated();

        // TCK-2866 — le choix re-jugé sur la mesure qu'aura l'alerte : un changement de mesure (vers un
        // chiffre consolidé) refuse un choix devenu trop large, même s'il n'est pas renvoyé.
        if (array_key_exists('recipient_ids', $validated)) {
            $validated['recipient_ids'] = $this->chosen($validated['recipient_ids']);
        }
        // Par une requête, et non la relation : posée sur l'alerte, elle sortirait dans la ressource.
        $agency = Agency::query()->find($thresholdAlert->agency_id);
        if ($agency !== null) {
            ThresholdAlertRecipients::assertChoosable(
                $agency,
                (string) ($validated['metric'] ?? $thresholdAlert->metric),
                array_key_exists('recipient_ids', $validated) ? ($validated['recipient_ids'] ?? []) : $thresholdAlert->chosenRecipientIds(),
            );
        }

        $thresholdAlert->update($validated);

        return $this->json(['data' => $this->withReading(collect([$thresholdAlert->fresh()]), $request)[0]]);
    }

    /**
     * TCK-2866 — une liste vide vaut « tous » : rangée `null`, comme une alerte d'avant.
     *
     * @param  array<int, int|string>|null  $ids
     * @return list<int>|null
     */
    private function chosen(?array $ids): ?array
    {
        $ids = array_values(array_unique(array_map('intval', $ids ?? [])));

        return $ids === [] ? null : $ids;
    }

    public function destroy(Request $request, ThresholdAlert $thresholdAlert): JsonResponse
    {
        $this->authorizeAgency($request->user(), $thresholdAlert);
        $thresholdAlert->delete();

        return $this->json(['message' => 'ok']);
    }

    /**
     * TCK-1701 (P82.04) — un RELAIS : la règle vit dans {@see AgencyIndicatorPolicy::delete()}
     * (`agency.update` sous le profil actif). Le helper reste parce qu'il est inscrit aux
     * exemptions de `scripts/check-controller-authorization.mjs`, qui refuse une exemption morte.
     */
    private function authorizeAgency($user, ThresholdAlert $alert): void
    {
        abort_unless($user->can('delete', $alert), 403);
    }
}
