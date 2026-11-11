<?php

namespace App\Domain\Inventory;

use App\Http\Requests\InventoryStoreRequest;
use App\Models\Enums\PropertyType;

/**
 * TCK-2646 (décision famille 4 n° 7a) — les modèles Takussan d'état des lieux, un par type de bien.
 *
 * Un modèle est une liste de pièces, chacune avec ses éléments proposés. Il PROPOSE, il n'impose
 * rien : l'agent part de cette liste, ajoute, retire et renomme librement — l'état des lieux garde des
 * pièces en texte libre (`inventories.rooms`), et les bornes de `InventoryStoreRequest` (20 pièces ×
 * 20 éléments) tiennent pour chaque modèle (`InventoryTemplateTest` poste chacun tel quel).
 *
 * Défini en code par des CLÉS stables ; les noms sont dans `lang/{fr,en,wo}/inventory_templates.php`
 * (le wolof porte le français, en pause), rendus dans la langue de la requête. Le front écrit le nom
 * qu'il a reçu dans la pièce de l'état des lieux.
 *
 * Le contenu suit la proposition de `docs/features.md` §1.9 (décision 7a), complétée ici pour le F4 et
 * plus et le générique.
 *
 * Le modèle d'un bien se déduit de son type, et pour un appartement ou une maison de son nombre de
 * chambres (`bedrooms`) : 0 → studio, 1 → F2, 2 → F3, 3 et plus → F4 et plus. Un type sans modèle, ou
 * un appartement dont le nombre de chambres n'est pas connu, reçoit le modèle générique.
 */
final class InventoryTemplates
{
    public const STUDIO = 'studio';

    public const F2 = 'f2';

    public const F3 = 'f3';

    public const F4_PLUS = 'f4_plus';

    public const VILLA = 'villa';

    public const SHOP = 'shop';

    public const OFFICE = 'office';

    public const GENERIC = 'generic';

    public const KEYS = [self::STUDIO, self::F2, self::F3, self::F4_PLUS, self::VILLA, self::SHOP, self::OFFICE, self::GENERIC];

    /** Au-delà, une maison a plus de chambres que le modèle n'en propose : l'agent ajoute les autres. */
    public const MAX_PROPOSED_BEDROOMS = 8;

    /**
     * Les éléments par défaut d'une pièce (`docs/features.md` §1.9) ; chaque sorte y ajoute les siens.
     */
    private const BASE = ['walls', 'floor', 'ceiling', 'door', 'windows', 'sockets', 'switches', 'lighting'];

    /** @var array<string, list<string>> les éléments propres à chaque sorte de pièce, après {@see self::BASE} */
    private const ELEMENTS = [
        'main_room' => [],
        'living_room' => [],
        'dining_room' => [],
        'bedroom' => ['wardrobe'],
        'kitchen' => ['sink', 'worktop', 'tap', 'hob', 'cupboards'],
        'kitchenette' => ['sink', 'worktop', 'tap', 'hob'],
        'shower_room' => ['shower', 'washbasin', 'tap', 'seals'],
        'numbered_shower_room' => ['shower', 'washbasin', 'tap', 'seals'],
        'bathroom' => ['bathtub', 'washbasin', 'tap', 'seals'],
        'wc' => ['toilet', 'flush'],
        'terrace' => ['railing'],
        'courtyard' => ['gate', 'fence'],
        'shop_main_space' => ['storefront', 'security_shutter'],
        'office_main_space' => ['network_sockets', 'air_conditioning'],
        'stockroom' => [],
        'sanitaries' => ['toilet', 'flush', 'washbasin', 'tap'],
    ];

    /** Les sortes de pièces qui n'ont pas tous les éléments par défaut : on y propose ceux-là seulement. */
    private const WITHOUT_BASE = [
        'wc' => ['walls', 'floor', 'door', 'lighting'],
        'terrace' => ['floor', 'lighting'],
        'courtyard' => ['floor', 'lighting'],
        'stockroom' => ['walls', 'floor', 'ceiling', 'door', 'lighting'],
        'sanitaries' => ['walls', 'floor', 'door', 'lighting'],
    ];

    /** Les sortes de pièces numérotées : leur nom porte son rang (« Chambre 2 », « Bureau 1 »). */
    private const RANKED = ['bedroom', 'numbered_shower_room'];

    /** Le modèle d'un type de bien (et, pour un logement, de son nombre de chambres). */
    public static function keyFor(?PropertyType $type, ?int $bedrooms): string
    {
        return match ($type) {
            PropertyType::Studio, PropertyType::Room => self::STUDIO,
            PropertyType::Apartment, PropertyType::House => match (true) {
                $bedrooms === null => self::GENERIC,
                $bedrooms <= 0 => self::STUDIO,
                $bedrooms === 1 => self::F2,
                $bedrooms === 2 => self::F3,
                default => self::F4_PLUS,
            },
            PropertyType::Villa => self::VILLA,
            PropertyType::Shop => self::SHOP,
            PropertyType::Office => self::OFFICE,
            default => self::GENERIC,
        };
    }

    /**
     * Les pièces d'un modèle, en sortes et rangs : `[['kind' => 'bedroom', 'rank' => 2], …]`.
     *
     * @return list<array{kind: string, rank: int|null}>
     */
    public static function layout(string $key, ?int $bedrooms = null): array
    {
        // La proposition de `docs/features.md` §1.9 (audit UX 2026-11, décision 7a), complétée pour
        // le F4 et plus et le générique.
        $rooms = match ($key) {
            self::STUDIO => ['main_room', 'kitchenette', 'shower_room'],
            self::F2 => ['living_room', ['bedroom', 1], 'kitchen', 'shower_room', 'wc'],
            self::F3 => ['living_room', ['bedroom', 2], 'kitchen', 'shower_room', 'wc'],
            self::F4_PLUS => ['living_room', ['bedroom', self::bedroomCount($bedrooms, 3)], 'kitchen', 'bathroom', 'shower_room', 'wc'],
            self::VILLA => ['living_room', 'dining_room', ['bedroom', self::bedroomCount($bedrooms, 4)], 'kitchen', ['numbered_shower_room', 2], 'terrace', 'courtyard'],
            self::SHOP => ['shop_main_space', 'stockroom', 'sanitaries'],
            self::OFFICE => ['office_main_space', 'stockroom', 'sanitaries'],
            default => ['main_room', 'kitchen', 'shower_room', 'wc'],
        };

        $out = [];
        foreach ($rooms as $room) {
            if (is_array($room)) {
                for ($rank = 1; $rank <= $room[1]; $rank++) {
                    $out[] = ['kind' => $room[0], 'rank' => $rank];
                }

                continue;
            }
            $out[] = ['kind' => $room, 'rank' => null];
        }

        return $out;
    }

    /**
     * Le modèle rendu dans la langue courante : chaque pièce avec sa clé, son nom et ses éléments
     * (clé et libellé).
     *
     * @return list<array{key: string, name: string, elements: list<array{key: string, label: string}>}>
     */
    public static function rooms(string $key, ?int $bedrooms = null): array
    {
        return array_map(function (array $room): array {
            $rankSuffix = $room['rank'] !== null ? '_'.$room['rank'] : '';

            return [
                'key' => $room['kind'].$rankSuffix,
                'name' => in_array($room['kind'], self::RANKED, true)
                    ? __('inventory_templates.rooms.'.$room['kind'], ['rank' => $room['rank']])
                    : __('inventory_templates.rooms.'.$room['kind']),
                'elements' => array_map(
                    fn (string $element): array => ['key' => $element, 'label' => __('inventory_templates.elements.'.$element)],
                    self::elementsOf($room['kind']),
                ),
            ];
        }, self::layout($key, $bedrooms));
    }

    /** @return list<string> toutes les sortes de pièces, pour la parité des langues */
    public static function roomKinds(): array
    {
        return array_keys(self::ELEMENTS);
    }

    /** @return list<string> tous les éléments, pour la parité des langues */
    public static function elementKeys(): array
    {
        return array_values(array_unique(array_merge(...array_map(self::elementsOf(...), self::roomKinds()))));
    }

    /** @return list<string> */
    private static function elementsOf(string $kind): array
    {
        return array_values(array_unique(array_merge(self::WITHOUT_BASE[$kind] ?? self::BASE, self::ELEMENTS[$kind])));
    }

    private static function bedroomCount(?int $bedrooms, int $minimum): int
    {
        // Le modèle tient dans la borne de l'état des lieux : jamais plus de pièces qu'il n'en accepte
        // (la villa compte 8 pièces hors chambres).
        $max = min(self::MAX_PROPOSED_BEDROOMS, InventoryStoreRequest::MAX_ROOMS - 8);

        return max($minimum, min($bedrooms ?? $minimum, $max));
    }
}
