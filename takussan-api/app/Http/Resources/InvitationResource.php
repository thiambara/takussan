<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * TCK-249 — invitation envelope.
 *
 * IMPORTANT: the raw `token` is intentionally **not** exposed here. The
 * accept URL is the only place where the token surfaces (in the email).
 * Resend regenerates the token, so callers that legitimately need to
 * forward an invitation use the resend endpoint instead.
 */
class InvitationResource extends JsonResource
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
            'expires_at' => $this->expires_at?->toIso8601String(),
            'accepted_at' => $this->accepted_at?->toIso8601String(),
            'revoked_at' => $this->revoked_at?->toIso8601String(),
            'last_reminded_at' => $this->last_reminded_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'metadata' => $this->metadata,
        ];
    }
}
