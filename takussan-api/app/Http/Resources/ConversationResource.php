<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Enums\MessageType;
use App\Models\User;
use App\Services\Messaging\EvenementsDuFil;
use App\Services\Messaging\FileDuFil;
use Illuminate\Http\Request;

class ConversationResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'subject' => $this->subject,
            'type' => $this->type?->value,
            'status' => $this->status?->value,
            'property_id' => $this->property_id,
            'lease_id' => $this->lease_id,
            'maintenance_request_id' => $this->maintenance_request_id,
            // TCK-2957 (ADR-0128 § 1) — l'objet auquel le fil appartient (clé du registre `SujetsDuFil`), nuls sans sujet.
            'subject_type' => $this->subject_type,
            'subject_id' => $this->subject_id,
            'created_by' => $this->created_by,
            'last_message_preview' => $this->last_message_preview,
            'last_message_at' => $this->iso($this->last_message_at),
            'created_at' => $this->iso($this->created_at),
            // TCK-952 — le front le déclare obligatoire (`Conversation.updated_at`), et la liste le
            // demande dans ses `fields[conversations]`.
            'updated_at' => $this->iso($this->updated_at),
            // Calculé par la seule liste (`ConversationController::index`) : absent ailleurs.
            'unread_count' => $this->whenHas('unread_count', fn () => (int) $this->unread_count),
            // TCK-2967 (ADR-0128 § 7) — la boîte de pilotage, calculée par la seule liste (`FileDuFil`) pour
            // le LECTEUR : sa file, et ses deux gestes à lui (« Rappelez-le-moi », « Traité »).
            // `attend_depuis` ne vaut que pour `vous`, `en_attente_de` que pour `attente` : les identifiants
            // des participants attendus, d'où le front compose « Bineta Sarr doit signer ».
            'file' => $this->whenHas('boite_file', fn () => $this->boite_file),
            'attend_depuis' => $this->whenHas('boite_file', fn () => $this->boite_file === FileDuFil::VOUS ? $this->iso($this->boite_attend_depuis) : null),
            'en_attente_de' => $this->whenHas('boite_file', fn () => $this->boite_file === FileDuFil::ATTENTE
                ? array_values(array_map('intval', (array) $this->boite_en_attente_de))
                : []),
            'snoozed_until' => $this->whenHas('boite_file', fn () => $this->iso($this->boite_snoozed_until)),
            'handled_at' => $this->whenHas('boite_file', fn () => $this->iso($this->boite_handled_at)),
            // TCK-2967 — la personne de l'agence qui suit le fil : son nom, jamais ses coordonnées.
            'assigned_to' => $this->whenLoaded('assignedTo', fn () => $this->assignedTo ? [
                'id' => (int) $this->assignedTo->id,
                'name' => $this->assignedTo->nameWithoutContact(),
            ] : null),
            // TCK-671 (P06.02) — chargé par la liste. TCK-2958 (ADR-0128 § 3) : pour un `system`, un
            // `event` ou une `card`, `last_message_preview` est un CODE ; le front compose l'aperçu depuis
            // `metadata` (`event`, ou `code` et `data`), dans la langue du lecteur. La metadata d'un
            // message de membre ne sort pas (durée d'une note vocale…).
            'last_message' => $this->whenLoaded('lastMessage', fn () => $this->lastMessage ? [
                'id' => $this->lastMessage->id,
                'type' => $this->enumValue($this->lastMessage->type),
                // TCK-2858 — l'auteur du dernier message : l'accueil du client (TCK-2853) écrit « X vous a
                // répondu » seulement si ce n'est pas le sien. `null` pour un avis système.
                'sender_id' => $this->lastMessage->sender_id !== null ? (int) $this->lastMessage->sender_id : null,
                // TCK-2959 — sans `action_for` : la liste des comptes qui doivent agir ne sort pas par la liste.
                'metadata' => in_array($this->lastMessage->type, MessageType::aContenuCode(), true) ? EvenementsDuFil::metadataRendu($this->lastMessage->metadata) : null,
            ] : null),
            // Relation is `BelongsTo` so `whenLoaded` can yield null when the
            // FK is null and the relation has been eager-loaded — guard
            // against feeding `null` to `PropertyResource::make`.
            'property' => $this->whenLoaded(
                'property',
                fn () => $this->property ? PropertyResource::make($this->property) : null,
            ),
            // TCK-576 — chargé par `show()`, et par la liste depuis TCK-579. Le nom et l'avatar, jamais les coordonnées
            // (même règle que `MessagingContactResource`) : un membre n'a pas à lire l'e-mail des
            // autres. `id` est celui de la ligne de participation, `user_id` celui du compte.
            //
            // Reprise du 2026-09-24 — l'état de lecture d'un membre est PRIVÉ, comme sa sourdine :
            //  - `is_muted` n'est rendu que pour le lecteur ; la clé est ABSENTE pour les autres
            //    (le front la type `is_muted?: boolean`, et ne lit que la ligne de l'utilisateur
            //    courant : ChatView, ConversationList, useUnreadCount) ;
            //  - `last_read_at` n'est rendu que pour le lecteur ; il vaut `null` pour les autres.
            //    Aucun consommateur ne lit celui d'un AUTRE membre (mesuré : côté front, la seule
            //    occurrence est la déclaration de `types/message.ts` ; côté API, le compte de non-lus
            //    et `markAsRead` ne lisent que la ligne du lecteur). `null` et non l'absence : le
            //    type du front déclare la clé obligatoire (`last_read_at: string | null`), et `null`
            //    est déjà la valeur d'un membre qui n'a rien lu. Des accusés de lecture individuels
            //    le rouvriraient par une décision explicite, pas par un reste.
            'participants' => $this->whenLoaded('participants', fn () => $this->participants
                ->map(fn (User $user) => [
                    'id' => $user->pivot?->id,
                    'user_id' => $user->id,
                    'role' => $user->pivot?->role?->value,
                    // TCK-2632 — l'archive, privée comme la sourdine : le front marque « Archivée »
                    // un fil rouvert par `filter[participant]`.
                    ...($this->estLeLecteur($user, $request)
                        ? ['is_muted' => (bool) $user->pivot?->is_muted, 'archived_at' => $this->iso($user->pivot?->archived_at)]
                        : []),
                    'last_read_at' => $this->estLeLecteur($user, $request)
                        ? $this->iso($user->pivot?->last_read_at)
                        : null,
                    'joined_at' => $this->iso($user->pivot?->joined_at),
                    'left_at' => $this->iso($user->pivot?->left_at),
                    'user' => [
                        'id' => $user->id,
                        // TCK-2132 (P220.01) — le nom montré aux autres participants : prénom
                        // et nom, puis `username`, puis « — » (`nameWithoutContact()`, TCK-815),
                        // jamais `''` pour un compte créé par téléphone.
                        'full_name' => $user->nameWithoutContact(),
                        'avatar_url' => $user->avatarUrl(),
                    ],
                ])
                ->values()
                ->all()),
        ];
    }

    private function estLeLecteur(User $user, Request $request): bool
    {
        return (int) $user->id === (int) $request->user()?->id;
    }
}
