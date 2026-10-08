<?php

namespace App\Services\Property;

use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use Illuminate\Support\Facades\DB;

/**
 * TCK-598 (V10, contrainte 10) — ce que devient un bien dont la fiche ne s'affiche plus : loué,
 * vendu, ou retiré. Sert `GET /api/public/properties/{slug}/status`.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * LE PRÉDICAT D'ÉLIGIBILITÉ COMPOSE `scopePublic()`, IL NE LE RECOPIE PAS
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Un bien a droit à un état s'il satisfait TOUS les critères de `scopePublic()` sauf le statut
 * (`visibility`, `is_test`, `published_at`, et ce que TCK-600 y ajoutera : l'agence active). Les
 * recopier ici ferait diverger les deux prédicats au premier critère ajouté — exactement le défaut
 * des six portefeuilles de V15.
 *
 * Le scope n'est pas découpable sans le réécrire (il appartient à TCK-600). On l'applique donc tel
 * quel à une copie de la ligne **dont seul le statut est remplacé** par `available` :
 *
 *     SELECT (jsonb_populate_record(NULL::properties, to_jsonb(p) || '{"status":"available"}')).*
 *     FROM properties p WHERE p.slug = ?
 *
 * La sous-requête porte l'alias `properties` : toute condition du scope — colonne nue, colonne
 * qualifiée, `whereHas` corrélé sur `properties.agency_id` — s'y applique comme à la table. Le
 * statut est le SEUL critère neutralisé, et le jour où `scopePublic()` gagne un critère, cet état
 * le gagne aussi sans une ligne de plus.
 *
 * Le statut réel décide ensuite, et ce sont des CODES (le front traduit) :
 *
 *   · brouillon, en attente de modération, refusé → `null` (404) : la mécanique de modération ne
 *     fuit pas (TCK-335), et la réponse est celle d'un slug inconnu ;
 *   · loué → `rented`, vendu → `sold` ;
 *   · archivé, en maintenance, indisponible → `withdrawn` ;
 *   · tout statut que la fiche sert → `available`.
 */
final class EtatPublicDuBien
{
    /** Ces statuts n'ont jamais été une annonce, ou ne doivent pas dire qu'ils en sont une. */
    private const JAMAIS_ANNONCES = [
        PropertyStatus::Draft,
        PropertyStatus::PendingReview,
        PropertyStatus::Rejected,
    ];

    private const RETIRES = [
        PropertyStatus::Archived,
        PropertyStatus::UnderMaintenance,
        PropertyStatus::Unavailable,
    ];

    public const MAX_SIMILAIRES = 6;

    /** @return array{property: Property, state: string}|null */
    public function pour(string $slug): ?array
    {
        $property = Property::query()
            ->with('address')
            ->where('slug', $slug)
            ->whereNotIn('status', self::JAMAIS_ANNONCES)
            ->first();

        if ($property === null || ! $this->eligible($slug)) {
            return null;
        }

        return ['property' => $property, 'state' => $this->etat($property->status)];
    }

    private function eligible(string $slug): bool
    {
        $ligneAuStatutNeutralise = DB::table('properties as p')
            ->selectRaw('(jsonb_populate_record(NULL::properties, to_jsonb(p) || ?::jsonb)).*', [
                json_encode(['status' => PropertyStatus::Available->value]),
            ])
            ->where('p.slug', $slug);

        return Property::query()
            ->fromSub($ligneAuStatutNeutralise, 'properties')
            ->public()
            ->exists();
    }

    private function etat(?PropertyStatus $status): string
    {
        return match (true) {
            $status === PropertyStatus::Rented => 'rented',
            $status === PropertyStatus::Sold => 'sold',
            in_array($status, self::RETIRES, true) => 'withdrawn',
            default => 'available',
        };
    }
}
