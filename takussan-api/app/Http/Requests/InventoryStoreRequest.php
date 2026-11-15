<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\BorneLesReglesDElement;
use App\Http\Requests\Concerns\ConvertitLesInstantsRecus;
use App\Models\Enums\InventoryCondition;
use App\Models\Enums\InventoryElementState;
use App\Models\Enums\InventoryType;
use App\Rules\InstantIso;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates creation of an inventory (check_in / check_out).
 *
 * The `rooms` JSON schema is:
 *   [
 *     {
 *       "name": "Salon",
 *       "condition": "good",           // top-level room state (InventoryCondition values)
 *       "notes": "optional",
 *       "completed": true|false|null,   // TCK-2647 — la pièce cochée « terminée »
 *       "elements": [                   // optional granular inventory of the room's items
 *         { "label": "Canapé", "state": "bon"|"usé"|"endommagé"|"manquant"|null, "notes": "..." }
 *       ]                               // TCK-2647 — `state` nul : à qualifier avant la soumission
 *     }
 *   ]
 */
class InventoryStoreRequest extends FormRequest
{
    // TCK-2488 — une liste hors de sa borne ne fait pas valider ses éléments un à un (hérité de
    // BaseFormRequest pour les autres).
    use BorneLesReglesDElement;
    use ConvertitLesInstantsRecus;

    /**
     * P143.01 (TCK-1915) — décision du porteur (2026-10-23) : le PDF de l'état des lieux est recomposé
     * par dompdf à chaque téléchargement, et 40 × 40 éléments y épuisaient les 256M de `memory_limit`.
     * Au plafond (20 × 20, notes d'élément à 200, de pièce et générales à 1 000, libellés à 255) :
     * 25,4 s et 188 Mo mesurés. `InventoryUpdateRequest` et `takussan-web/src/lib/schemas/inventory.ts`
     * relisent ces bornes ; `InventorySizeLimitsTest` rend le PDF au plafond.
     */
    public const MAX_ROOMS = 20;

    public const MAX_ELEMENTS_PER_ROOM = 20;

    public const MAX_ELEMENT_NOTES = 200;

    public const MAX_NOTES = 1000;

    /** TCK-2646 — la borne d'une retenue proposée, en XOF : au-delà de toute caution réelle. */
    public const MAX_RETENTION = 1_000_000_000;

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            // TCK-1070 (P62.04) — pas d'`exists:leases,id` : un bail absent rendait 422 sur ce champ là où
            // un bail tiers passait la validation. Le contrôleur rend le refus aux deux.
            'lease_id' => ['required', 'integer'],
            'type' => ['required', Rule::enum(InventoryType::class)],
            'conducted_at' => ['nullable', 'date', new InstantIso],
            // TCK-2646 — une sortie sans pièces reprend celles de l'entrée signée du bail (son état
            // général aussi) ; sans entrée signée, le service rend 422 sur le champ manquant.
            'general_condition' => ['required_unless:type,move_out', Rule::enum(InventoryCondition::class)],
            'rooms' => ['required_unless:type,move_out', 'array', 'min:1', 'max:'.self::MAX_ROOMS],
            'rooms.*.name' => ['required', 'string', 'max:255'],
            'rooms.*.condition' => ['required', Rule::enum(InventoryCondition::class)],
            // TCK-2647 — la pièce cochée « terminée » par l'agent, à la pièce par écran ; rendue telle quelle.
            'rooms.*.completed' => ['nullable', 'boolean'],
            'rooms.*.notes' => ['nullable', 'string', 'max:'.self::MAX_NOTES],
            'rooms.*.elements' => ['nullable', 'array', 'max:'.self::MAX_ELEMENTS_PER_ROOM],
            'rooms.*.elements.*.label' => ['required_with:rooms.*.elements', 'string', 'max:255'],
            // TCK-2647 — un élément peut attendre son état (`null`) tant que l'état des lieux est un
            // brouillon : la création n'en fait que des brouillons, la mise à jour n'en touche pas
            // d'autre (`InventoryService::update()`, 422 `inventory.not_draft`). La soumission à
            // signature le refuse (`InventoryService::submit()`, 422 `inventory.unqualified_elements`).
            'rooms.*.elements.*.state' => ['nullable', Rule::enum(InventoryElementState::class)],
            'rooms.*.elements.*.notes' => ['nullable', 'string', 'max:'.self::MAX_ELEMENT_NOTES],
            // TCK-2646 — la retenue proposée, sur une sortie seulement. `entry_state` n'est pas une
            // règle : la validation le retire, le serveur le pose (`InventoryExitPrefill`).
            'rooms.*.elements.*.retention_amount' => ['nullable', 'prohibited_unless:type,move_out', 'numeric', 'min:0', 'max:'.self::MAX_RETENTION],
            'rooms.*.elements.*.retention_reason' => ['nullable', 'prohibited_unless:type,move_out', 'string', 'max:'.self::MAX_ELEMENT_NOTES],
            'notes' => ['nullable', 'string', 'max:'.self::MAX_NOTES],
            // TCK-2646 — l'entrée reprise par la sortie : une entrée signée de ce bail ou d'un bail qu'il
            // renouvelle, même locataire et même bien (vérifié par le service), à défaut la plus récente.
            'from_inventory_id' => ['nullable', 'prohibited_unless:type,move_out', 'integer', 'min:1'],
        ];
    }

    /** TCK-2743 — {@see ConvertitLesInstantsRecus}. */
    protected function instantsRecus(): array
    {
        return ['conducted_at'];
    }
}
