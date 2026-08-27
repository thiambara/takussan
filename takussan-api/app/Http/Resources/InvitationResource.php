<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Enums\InvitationStatus;
use Illuminate\Http\Request;

/**
 * TCK-249 — invitation envelope.
 *
 * IMPORTANT: the raw `token` is intentionally **not** exposed here. The
 * accept URL is the only place where the token surfaces (in the email).
 * Resend regenerates the token, so callers that legitimately need to
 * forward an invitation use the resend endpoint instead.
 */
class InvitationResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'email' => $this->email,
            'role' => $this->role,
            'status' => $this->status?->value,
            'agency_id' => $this->agency_id,
            'invitable_type' => $this->invitable_type,
            'invitable_id' => $this->invitable_id,
            'invited_by' => $this->invited_by,
            'invited_user_id' => $this->invited_user_id,
            'expires_at' => $this->iso($this->expires_at),
            'accepted_at' => $this->iso($this->accepted_at),
            'revoked_at' => $this->iso($this->revoked_at),
            'last_reminded_at' => $this->iso($this->last_reminded_at),
            'created_at' => $this->iso($this->created_at),
            'is_expired' => $this->isExpired(),
            'metadata' => $this->metadata,
        ];
    }

    /**
     * TCK-367 — « expirée » est un état, pas une nuance de « en attente ».
     *
     * Deux façons de l'être, et le front ne peut en déduire aucune seule :
     *  - `status = expired`, écrit par le cron `invitations:expire` ;
     *  - `status = sent` avec `expires_at` déjà passé — le cron tourne à
     *    l'heure, l'invitation est morte AVANT qu'il ne la marque, et un
     *    écran qui ne lit que `status` l'affiche « en attente » pendant
     *    jusqu'à une heure. C'est ce trou-là que ce champ ferme.
     */
    protected function isExpired(): bool
    {
        if ($this->status === InvitationStatus::Expired) {
            return true;
        }

        return $this->status === InvitationStatus::Sent
            && $this->expires_at !== null
            && $this->expires_at->isPast();
    }
}
