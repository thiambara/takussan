<?php

namespace App\Http\Requests\Conversation;

use App\Http\Requests\BaseFormRequest;
use App\Http\Requests\Concerns\AuthorizesTransitionally;
use App\Models\Conversation;
use App\Services\Messaging\ConversationAccess;
use App\Services\Messaging\EvenementsDuFil;
use App\Services\Messaging\SujetsDuFil;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Validation\Rule;

/**
 * TCK-2964 (ADR-0128 § 4) — `POST /api/conversations/{conversation}/cards` `{object: {type, id}}` : poser
 * un objet dans un fil (partager un bien, proposer le créneau d'une visite).
 *
 * Le corps n'a QU'UNE clé lue, `object` : le serveur pose `type = card`, `code`, `data` et `content`
 * ({@see EvenementsDuFil::carte()}) ; `validated()` ne rend rien d'autre.
 *
 * `authorize()` court AVANT les règles, dans cet ordre :
 *  1. l'auteur ÉCRIT dans le fil (`ConversationAccess::allowsWriting`, la règle de l'envoi d'un message) ;
 *  2. une demande mal formée (type hors des types POSABLES — un type du registre comme `lease_payment`,
 *     ou hors registre —, identifiant qui n'est pas un entier positif) passe, et les règles la refusent
 *     en 422 : sans cela, `SujetsDuFil::resoudre` lèverait sur un type inconnu (500) et PostgreSQL sur
 *     un identifiant non numérique (`22P02`). Un nom venu de la requête n'est jamais résolu hors du
 *     registre ;
 *  3. une demande bien formée dont l'objet est absent ou supprimé reçoit le refus (403), comme l'objet
 *     d'un tiers : la route ne dit pas quels objets existent (le patron d'`OpenRoomRequest`) ;
 *  4. l'auteur LIT l'objet qu'il pose (`SujetsDuFil::peutLire`) : on ne partage pas ce qu'on ne lit pas.
 */
class StoreConversationCardRequest extends BaseFormRequest
{
    use AuthorizesTransitionally;

    private ?Model $objet = null;

    private bool $resolu = false;

    public function authorize(): bool
    {
        $conversation = $this->route('conversation');
        $user = $this->user();
        if ($user === null || ! $conversation instanceof Conversation
            || ! $this->isActiveParticipant($conversation)
            || ! app(ConversationAccess::class)->allowsWriting($user, $conversation)) {
            return false;
        }
        if (! $this->bienFormee()) {
            return true;
        }

        $objet = $this->objet();

        return $objet !== null && SujetsDuFil::peutLire($user, $objet);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'object' => ['required', 'array'],
            'object.type' => ['required', 'string', Rule::in(SujetsDuFil::typesPosables())],
            'object.id' => ['required', 'integer', 'min:1'],
        ];
    }

    /** Un type posable et un identifiant entier positif : ce que les règles accepteront. */
    private function bienFormee(): bool
    {
        $objet = $this->input('object');

        return is_array($objet)
            && in_array($objet['type'] ?? null, SujetsDuFil::typesPosables(), true)
            && filter_var($objet['id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) !== false;
    }

    /** L'objet vivant (non supprimé) que la requête désigne, ou `null`. */
    public function objet(): ?Model
    {
        if ($this->resolu) {
            return $this->objet;
        }
        $this->resolu = true;

        if (! $this->bienFormee()) {
            return null;
        }

        $objet = SujetsDuFil::resoudre((string) $this->input('object.type'), (int) $this->input('object.id'));
        $supprime = $objet !== null
            && in_array(SoftDeletes::class, class_uses_recursive($objet), true)
            && $objet->trashed();

        return $this->objet = $supprime ? null : $objet;
    }
}
