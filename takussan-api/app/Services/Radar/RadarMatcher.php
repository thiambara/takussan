<?php

namespace App\Services\Radar;

use App\Models\Enums\RadarListingStage;
use App\Models\Property;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Services\Moderation\DuplicateListingDetector;
use App\Support\CanonicalPhone;
use App\Support\PhotoFingerprint;
use App\Support\RadarPhone;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-2387 (ADR-0054, ADR-0077 §6) — les rapprochements d'une annonce lue avec le catalogue et avec les
 * autres annonces collectées : trois signaux, chacun contre les deux sortes de cibles. Calculé à la demande
 * (un bien publié après la relecture apparaît, aucun cache à invalider) ; ne renvoie aucun numéro.
 *
 * **Les entrées de l'annonce** sont ses valeurs relues, corrections comprises ({@see RadarReviewFields::values()}).
 * Ses téléphones sont `extracted.phones` plus le numéro de son annonceur ; les numéros écartés
 * (`phones_dropped`) n'en font pas partie, sauf celui qui a été promu annonceur.
 *
 * **Même téléphone** (force `medium` : un indice, pas une surface publique ; vérifié ou non).
 *  - Contre un bien : le numéro, en forme canonique ({@see CanonicalPhone}), est le principal ou le
 *    secondaire du compte publieur (`properties.user_id`), le numéro d'un collaborateur, d'un contact sur
 *    place (`property_contacts.phone`) ou de l'agence. Un compte ou une agence supprimés
 *    (`deleted_at`) ne comptent plus : leur numéro n'est plus celui d'un acteur du bien.
 *  - Contre une annonce : son annonceur a l'empreinte HMAC d'un de ces numéros (elle survit à un STOP, qui
 *    efface le numéro en clair), ou ses `extracted.phones` en contiennent un (`jsonb_exists_any`, et non
 *    l'opérateur `?|`, qui heurte les paramètres PDO).
 *
 * **Même quartier, prix à ±10 %, mêmes chambres.** Les trois sont exigés, et le signal tombe si l'un manque à
 * l'annonce ; même contrat quand l'annonce en a un (un loyer et une vente ne se comparent pas). Le quartier
 * comprend ceux qui ont fusionné dans lui (`merged_into_id`). Contre une annonce, les valeurs se lisent dans
 * `extracted`, chaque conversion gardée par `CASE WHEN jsonb_typeof(…) = 'number'` : PostgreSQL ne garantit
 * pas l'ordre d'un `AND`, une conversion nue lèverait sur un prix écrit en chaîne. `medium` si l'écart de
 * prix est ≤ 3 %, `low` au-delà.
 *
 * **Photo proche (dHash).** Chaque empreinte source non dégénérée est comparée aux photos du catalogue
 * ({@see DuplicateListingDetector::closeProperties()}) et à celles des autres annonces (candidats par bande,
 * `source_photo_hashes @> '[{"bK": n}]'`, index GIN, exact sous le seuil par le principe des tiroirs
 * d'ADR-0054 ; au plus {@see DuplicateListingDetector::MAX_CANDIDATES}, distance en PHP). `high` à
 * distance ≤ 1, `medium` à 2 ou 3.
 *
 * **Cibles exclues** : l'annonce elle-même, les annonces `purged`, les biens de test et supprimés. Les
 * biens de TOUT statut sont comparés (brouillon, archivé…) : l'opérateur voit alors qu'un bien existe, et
 * dans quel état ; le statut est porté par la présentation, pas ici (décision 4 du plan).
 *
 * **Force d'un rapprochement** : la plus haute de ses signaux, portée à `high` dès deux signaux
 * distincts. Tri : force, nombre de signaux, biens avant annonces, identifiant décroissant. Au plus
 * {@see self::MAX_PER_SIGNAL} cibles par signal et par sorte de cible, par ordre de proximité (prix le plus
 * proche, distance la plus courte, sinon la plus récente). Le nombre de requêtes ne dépend pas du nombre de
 * cibles : il suit celui des signaux et des photos de l'annonce.
 */
final class RadarMatcher
{
    public const SIGNAL_PHONE = 'phone';

    public const SIGNAL_PLACE = 'neighborhood_price_bedrooms';

    public const SIGNAL_PHOTO = 'photo';

    /** L'écart de prix toléré, en proportion du prix de l'annonce. */
    public const PRICE_TOLERANCE = 0.10;

    /** En deçà de cet écart, le signal de lieu est `medium` ; au-delà `low`. */
    public const PRICE_CLOSE = 0.03;

    public const MAX_PER_SIGNAL = 20;

    private const STRENGTH_RANK = ['low' => 1, 'medium' => 2, 'high' => 3];

    public function __construct(private readonly DuplicateListingDetector $detector) {}

    /**
     * @return list<array{kind: 'property'|'listing', id: int, strength: 'high'|'medium'|'low',
     *                    signals: list<array{signal: string, strength: string, distance?: int, price_gap?: float}>}>
     */
    public function matchesFor(RadarListing $listing): array
    {
        $values = RadarReviewFields::values($listing->extracted ?? []);
        $phones = $this->phonesOf($listing);
        $hashes = $this->hashesOf($listing);
        $place = $this->placeOf($values);

        /** @var array<string, array{kind: string, id: int, signals: list<array<string, mixed>>}> $found */
        $found = [];
        $add = function (string $kind, int $id, array $signal) use (&$found): void {
            $found[$kind.':'.$id] ??= ['kind' => $kind, 'id' => $id, 'signals' => []];
            // « Deux signaux DISTINCTS » : un même signal vu deux fois ne corrobore rien. On garde le plus fort.
            foreach ($found[$kind.':'.$id]['signals'] as $i => $known) {
                if ($known['signal'] === $signal['signal']) {
                    if (self::STRENGTH_RANK[$signal['strength']] > self::STRENGTH_RANK[$known['strength']]) {
                        $found[$kind.':'.$id]['signals'][$i] = $signal;
                    }

                    return;
                }
            }
            $found[$kind.':'.$id]['signals'][] = $signal;
        };

        if ($phones !== []) {
            foreach ($this->propertiesByPhone($phones) as $id) {
                $add('property', $id, ['signal' => self::SIGNAL_PHONE, 'strength' => 'medium']);
            }
            foreach ($this->listingsByPhone($listing, $phones) as $id) {
                $add('listing', $id, ['signal' => self::SIGNAL_PHONE, 'strength' => 'medium']);
            }
        }

        if ($place !== null) {
            foreach ($this->propertiesByPlace($place) as ['id' => $id, 'gap' => $gap]) {
                $add('property', $id, ['signal' => self::SIGNAL_PLACE, 'strength' => $gap <= self::PRICE_CLOSE ? 'medium' : 'low', 'price_gap' => round($gap, 4)]);
            }
            foreach ($this->listingsByPlace($listing, $place) as ['id' => $id, 'gap' => $gap]) {
                $add('listing', $id, ['signal' => self::SIGNAL_PLACE, 'strength' => $gap <= self::PRICE_CLOSE ? 'medium' : 'low', 'price_gap' => round($gap, 4)]);
            }
        }

        if ($hashes !== []) {
            foreach ($this->propertiesByPhoto($hashes) as ['id' => $id, 'distance' => $distance]) {
                $add('property', $id, ['signal' => self::SIGNAL_PHOTO, 'strength' => self::photoStrength($distance), 'distance' => $distance]);
            }
            foreach ($this->listingsByPhoto($listing, $hashes) as ['id' => $id, 'distance' => $distance]) {
                $add('listing', $id, ['signal' => self::SIGNAL_PHOTO, 'strength' => self::photoStrength($distance), 'distance' => $distance]);
            }
        }

        $matches = array_map(function (array $match): array {
            $strongest = max(array_map(fn (array $s) => self::STRENGTH_RANK[$s['strength']], $match['signals']));
            // Deux signaux distincts se corroborent : `high`, même si chacun est plus faible.
            $strength = count($match['signals']) >= 2 ? 'high' : array_search($strongest, self::STRENGTH_RANK, true);

            return ['kind' => $match['kind'], 'id' => $match['id'], 'strength' => $strength, 'signals' => $match['signals']];
        }, array_values($found));

        usort($matches, fn (array $a, array $b): int => self::STRENGTH_RANK[$b['strength']] <=> self::STRENGTH_RANK[$a['strength']]
            ?: count($b['signals']) <=> count($a['signals'])
            ?: ($a['kind'] === 'property' ? 0 : 1) <=> ($b['kind'] === 'property' ? 0 : 1)
            ?: $b['id'] <=> $a['id']);

        return $matches;
    }

    // ─── Les entrées de l'annonce ────────────────────────────────────────────────────────

    /**
     * Les numéros de l'annonce, en E.164 : ceux de la lecture, et celui de l'annonceur.
     *
     * @return list<string>
     */
    private function phonesOf(RadarListing $listing): array
    {
        $candidates = (array) ($listing->extracted['phones'] ?? []);
        $candidates[] = $listing->advertiser?->phone;

        $phones = [];
        foreach ($candidates as $candidate) {
            $e164 = is_string($candidate) ? RadarPhone::canonical($candidate) : null;
            if ($e164 !== null) {
                $phones[$e164] = true;
            }
        }

        return array_keys($phones);
    }

    /**
     * Les empreintes de photo source utilisables : un entier, non dégénéré.
     *
     * @return list<int>
     */
    private function hashesOf(RadarListing $listing): array
    {
        $hashes = [];
        foreach ((array) ($listing->source_photo_hashes ?? []) as $entry) {
            if (is_array($entry) && is_int($entry['hash'] ?? null) && ! PhotoFingerprint::isDegenerate($entry['hash'])) {
                $hashes[$entry['hash']] = true;
            }
        }

        return array_keys($hashes);
    }

    /**
     * Quartier, prix et chambres relus, ou null si l'un manque : le signal tombe.
     *
     * @param  array<string, mixed>  $values
     * @return array{neighborhood_id: int, price: int, bedrooms: int, contract: ?string}|null
     */
    private function placeOf(array $values): ?array
    {
        $neighborhood = $values['neighborhood_id'];
        $price = $values['price'];
        $bedrooms = $values['bedrooms'];
        if (! is_int($neighborhood) || ! is_numeric($price) || $price <= 0 || ! is_numeric($bedrooms)) {
            return null;
        }
        $contract = $values['contract'];

        return [
            'neighborhood_id' => $neighborhood,
            'price' => (int) $price,
            'bedrooms' => (int) $bedrooms,
            'contract' => is_string($contract) && $contract !== '' ? $contract : null,
        ];
    }

    // ─── Même téléphone ──────────────────────────────────────────────────────────────────

    /**
     * @param  list<string>  $phones
     * @return list<int> les biens les plus récents d'abord
     */
    private function propertiesByPhone(array $phones): array
    {
        $in = $this->placeholders($phones);

        return $this->liveProperties()
            ->where(function (Builder $q) use ($phones, $in): void {
                // Le compte publieur : numéro principal ou secondaire.
                $q->orWhereRaw('properties.user_id IN (SELECT id FROM users WHERE deleted_at IS NULL AND ('.CanonicalPhone::sql('phone')." IN ({$in}) OR ".CanonicalPhone::sql('secondary_phone')." IN ({$in})))", [...$phones, ...$phones])
                    // Un collaborateur du bien.
                    ->orWhereRaw('properties.id IN (SELECT pc.property_id FROM property_collaborators pc JOIN users u ON u.id = pc.user_id WHERE u.deleted_at IS NULL AND ('.CanonicalPhone::sql('u.phone')." IN ({$in}) OR ".CanonicalPhone::sql('u.secondary_phone')." IN ({$in})))", [...$phones, ...$phones])
                    // Un contact sur place.
                    ->orWhereRaw('properties.id IN (SELECT property_id FROM property_contacts WHERE '.CanonicalPhone::sql('phone')." IN ({$in}))", $phones)
                    // L'agence.
                    ->orWhereRaw('properties.agency_id IN (SELECT id FROM agencies WHERE deleted_at IS NULL AND '.CanonicalPhone::sql('phone')." IN ({$in}))", $phones);
            })
            ->orderByDesc('properties.id')
            ->limit(self::MAX_PER_SIGNAL)
            ->pluck('properties.id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /**
     * @param  list<string>  $phones
     * @return list<int>
     */
    private function listingsByPhone(RadarListing $listing, array $phones): array
    {
        // TCK-2414 — l'empreinte d'un refus purgé peut dater d'une ancienne clé.
        $hmacs = $phones === [] ? [] : array_merge(...array_map(RadarPhone::hmacs(...), $phones));
        if ($listing->advertiser?->phone_hmac !== null) {
            $hmacs[] = $listing->advertiser->phone_hmac;
        }
        $hmacs = array_values(array_unique($hmacs));

        return $this->otherListings($listing)
            ->where(function (Builder $q) use ($hmacs, $phones): void {
                $q->whereIn('radar_advertiser_id', RadarAdvertiser::query()->select('id')->whereIn('phone_hmac', $hmacs))
                    ->orWhereRaw('jsonb_exists_any(extracted -> ?, ARRAY['.$this->placeholders($phones).']::text[])', ['phones', ...$phones]);
            })
            ->orderByDesc('id')
            ->limit(self::MAX_PER_SIGNAL)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    // ─── Même quartier, prix à ±10 %, mêmes chambres ─────────────────────────────────────

    /**
     * @param  array{neighborhood_id: int, price: int, bedrooms: int, contract: ?string}  $place
     * @return list<array{id: int, gap: float}> du prix le plus proche au plus éloigné
     */
    private function propertiesByPlace(array $place): array
    {
        $gap = 'abs(properties.price - ?::numeric) / ?::numeric';

        // `addresses` n'est pas unique par bien : une jointure répéterait la ligne (et le signal) à chaque adresse
        // du quartier, et ses doublons mangeraient les places de `MAX_PER_SIGNAL`.
        return $this->liveProperties()
            ->whereExists(fn ($address) => $address->selectRaw('1')->from('addresses')
                ->whereColumn('addresses.addressable_id', 'properties.id')
                ->where('addresses.addressable_type', (new Property)->getMorphClass())
                ->whereRaw('addresses.geo_neighborhood_id IN ('.$this->neighborhoodFamily().')', [$place['neighborhood_id'], $place['neighborhood_id']]))
            ->whereRaw('properties.price IS NOT NULL AND abs(properties.price - ?::numeric) <= ?::numeric * ?::numeric', [$place['price'], $place['price'], (string) self::PRICE_TOLERANCE])
            ->where('properties.bedrooms', $place['bedrooms'])
            ->when($place['contract'] !== null, fn (Builder $q) => $q->where('properties.contract_type', $place['contract']))
            ->selectRaw("properties.id, ({$gap}) as gap", [$place['price'], $place['price']])
            ->orderByRaw($gap, [$place['price'], $place['price']])
            ->orderByDesc('properties.id')
            ->limit(self::MAX_PER_SIGNAL)
            ->get()
            ->map(fn ($row) => ['id' => (int) $row->id, 'gap' => (float) $row->gap])
            ->all();
    }

    /**
     * Les valeurs d'une annonce se lisent dans `extracted`, chaque conversion gardée par son `CASE`.
     *
     * @param  array{neighborhood_id: int, price: int, bedrooms: int, contract: ?string}  $place
     * @return list<array{id: int, gap: float}>
     */
    private function listingsByPlace(RadarListing $listing, array $place): array
    {
        $number = fn (string $path) => "(CASE WHEN jsonb_typeof(extracted #> '{{$path}}') = 'number' THEN (extracted #>> '{{$path}}')::numeric END)";
        $price = $number('price,value');
        $gap = "abs({$price} - ?::numeric) / ?::numeric";

        return $this->otherListings($listing)
            ->whereRaw($number('neighborhood,neighborhood_id').' IN ('.$this->neighborhoodFamily().')', [$place['neighborhood_id'], $place['neighborhood_id']])
            ->whereRaw("{$price} IS NOT NULL AND abs({$price} - ?::numeric) <= ?::numeric * ?::numeric", [$place['price'], $place['price'], (string) self::PRICE_TOLERANCE])
            ->whereRaw($number('bedrooms,value').' = ?::numeric', [$place['bedrooms']])
            ->when($place['contract'] !== null, fn (Builder $q) => $q->whereRaw("extracted #>> '{contract,value}' = ?", [$place['contract']]))
            ->selectRaw("id, ({$gap}) as gap", [$place['price'], $place['price']])
            ->orderByRaw($gap, [$place['price'], $place['price']])
            ->orderByDesc('id')
            ->limit(self::MAX_PER_SIGNAL)
            ->get()
            ->map(fn ($row) => ['id' => (int) $row->id, 'gap' => (float) $row->gap])
            ->all();
    }

    /** Le quartier et ceux qui ont fusionné dans lui : deux paramètres, l'identifiant deux fois. */
    private function neighborhoodFamily(): string
    {
        return 'SELECT id FROM geo_neighborhoods WHERE id = ? OR merged_into_id = ?';
    }

    // ─── Photo proche ────────────────────────────────────────────────────────────────────

    /**
     * @param  list<int>  $hashes
     * @return list<array{id: int, distance: int}> du plus proche au plus éloigné
     */
    private function propertiesByPhoto(array $hashes): array
    {
        $best = [];
        foreach ($hashes as $hash) {
            foreach ($this->detector->closeProperties($hash) as $close) {
                $best[$close['property_id']] = min($best[$close['property_id']] ?? PHP_INT_MAX, $close['distance']);
            }
        }
        if ($best === []) {
            return [];
        }

        // Un seul contrôle pour tous : les biens de test et supprimés tombent ici.
        $alive = $this->liveProperties()->whereIn('properties.id', array_keys($best))->pluck('properties.id')->map(fn ($id) => (int) $id)->all();
        $best = array_intersect_key($best, array_flip($alive));

        return $this->closest($best);
    }

    /**
     * @param  list<int>  $hashes
     * @return list<array{id: int, distance: int}>
     */
    private function listingsByPhoto(RadarListing $listing, array $hashes): array
    {
        $conditions = [];
        $bindings = [];
        foreach ($hashes as $hash) {
            foreach (PhotoFingerprint::bands($hash) as $k => $band) {
                $conditions[] = 'source_photo_hashes @> ?::jsonb';
                $bindings[] = json_encode([["b{$k}" => $band]], JSON_THROW_ON_ERROR);
            }
        }

        $candidates = $this->otherListings($listing)
            ->whereNotNull('source_photo_hashes')
            ->whereRaw('('.implode(' OR ', $conditions).')', $bindings)
            ->orderByDesc('id')
            ->limit(DuplicateListingDetector::MAX_CANDIDATES)
            ->get(['id', 'source_photo_hashes']);

        $best = [];
        foreach ($candidates as $candidate) {
            foreach ((array) $candidate->source_photo_hashes as $entry) {
                $theirs = is_array($entry) ? ($entry['hash'] ?? null) : null;
                if (! is_int($theirs) || PhotoFingerprint::isDegenerate($theirs)) {
                    continue;
                }
                foreach ($hashes as $hash) {
                    $distance = PhotoFingerprint::distance($hash, $theirs);
                    if ($distance <= PhotoFingerprint::THRESHOLD) {
                        $best[$candidate->id] = min($best[$candidate->id] ?? PHP_INT_MAX, $distance);
                    }
                }
            }
        }

        return $this->closest($best);
    }

    /**
     * @param  array<int, int>  $distances  identifiant => distance
     * @return list<array{id: int, distance: int}> les plus proches d'abord, les plus récents à distance égale
     */
    private function closest(array $distances): array
    {
        $rows = [];
        foreach ($distances as $id => $distance) {
            $rows[] = ['id' => (int) $id, 'distance' => $distance];
        }
        usort($rows, fn (array $a, array $b): int => $a['distance'] <=> $b['distance'] ?: $b['id'] <=> $a['id']);

        return array_slice($rows, 0, self::MAX_PER_SIGNAL);
    }

    private static function photoStrength(int $distance): string
    {
        return $distance <= 1 ? 'high' : 'medium';
    }

    // ─── Les cibles ──────────────────────────────────────────────────────────────────────

    /** Les biens du catalogue, de tout statut : ni supprimés (portée du modèle), ni de test. */
    private function liveProperties(): Builder
    {
        return Property::query()->where('properties.is_test', false);
    }

    /**
     * Les autres annonces : ni elle-même, ni purgée. Une annonce sans lecture (`extracted` nul : une annonce
     * STOP n'en garde pas) reste cible du signal de téléphone, par son annonceur.
     */
    private function otherListings(RadarListing $listing): Builder
    {
        return RadarListing::query()
            ->whereKeyNot($listing->getKey())
            ->where('stage', '!=', RadarListingStage::Purged->value);
    }

    /** @param list<string> $values */
    private function placeholders(array $values): string
    {
        return implode(', ', array_fill(0, count($values), '?'));
    }
}
