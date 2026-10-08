<?php

namespace App\Services\Moderation;

use App\Models\DuplicateSuspicion;
use App\Models\MediaFingerprint;
use App\Models\Property;
use App\Support\CaseInsensitive;
use App\Support\PhotoFingerprint;

/**
 * TCK-597 (ADR-0054) — soupçonner qu'une annonce en recopie une autre.
 *
 *  - par la PHOTO : une empreinte à distance ≤ {@see PhotoFingerprint::THRESHOLD} d'une photo d'un
 *    autre publieur. Les candidats sont ceux qui partagent une bande (exact sous le seuil), bornés à
 *    {@see self::MAX_CANDIDATES} ;
 *  - par l'ADRESSE : même ville et même quartier (repliés), même position au millième de degré,
 *    même type de contrat, surface et prix à ±5 %.
 *
 * Jamais entre deux biens du MÊME publieur (même agence, ou sans agence le même compte) : la
 * duplication volontaire de TCK-074 n'est pas un doublon. Une suspicion n'agit sur rien : elle
 * entre dans la file de la plateforme.
 */
class DuplicateListingDetector
{
    public const MAX_CANDIDATES = 200;

    /** Tolérance relative sur la surface et le prix. */
    public const TOLERANCE = 0.05;

    /** @return int le nombre de suspicions neuves */
    public function detectForPhoto(MediaFingerprint $fingerprint): int
    {
        $property = Property::query()->find($fingerprint->property_id);
        // verif-597 m2 — une empreinte dégénérée (aplat, mur, ciel) ressemble à toutes les autres :
        // elle remplissait la file de bruit, jusqu'à MAX_CANDIDATES suspicions par photo.
        if ($property === null || PhotoFingerprint::isDegenerate((int) $fingerprint->hash)) {
            return 0;
        }

        $bands = PhotoFingerprint::bands($fingerprint->hash);
        $candidates = MediaFingerprint::query()
            ->where('property_id', '!=', $property->id)
            ->where(fn ($q) => $q
                ->where('band_0', $bands[0])
                ->orWhere('band_1', $bands[1])
                ->orWhere('band_2', $bands[2])
                ->orWhere('band_3', $bands[3]))
            // verif-597 m2 — les PLUS PROCHES d'abord, pas les plus anciens : sous la borne, un vrai
            // doublon récent d'une empreinte courante n'était jamais comparé.
            ->orderByRaw('bit_count((hash # ?::bigint)::bit(64))', [$fingerprint->hash])
            ->orderBy('id')
            ->limit(self::MAX_CANDIDATES)
            ->get(['property_id', 'hash']);

        $close = $candidates
            ->reject(fn (MediaFingerprint $c) => PhotoFingerprint::isDegenerate((int) $c->hash))
            ->map(fn (MediaFingerprint $c) => ['property_id' => $c->property_id, 'distance' => PhotoFingerprint::distance($fingerprint->hash, $c->hash)])
            ->filter(fn (array $c) => $c['distance'] <= PhotoFingerprint::THRESHOLD)
            ->sortBy('distance')
            ->unique('property_id');

        $others = Property::query()->whereIn('id', $close->pluck('property_id'))->get(['id', 'agency_id', 'user_id'])->keyBy('id');

        $created = 0;
        foreach ($close as $match) {
            $other = $others->get($match['property_id']);
            if ($other !== null && ! $this->samePublisher($property, $other)) {
                $created += $this->suspect($property, $other, DuplicateSuspicion::SIGNAL_PHOTO, $match['distance']);
            }
        }

        return $created;
    }

    /** @return int le nombre de suspicions neuves */
    public function detectByAddress(Property $property): int
    {
        $address = $property->address()->first();
        if ($address === null || $address->city === null || $address->latitude === null || $address->longitude === null
            || $property->area === null || $property->price === null) {
            return 0;
        }

        $area = (float) $property->area;
        $price = (float) $property->price;

        $candidates = Property::query()
            ->whereKeyNot($property->id)
            ->where('contract_type', $property->contract_type)
            // Bornes calculées par PostgreSQL : `area` est entier, une borne décimale liée en
            // paramètre serait refusée (`22P02`).
            ->whereRaw('area BETWEEN ?::numeric * (1 - ?::numeric) AND ?::numeric * (1 + ?::numeric)', [$area, self::TOLERANCE, $area, self::TOLERANCE])
            ->whereRaw('price BETWEEN ?::numeric * (1 - ?::numeric) AND ?::numeric * (1 + ?::numeric)', [$price, self::TOLERANCE, $price, self::TOLERANCE])
            ->whereHas('address', function ($q) use ($address) {
                $q->whereRaw(CaseInsensitive::sql('city').' = ?', [CaseInsensitive::fold($address->city)])
                    ->whereRaw('ROUND(latitude, 3) = ?', [round((float) $address->latitude, 3)])
                    ->whereRaw('ROUND(longitude, 3) = ?', [round((float) $address->longitude, 3)]);
                $address->neighborhood === null
                    ? $q->whereNull('neighborhood')
                    : $q->whereRaw(CaseInsensitive::sql('neighborhood').' = ?', [CaseInsensitive::fold($address->neighborhood)]);
            })
            ->orderBy('id')
            ->limit(self::MAX_CANDIDATES)
            ->get(['id', 'agency_id', 'user_id']);

        $created = 0;
        foreach ($candidates as $other) {
            if (! $this->samePublisher($property, $other)) {
                $created += $this->suspect($property, $other, DuplicateSuspicion::SIGNAL_ADDRESS, null);
            }
        }

        return $created;
    }

    /** Même agence, ou — sans agence — même compte. */
    public function samePublisher(Property $a, Property $b): bool
    {
        if ($a->agency_id !== null || $b->agency_id !== null) {
            return $a->agency_id !== null && (int) $a->agency_id === (int) $b->agency_id;
        }

        return (int) $a->user_id === (int) $b->user_id;
    }

    /** Une ligne par paire : l'index `duplicate_suspicions_pair_uniq` départage, sans exception. */
    private function suspect(Property $property, Property $matched, string $signal, ?int $distance): int
    {
        $now = now();

        return DuplicateSuspicion::query()->insertOrIgnore([
            'property_id' => $property->id,
            'matched_property_id' => $matched->id,
            'signal' => $signal,
            'distance' => $distance,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }
}
