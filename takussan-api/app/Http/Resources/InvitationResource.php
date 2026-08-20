<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
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
            'metadata' => $this->metadata,
        ];
    }
}
