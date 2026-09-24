<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Http\Requests\Conversation\Concerns\GuardsConversationScope;
use App\Models\Enums\ConversationType;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Rules\ParticipantIdsRule;
use App\Services\Messaging\MessagingReach;
use App\Services\Messaging\PropertyConversationResolver;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * TCK-305 — extrait de ConversationController::store(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class StoreConversationRequest extends BaseFormRequest
{
    use GuardsConversationScope;

    /**
     * L'autorisation NE migre PAS ici : elle appartient au contrôleur puis aux policies
     * (principes non négociables 1 et 2, et TCK-306). `BaseFormRequest` refuse par défaut —
     * *fail-closed* — donc sans cette surcharge l'endpoint rendrait 403 pour tout le monde.
     */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'subject' => ['nullable', 'string'],
            'type' => ['nullable', Rule::enum(ConversationType::class)],
            // TCK-565 — l'existence n'est PAS vérifiée ici, règle par règle : `exists` produisait
            // une erreur PAR POSITION (« The selected participants.0 is invalid. (and 1 more
            // error) », capture du retour testeur du 2026-09-23). Elle l'est une fois, pour tout
            // le tableau, dans `withValidator()`. Et AUCUNE règle sur `participants.*` : même
            // `integer` y rend « participants.0 » — la forme vient de l'astérisque, pas de la règle.
            'participants' => ['bail', 'required', 'array', 'min:1', new ParticipantIdsRule],
            'property_id' => ['nullable', 'exists:properties,id'],
            'lease_id' => ['nullable', 'exists:leases,id'],
            'initial_message' => ['nullable', 'string'],
        ];
    }

    /**
     * TCK-565 — une seule erreur, sur `participants`, quel que soit le nombre de personnes
     * introuvables : le message dit ce qui se passe (« une personne n'est plus disponible »),
     * jamais QUELLE position du tableau a échoué, ce qui ne dit rien à l'utilisateur.
     *
     * Réparation 2 (vérificateur, 2026-09-23) — **la conversation directe applique désormais le
     * même périmètre que le groupe.** Elle n'en appliquait aucun : `POST /api/conversations` sans
     * `type` acceptait N inconnus, qui devenaient des correspondants — donc des contacts que le
     * sélecteur listait et que la création de groupe acceptait ensuite. Trois gardes, et elles
     * ferment ce détour ensemble :
     *
     *  - **une directe relie DEUX personnes** : l'acteur et UNE autre. Au-delà, c'est un groupe,
     *    et il passe par le chemin du groupe (sujet, administrateur, 3 à 20 participants) ;
     *  - **cette personne doit être joignable** ({@see MessagingReach}, la règle du sélecteur) ;
     *  - **le bien et le bail rattachés doivent être visibles** de l'acteur.
     *
     * Premier contact avec un inconnu : ce n'est PAS ce chemin. Un visiteur écrit à l'agent d'une
     * annonce par `PublicPropertyController::contactMessage()`, qui choisit lui-même le
     * destinataire ({@see PropertyConversationResolver}). Relevé le 2026-09-23 : aucun écran du
     * front n'appelle `POST /api/conversations` pour une directe (`useCreateConversation` n'a
     * aucun appelant).
     *
     * Le groupe est re-validé par `CreateGroupConversationRequest`, qui applique les mêmes gardes
     * (trait {@see GuardsConversationScope}) : on ne les rejoue pas ici.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            $this->checkParticipants($v);

            $actor = $this->user();
            if ($actor === null || $this->isGroup()) {
                return;
            }

            $this->guardContext($v, $actor, [
                'property_id' => Property::class,
                'lease_id' => Lease::class,
            ], 'messaging.errors.conversation_context_forbidden');
            $this->guardLeaseMatchesProperty($v);
        });
    }

    private function checkParticipants(Validator $v): void
    {
        if ($v->errors()->has('participants')) {
            return;
        }

        $ids = array_values(array_unique(array_map('intval', (array) $this->input('participants', []))));
        if ($ids === []) {
            return;
        }

        $found = User::query()->whereIn('id', $ids)->count();
        if ($found !== count($ids)) {
            $v->errors()->add('participants', __('messaging.errors.participants_unavailable'));

            return;
        }

        $actor = $this->user();
        if ($actor === null || $this->isGroup()) {
            return;
        }

        $others = array_values(array_diff($ids, [(int) $actor->id]));
        if (count($others) !== 1) {
            $v->errors()->add('participants', __('messaging.errors.direct_single_participant'));

            return;
        }

        $this->guardReach($v, $actor, $others, 'participants');
    }

    private function isGroup(): bool
    {
        return $this->input('type') === ConversationType::Group->value;
    }
}
