<?php

namespace App\Services\Radar;

use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyType;
use App\Support\Search\PropertyLabels;

/**
 * TCK-2389 (décision 5 du porteur) — le titre qu'un bien du Radar portera une fois publié. La relecture n'exige pas le titre
 * (`RadarReviewFields::REQUIRED_FOR_REVIEW`) : une annonce relue sans titre ne doit pas mener à une impasse au moment de publier.
 * Le titre extrait, quand il existe, reste prioritaire ; sinon il se construit des champs structurés :
 * « Appartement 3 chambres à louer — Almadies ».
 *
 * Le titre est une DONNÉE du bien, pas un libellé d'interface : il s'écrit en français, comme les titres que saisissent les
 * agences, quelle que soit la langue de la requête. Les noms de type viennent de `lang/fr/properties.php`, et la règle des
 * types qui comptent leurs chambres est celle de l'index de recherche ({@see PropertyLabels::comptePieces()}).
 *
 * Une seule source : l'aperçu et `RadarPublisher::createProperty()` l'appellent, donc l'écran montre ce qui sera publié.
 */
final class RadarListingTitle
{
    /**
     * @param  array<string, mixed>  $values  les valeurs à plat de la relecture ({@see RadarReviewFields::values()})
     * @param  string|null  $neighborhood  le nom du quartier CANONIQUE (une fusion se suit jusqu'à sa cible)
     * @return array{title: string|null, built: bool} `built` : le titre n'est pas celui de l'annonce ; `null` si rien ne se construit
     */
    public static function resolve(array $values, ?string $neighborhood): array
    {
        $own = is_string($values['title'] ?? null) ? trim($values['title']) : '';
        if ($own !== '') {
            return ['title' => $own, 'built' => false];
        }

        return ['title' => self::build($values, $neighborhood), 'built' => true];
    }

    /** @param  array<string, mixed>  $values */
    private static function build(array $values, ?string $neighborhood): ?string
    {
        $type = PropertyType::tryFrom((string) ($values['property_type'] ?? ''));
        $contract = ContractType::tryFrom((string) ($values['contract'] ?? ''));
        if ($type === null || $contract === null) {
            return null;
        }

        $parts = [trans('properties.type.'.$type->value, [], 'fr')];

        // « 1 chambre » au singulier ; rien quand le nombre manque, vaut zéro (un studio), ou que le type n'en a pas.
        $bedrooms = is_numeric($values['bedrooms'] ?? null) ? (int) $values['bedrooms'] : 0;
        if ($bedrooms >= 1 && PropertyLabels::comptePieces($type)) {
            $parts[] = $bedrooms === 1 ? '1 chambre' : "{$bedrooms} chambres";
        }

        $parts[] = $contract === ContractType::Rent ? 'à louer' : 'à vendre';
        $title = implode(' ', $parts);

        $neighborhood = trim((string) $neighborhood);

        return $neighborhood === '' ? $title : "{$title} — {$neighborhood}";
    }
}
