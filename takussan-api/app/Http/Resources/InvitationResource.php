<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Customer;
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
            'phone' => $this->phone,
            'role' => $this->role,
            'status' => $this->status?->value,
            'agency_id' => $this->agency_id,
            'invitable_type' => $this->invitable_type,
            'invitable_id' => $this->invitable_id,
            'invited_by' => $this->invited_by,
            // P242.03 (TCK-2365, décision du porteur du 2026-10-25) — une invitation ne dit rien de
            // l'existence du compte : avant l'acceptation, ce champ disait à l'invitant si l'adresse
            // ou le numéro vérifié avait un compte sur la plateforme. Aucun écran ne le lisait.
            'invited_user_id' => $this->status === InvitationStatus::Accepted ? $this->invited_user_id : null,
            'expires_at' => $this->iso($this->expires_at),
            'accepted_at' => $this->iso($this->accepted_at),
            'revoked_at' => $this->iso($this->revoked_at),
            'last_reminded_at' => $this->iso($this->last_reminded_at),
            'created_at' => $this->iso($this->created_at),
            'is_expired' => $this->isExpired(),
            // Vérification de TCK-2668 (D1) — les gestes que `InvitationPolicy` accorde à l'appelant :
            // la fiche client n'offre « Relancer » et « Annuler » que sur ce que l'API dit. Rendus
            // seulement pour une invitation NÉE D'UNE FICHE CLIENT (la seule où la règle diffère de
            // `team.invite`, que les autres écrans lisent déjà) : une liste d'équipe ne paie pas deux
            // jugements par ligne (TCK-2739). Et seulement quand la ligne porte ce que la règle lit :
            // une sélection restreinte (`fields[invitations]`) qui les tait jugerait sur des colonnes
            // absentes.
            'abilities' => $this->when(
                $request->user() !== null && $this->porteCeQueLaRegleLit()
                    && $this->resource->getAttribute('invitable_type') === (new Customer)->getMorphClass(),
                fn (): array => [
                    'resend' => $request->user()->can('resend', $this->resource),
                    'revoke' => $request->user()->can('revoke', $this->resource),
                ],
            ),
            // P181.05 (TCK-2221) — `metadata` n'est pas rendu : il porte des clés internes que
            // l'API relit (`level`, `from_maintenance_request_id`, `deep_link_consumed_at`,
            // `locale`) et qu'aucun écran ne lit, y compris à l'invité qui accepte par le jeton.
        ];
    }

    private function porteCeQueLaRegleLit(): bool
    {
        $attributs = $this->resource->getAttributes();

        foreach (['agency_id', 'invited_by', 'invitable_type', 'invitable_id'] as $colonne) {
            if (! array_key_exists($colonne, $attributs)) {
                return false;
            }
        }

        return true;
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
