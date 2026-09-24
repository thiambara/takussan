<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\User;
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
            'created_by' => $this->created_by,
            'last_message_preview' => $this->last_message_preview,
            'last_message_at' => $this->iso($this->last_message_at),
            'created_at' => $this->iso($this->created_at),
            // Relation is `BelongsTo` so `whenLoaded` can yield null when the
            // FK is null and the relation has been eager-loaded — guard
            // against feeding `null` to `PropertyResource::make`.
            'property' => $this->whenLoaded(
                'property',
                fn () => $this->property ? PropertyResource::make($this->property) : null,
            ),
            // TCK-576 — chargé par `show()` seulement. Le nom et l'avatar, jamais les coordonnées
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
                    ...($this->estLeLecteur($user, $request)
                        ? ['is_muted' => (bool) $user->pivot?->is_muted]
                        : []),
                    'last_read_at' => $this->estLeLecteur($user, $request)
                        ? $this->iso($user->pivot?->last_read_at)
                        : null,
                    'joined_at' => $this->iso($user->pivot?->joined_at),
                    'left_at' => $this->iso($user->pivot?->left_at),
                    'user' => [
                        'id' => $user->id,
                        'full_name' => $user->full_name,
                        'avatar_url' => $user->getFirstMediaUrl('avatar') ?: null,
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
