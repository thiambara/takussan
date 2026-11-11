<?php

namespace App\Services\Property;

use App\Models\Activity;
use App\Models\Enums\ContractType;
use App\Models\Property;
use App\Models\User;
use App\Support\ContactDetails;

/**
 * TCK-2672 — ce que l'admin regarde avant de publier un bien soumis : la liste de contrôle et qui
 * l'a soumis. Rien n'y est décidé : ce sont des constats, la décision reste un geste.
 */
final class PropertyModerationChecks
{
    /** Le nombre de photos qu'une annonce complète porte. */
    public const PHOTOS_EXPECTED = 5;

    /** En deçà, pas de médiane : quatre biens ne font pas un marché. */
    public const MEDIAN_MIN_SAMPLE = 5;

    /**
     * @return array{photos_count: int, photos_expected: int, address_complete: bool, description_words: int, description_has_contact: bool, price_vs_median: array{median: float, deviation_pct: float, sample_size: int}|null}
     */
    public function checks(Property $property): array
    {
        $address = $property->address;
        $description = trim(strip_tags((string) $property->description));

        return [
            'photos_count' => $property->getMedia('photos')->count(),
            'photos_expected' => self::PHOTOS_EXPECTED,
            // Le quartier du référentiel et la position : de quoi placer le bien sur la carte.
            'address_complete' => $address !== null
                && $address->geo_neighborhood_id !== null
                && $address->latitude !== null
                && $address->longitude !== null,
            'description_words' => $description === '' ? 0 : count(preg_split('/\s+/u', $description) ?: []),
            'description_has_contact' => ContactDetails::found($description),
            'price_vs_median' => $this->priceVsMedian($property),
        ];
    }

    /**
     * La médiane du prix des biens EN LIGNE ({@see Property::scopePublic()}, la règle du public) de
     * même type, même transaction, même période de loyer et même quartier du référentiel, le bien
     * lui-même exclu ; `null` sous {@see self::MEDIAN_MIN_SAMPLE} comparables, ou sans prix ni
     * quartier.
     *
     * @return array{median: float, deviation_pct: float, sample_size: int}|null
     */
    public function priceVsMedian(Property $property): ?array
    {
        $price = $property->price !== null ? (float) $property->price : null;
        $neighborhoodId = $property->address?->geo_neighborhood_id;
        if ($price === null || $price <= 0 || $neighborhoodId === null) {
            return null;
        }

        $row = Property::query()->public()
            ->whereKeyNot($property->getKey())
            ->where('properties.type', $property->type)
            ->where('properties.contract_type', $property->contract_type)
            ->when(
                $property->contract_type === ContractType::Rent,
                fn ($q) => $q->where('properties.rent_period', $property->rent_period),
            )
            ->where('properties.price', '>', 0)
            ->whereHas('address', fn ($q) => $q->where('geo_neighborhood_id', $neighborhoodId))
            ->toBase()
            ->selectRaw('count(*) as n, percentile_cont(0.5) within group (order by properties.price) as median')
            ->first();

        $sample = (int) ($row->n ?? 0);
        if ($sample < self::MEDIAN_MIN_SAMPLE || $row->median === null || (float) $row->median <= 0) {
            return null;
        }

        $median = (float) $row->median;

        return [
            'median' => $median,
            'deviation_pct' => round(($price - $median) / $median * 100, 1),
            'sample_size' => $sample,
        ];
    }

    /**
     * Qui a soumis le bien : l'auteur du dernier passage en `pending_review` relevé au journal
     * (`Auditable`), à défaut le titulaire du bien (`user_id`) — qui, sur un bien d'agence, est le
     * bailleur désigné même quand un agent a saisi la fiche. Le profil est jugé dans l'agence du
     * bien : `agency_admin`, puis `agent`, sinon `owner`.
     *
     * @return array{submitted_by: array{id: int, name: ?string, profile: string}|null, submitted_count_in_agency: int}
     */
    public function submitter(Property $property): array
    {
        $log = Activity::query()
            ->where('subject_type', $property->getMorphClass())
            ->where('subject_id', $property->getKey())
            ->where('attribute_changes->attributes->status', 'pending_review')
            ->whereNotNull('causer_id')
            ->latest('id')
            ->first();

        $user = $log?->causer instanceof User ? $log->causer : $property->owner;
        if ($user === null) {
            return ['submitted_by' => null, 'submitted_count_in_agency' => 0];
        }

        $agencyId = $property->agency_id !== null ? (int) $property->agency_id : null;
        $profile = match (true) {
            $agencyId !== null && $user->isAgencyAdminAt($agencyId) => 'agency_admin',
            $agencyId !== null && $user->isAgentAt($agencyId) => 'agent',
            default => 'owner',
        };

        return [
            'submitted_by' => [
                'id' => (int) $user->id,
                'name' => trim(($user->first_name ?? '').' '.($user->last_name ?? '')) ?: ($user->username ?: null),
                'profile' => $profile,
            ],
            'submitted_count_in_agency' => $this->submittedCount($user, $property),
        ];
    }

    /**
     * « son 3ᵉ bien chez vous » : les biens de l'agence que cette personne a mis en revue (journal),
     * ou dont elle est titulaire — celui-ci compris, chacun une fois.
     */
    private function submittedCount(User $user, Property $property): int
    {
        if ($property->agency_id === null) {
            return 1;
        }

        $ofAgency = Property::query()->where('agency_id', $property->agency_id)->select('id');

        $submitted = Activity::query()
            ->where('subject_type', $property->getMorphClass())
            ->where('causer_type', $user->getMorphClass())
            ->where('causer_id', $user->getKey())
            ->where('attribute_changes->attributes->status', 'pending_review')
            ->whereIn('subject_id', $ofAgency)
            ->distinct()
            ->pluck('subject_id');

        $held = Property::query()->where('agency_id', $property->agency_id)->where('user_id', $user->getKey())->pluck('id');

        return $submitted->merge($held)->push($property->getKey())->map(fn ($id) => (int) $id)->unique()->count();
    }
}
