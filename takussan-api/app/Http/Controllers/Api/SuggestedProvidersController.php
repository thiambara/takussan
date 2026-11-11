<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Enums\CollaborationStatus;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\ServiceProviderProfile;
use App\Support\CaseInsensitive;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * TCK-2652 — `GET /api/maintenance-requests/{id}/suggested-providers` : au plus trois prestataires du
 * carnet de l'agence du bien, pour « Choisir un prestataire » de la file « À dispatcher ».
 *
 * **La règle, déterministe, sans IA :**
 *
 *  1. **métier = catégorie** — filtre : seuls les prestataires dont les métiers (`specialties`)
 *     contiennent la catégorie de la demande, à la lettre. Chaque suggestion porte ce métier ;
 *  2. **zone** — d'abord ceux dont une zone d'intervention (`service_areas`) nomme le quartier ou la
 *     ville du bien (casse, accents et espaces de bord ignorés) ;
 *  3. puis `average_rating` décroissante (avis approuvés ; sans avis, après) ;
 *  4. puis les interventions réalisées pour l'agence, décroissantes ; puis l'id, pour départager.
 *
 * Seulement les prestataires ACTIFS, en collaboration ACTIVE avec cette agence — les assignables
 * (`ProviderEligibility`). Lisible par qui lit le carnet de l'agence (`viewAny` du profil prestataire,
 * qui suit `maintenance.assign`) et voit la demande : ni un prestataire ni un locataire n'énumère le
 * carnet par cette route.
 */
class SuggestedProvidersController extends Controller
{
    public const LIMIT = 3;

    public function __invoke(Request $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        $user = $request->user();
        $this->authorize('view', $maintenanceRequest);

        $property = $maintenanceRequest->property()->with('address')->first();
        $agency = $property?->agency;
        abort_if($agency === null || ! $user->can('viewAny', [ServiceProviderProfile::class, $agency]), 403);

        $category = $maintenanceRequest->category?->value;
        if ($category === null) {
            return $this->json(['data' => []]);
        }

        $places = array_values(array_filter([
            $this->fold($property->address?->neighborhood),
            $this->fold($property->address?->city),
        ]));

        $candidates = ServiceProviderProfile::query()
            ->active()
            ->whereHas('agencyCollaborations', fn (Builder $q) => $q
                ->where('agency_id', $agency->id)
                ->where('status', CollaborationStatus::Active->value))
            ->whereJsonContains('specialties', $category)
            ->with('user:id,first_name,last_name,phone')
            ->withAvg(['reviews as average_rating' => fn (Builder $q) => $q->where('is_approved', true)], 'rating')
            ->withCount(['reviews as reviews_count' => fn (Builder $q) => $q->where('is_approved', true)])
            ->addSelect(['completed_interventions_count' => ServiceProviderProfile::completedInterventionsSubquery($agency->id)])
            ->get();

        $ranked = $candidates
            ->map(function (ServiceProviderProfile $profile) use ($places): array {
                $zone = collect($profile->service_areas ?? [])
                    ->first(fn (mixed $area): bool => is_string($area) && in_array($this->fold($area), $places, true));

                return [$profile, is_string($zone) ? $zone : null];
            })
            ->sort(function (array $a, array $b): int {
                [$pa, $za] = $a;
                [$pb, $zb] = $b;

                return [$zb !== null, $pb->average_rating !== null, (float) $pb->average_rating, (int) $pb->completed_interventions_count, $pa->id]
                    <=> [$za !== null, $pa->average_rating !== null, (float) $pa->average_rating, (int) $pa->completed_interventions_count, $pb->id];
            })
            ->take(self::LIMIT)
            ->values();

        return $this->json(['data' => $ranked->map(fn (array $row): array => $this->present($row[0], $row[1], $category))->all()]);
    }

    /** @return array<string, mixed> */
    private function present(ServiceProviderProfile $profile, ?string $zone, string $trade): array
    {
        $phone = $profile->user?->phone;

        return [
            'id' => $profile->id,
            'user_id' => $profile->user_id,
            'name' => $profile->display_name,
            'phone' => filled($phone) ? $phone : (data_get($profile->metadata, 'phone') ?: null),
            'matching_trade' => $trade,
            'matching_zone' => $zone,
            'service_areas' => array_values($profile->service_areas ?? []),
            'average_rating' => $profile->average_rating !== null ? round((float) $profile->average_rating, 2) : null,
            'reviews_count' => (int) $profile->reviews_count,
            'completed_interventions_count' => (int) $profile->completed_interventions_count,
        ];
    }

    /** Casse (au-delà de l'ASCII), accents et espaces de bord ignorés : « Médina » = « medina ». */
    private function fold(?string $value): ?string
    {
        if ($value === null || trim($value) === '') {
            return null;
        }

        return Str::lower(Str::ascii(CaseInsensitive::fold(trim($value))));
    }
}
