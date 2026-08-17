<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

class UserResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'full_name' => $this->full_name,
            'email' => $this->email,
            'phone' => $this->phone,
            'bio' => $this->bio,
            'avatar_url' => $this->getFirstMediaUrl('avatar') ?: null,
            'email_verified_at' => $this->email_verified_at?->toIso8601String(),
            'phone_verified_at' => $this->phone_verified_at?->toIso8601String(),
            'two_factor_enabled' => (bool) $this->two_factor_enabled,
            // TCK-272 — le front ne DEVINE pas le mode de step-up : le
            // backend le dit. `false` = le hash en base est une valeur
            // machine (OAuth / invitation / provisioning), donc la
            // suppression de compte passe par un code e-mail.
            //
            // ⚠ `whenHas`, et surtout PAS un appel nu. `hasUsablePassword()` se
            // réduit à `password_set_at !== null`, et cette colonne n'est
            // sélectionnée que quand la requête ramène le modèle entier.
            // `AgencyController::listMembers` passe un sparse fieldset
            // (`fields[users]=id,first_name,…`) : l'attribut est alors ABSENT,
            // Eloquent rend `null`, et un appel nu émettrait `false` pour
            // chaque membre — c'est-à-dire « ce compte n'a pas de mot de passe »
            // affirmé sur des comptes dont on n'a rien lu.
            //
            // `whenHas` omet la clé au lieu d'inventer sa valeur. Le typage
            // front la déclare optionnelle (`has_usable_password?: boolean`), et
            // le seul consommateur — `/api/auth/me` — ramène le modèle complet,
            // donc la reçoit toujours. *Un champ absent se remarque ; un champ
            // faux se croit.*
            'has_usable_password' => $this->whenHas(
                'password_set_at',
                fn () => $this->resource->hasUsablePassword(),
            ),
            // TCK-263 / TCK-264 — surfaced so the frontend can detect a
            // pending super-admin onboarding state and redirect to
            // /onboarding/super-admin before serving any super-admin route.
            'force_2fa_at_first_login' => (bool) $this->force_2fa_at_first_login,
            'agency_id' => $this->agency_id,
            'roles' => $this->profileTypes()->all(),
            'status' => $this->status?->value,
            // TCK-253 — opt-in personalisation hints set via PATCH /api/me.
            // Always returned as an object (possibly empty) so clients can
            // assume the shape without null-checks.
            'preferences' => is_array($this->preferences) ? $this->preferences : (object) [],
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
