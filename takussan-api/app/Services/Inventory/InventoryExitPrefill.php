<?php

namespace App\Services\Inventory;

use App\Models\Enums\InventoryStatus;
use App\Models\Enums\InventoryType;
use App\Models\Inventory;
use App\Models\Lease;
use App\Services\Lease\LeaseRenewalService;
use Illuminate\Validation\ValidationException;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * TCK-2646 — la sortie reprend l'entrée signée du même bail, élément par élément.
 *
 *  · {@see entryFor()}   l'entrée reprise : `from_inventory_id` s'il est donné (une entrée SIGNÉE de CE
 *                        bail ou d'un bail qu'il renouvelle, sinon 422), à défaut la plus récente entrée
 *                        signée de cette chaîne ; aucune sinon, et la sortie démarre comme avant.
 *                        Arbitrage du 2026-11-11 : un renouvellement ne refait pas d'entrée — le
 *                        locataire ne ressort pas —, la sortie d'un bail renouvelé reprend donc l'entrée
 *                        d'un ancêtre (`renewed_from_lease_id`), au même locataire et au même bien ;
 *  · {@see roomsFrom()}  les pièces de départ d'une sortie créée sans pièces : celles de l'entrée, son
 *                        état de départ pour chaque élément, sans notes ;
 *  · {@see attach()}     les états d'entrée (`entry_state`, `entry_notes`, `entry_photo_id`) posés
 *                        par le SERVEUR sur chaque élément qui a son pendant dans l'entrée (même nom
 *                        de pièce, même libellé). Appelé à CHAQUE écriture des pièces d'une sortie :
 *                        le client ne les écrit jamais (la validation les retire), un `PATCH` ne
 *                        peut donc pas les changer.
 *
 * `entry_photo_id` désigne une photo de l'entrée : celle de l'élément (`element_label`) d'abord,
 * sinon la première de sa pièce. La ressource la résout en URL signée à la lecture : aucune URL
 * n'est stockée dans `rooms`.
 */
class InventoryExitPrefill
{
    public const ENTRY_KEYS = ['entry_state', 'entry_notes', 'entry_photo_id'];

    public function entryFor(Lease $lease, ?int $fromInventoryId): ?Inventory
    {
        $signedEntries = Inventory::query()
            ->whereIn('lease_id', $this->tenancyChain($lease))
            ->where('type', InventoryType::MoveIn->value)
            ->where('status', InventoryStatus::Signed->value);

        if ($fromInventoryId !== null) {
            $entry = (clone $signedEntries)->whereKey($fromInventoryId)->first();
            if ($entry === null) {
                throw ValidationException::withMessages([
                    'from_inventory_id' => __('errors.inventory.entry_inventory_invalid'),
                ]);
            }

            return $entry;
        }

        return $signedEntries->orderByDesc('signed_at')->orderByDesc('id')->first();
    }

    /**
     * Le bail et ceux qu'il renouvelle, du parent à la racine, tant que le locataire et le bien restent
     * les mêmes : au-delà, c'est une autre occupation. Bornée comme `LeaseRenewalService::root()`, contre
     * une filiation corrompue.
     *
     * @return list<int>
     */
    private function tenancyChain(Lease $lease): array
    {
        $ids = [(int) $lease->id];
        $parentId = $lease->renewed_from_lease_id;
        while ($parentId !== null && count($ids) <= LeaseRenewalService::MAX_CHAIN_DEPTH * 2) {
            $parent = Lease::query()->find($parentId);
            if ($parent === null
                || (int) $parent->tenant_id !== (int) $lease->tenant_id
                || (int) $parent->property_id !== (int) $lease->property_id
                || in_array((int) $parent->id, $ids, true)) {
                break;
            }
            $ids[] = (int) $parent->id;
            $parentId = $parent->renewed_from_lease_id;
        }

        return $ids;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function roomsFrom(Inventory $entry): array
    {
        $rooms = [];
        foreach ($entry->rooms ?? [] as $room) {
            if (! is_array($room) || ! is_string($room['name'] ?? null)) {
                continue;
            }
            $elements = [];
            foreach (is_array($room['elements'] ?? null) ? $room['elements'] : [] as $element) {
                if (is_array($element) && is_string($element['label'] ?? null)) {
                    $elements[] = ['label' => $element['label'], 'state' => $element['state'] ?? null, 'notes' => null];
                }
            }
            $rooms[] = [
                'name' => $room['name'],
                'condition' => $room['condition'] ?? null,
                'notes' => null,
                'elements' => $elements,
            ];
        }

        return $rooms;
    }

    /**
     * @param  array<int, mixed>  $rooms
     * @return array<int, mixed>
     */
    public function attach(array $rooms, ?Inventory $entry): array
    {
        $index = $entry === null ? [] : $this->index($entry);

        foreach ($rooms as $r => $room) {
            if (! is_array($room) || ! is_array($room['elements'] ?? null)) {
                continue;
            }
            foreach ($room['elements'] as $e => $element) {
                if (! is_array($element)) {
                    continue;
                }
                foreach (self::ENTRY_KEYS as $key) {
                    unset($element[$key]);
                }
                $match = $index[(string) ($room['name'] ?? '')][(string) ($element['label'] ?? '')] ?? null;
                if ($match !== null) {
                    $element += $match;
                }
                $rooms[$r]['elements'][$e] = $element;
            }
        }

        return $rooms;
    }

    /**
     * Pièce → libellé → états d'entrée. Une pièce ou un libellé en double : le premier fait foi.
     *
     * @return array<string, array<string, array{entry_state: mixed, entry_notes: mixed, entry_photo_id: int|null}>>
     */
    private function index(Inventory $entry): array
    {
        $photos = $entry->media()->where('collection_name', 'room_photos')->orderBy('id')->get();
        $index = [];
        foreach ($entry->rooms ?? [] as $room) {
            if (! is_array($room) || ! is_string($room['name'] ?? null) || isset($index[$room['name']])) {
                continue;
            }
            $index[$room['name']] = [];
            foreach (is_array($room['elements'] ?? null) ? $room['elements'] : [] as $element) {
                if (! is_array($element) || ! is_string($element['label'] ?? null) || isset($index[$room['name']][$element['label']])) {
                    continue;
                }
                $index[$room['name']][$element['label']] = [
                    'entry_state' => $element['state'] ?? null,
                    'entry_notes' => $element['notes'] ?? null,
                    'entry_photo_id' => $this->photoFor($photos, $room['name'], $element['label']),
                ];
            }
        }

        return $index;
    }

    /**
     * @param  iterable<Media>  $photos
     */
    private function photoFor(iterable $photos, string $room, string $label): ?int
    {
        $roomPhoto = null;
        $otherElementPhoto = null;
        foreach ($photos as $photo) {
            if ($photo->getCustomProperty('room_name') !== $room) {
                continue;
            }
            $photoLabel = $photo->getCustomProperty('element_label');
            if ($photoLabel === $label) {
                return (int) $photo->id;
            }
            // La vue de la pièce d'abord ; à défaut, la photo d'un autre élément de la pièce.
            if ($photoLabel === null) {
                $roomPhoto ??= (int) $photo->id;
            } else {
                $otherElementPhoto ??= (int) $photo->id;
            }
        }

        return $roomPhoto ?? $otherElementPhoto;
    }
}
