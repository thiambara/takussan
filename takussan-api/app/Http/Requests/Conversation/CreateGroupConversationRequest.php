<?php

namespace App\Http\Requests\Conversation;

use App\Http\Requests\BaseFormRequest;
use App\Http\Requests\Conversation\Concerns\GuardsConversationScope;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use App\Rules\ParticipantIdsRule;
use App\Services\Messaging\MessagingReach;
use Illuminate\Validation\Validator;

/**
 * TCK-085 — Validates the body of `POST /api/conversations` when
 * `type = group`. Subject is required, participants must be unique
 * existing user ids, and the **total** count (creator + others) must be
 * 3..20.
 *
 * Authorization is unconditional (`true`) because access control is
 * handled by the route middleware (`auth:sanctum`) plus the scope checks
 * of `withValidator()` below.
 *
 * TCK-565 — ce docblock disait « plus les vérifications de périmètre du contrôleur ». Il n'y en
 * avait AUCUNE, ni ici ni dans le contrôleur ni dans `GroupConversationService::create()` : tout
 * compte pouvait ranger tout autre compte dans un groupe en devinant son identifiant, et rattacher
 * le groupe à n'importe quel bien ou bail de la plateforme. Les deux sont désormais vérifiés :
 *
 *  - les participants doivent être JOIGNABLES ({@see MessagingReach} — la règle même que liste le
 *    sélecteur du front, `GET /api/conversations/contacts`) ;
 *  - le bien, le bail et la demande d'intervention rattachés doivent être VISIBLES de l'acteur
 *    (leurs policies `view`). Ce n'est pas qu'une question de lecture : `AddParticipantsRequest`
 *    ouvre ensuite l'ajout de participants à toute l'agence du bien rattaché.
 *
 * ⚠️ Réparation 2 (vérificateur, 2026-09-23) : ce docblock disait déjà « les deux sont désormais
 * vérifiés », et c'était faux EN PRATIQUE — une conversation directe, qui ne vérifiait rien, faisait
 * de n'importe quel inconnu un correspondant, donc un contact joignable par cette garde. Les deux
 * gardes vivent maintenant dans {@see GuardsConversationScope}, que la directe applique aussi
 * (`StoreConversationRequest`).
 */
class CreateGroupConversationRequest extends BaseFormRequest
{
    use GuardsConversationScope;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'subject' => ['required', 'string', 'max:255'],
            // The creator is auto-added — so 2 *other* participants is the
            // floor (3 total). We enforce both the size and integer-shape
            // here; `withValidator()` does the existence and scope checks,
            // once for the whole array (TCK-565).
            //
            // TCK-565 — AUCUNE règle sur `participants.*` : elle produirait une erreur par
            // position (« participants.0 »). `bail` + `ParticipantIdsRule` = une erreur au plus.
            'participants' => ['bail', 'required', 'array', 'min:2', 'max:19', new ParticipantIdsRule(distinct: true)],
            'property_id' => ['nullable', 'integer', 'exists:properties,id'],
            'lease_id' => ['nullable', 'integer', 'exists:leases,id'],
            'maintenance_request_id' => ['nullable', 'integer', 'exists:maintenance_requests,id'],
            'initial_message' => ['nullable', 'string', 'max:5000'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'subject.required' => __('messaging.errors.group_subject_required'),
            'participants.min' => __('messaging.errors.group_min_participants'),
            'participants.max' => __('messaging.errors.group_max_participants'),
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            $actor = $this->user();
            if ($actor === null) {
                return;
            }

            $this->checkParticipants($v, $actor);
            $this->checkContext($v, $actor);
        });
    }

    /**
     * Une seule erreur sur `participants`, jamais une par position : « The selected
     * participants.0 is invalid. (and 1 more error) » est exactement ce que le testeur a vu.
     */
    private function checkParticipants(Validator $v, User $actor): void
    {
        $this->guardReach($v, $actor, array_map('intval', (array) $this->input('participants', [])), 'participants');
    }

    private function checkContext(Validator $v, User $actor): void
    {
        $this->guardContext($v, $actor, [
            'property_id' => Property::class,
            'lease_id' => Lease::class,
            'maintenance_request_id' => MaintenanceRequest::class,
        ], 'messaging.errors.group_context_forbidden');
        // L'ordre est un contrat (tenu par `GroupConversationCreationTest`) : la visibilité
        // d'abord, puis la cohérence entre contextes déjà visibles — jamais « ne concerne pas »
        // d'un élément qu'on ne peut pas voir.
        $this->guardLeaseMatchesProperty($v);
        $this->guardMaintenanceMatchesContext($v);
    }
}
