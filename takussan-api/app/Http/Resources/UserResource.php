<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\User;
use Illuminate\Http\Request;

class UserResource extends BaseResource
{
    /** Le compte servi est celui qui ouvre la session, même sans `$request->user()`. */
    private bool $pourSoi = false;

    /**
     * TCK-633 (lot C, tour 2) — pour un ouvreur de session (inscription, entrée par téléphone,
     * OAuth) : `$request->user()` y est nul, et les clés « pour soi » manquaient alors à la
     * réponse que le front pose telle quelle (`openSession`), contrairement à `/api/auth/me`.
     */
    public static function pourSoi(User $user): self
    {
        $resource = new self($user);
        $resource->pourSoi = true;

        return $resource;
    }

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
            'avatar_url' => $this->avatarUrl(),
            // TCK-1019 (P58.04) — `whenHas`, comme `has_usable_password` ci-dessous : ces colonnes
            // sont hors `User::$queryFields`, et sous un sparse fieldset un appel nu affirmait
            // `null` ou `false` sur des comptes dont rien n'avait été lu.
            'email_verified_at' => $this->whenHas('email_verified_at', fn () => $this->iso($this->email_verified_at)),
            'phone_verified_at' => $this->whenHas('phone_verified_at', fn () => $this->iso($this->phone_verified_at)),
            'two_factor_enabled' => $this->whenHas('two_factor_enabled', fn () => (bool) $this->two_factor_enabled),
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
            'force_2fa_at_first_login' => $this->whenHas('force_2fa_at_first_login', fn () => (bool) $this->force_2fa_at_first_login),
            // TCK-589 — la 2FA a été réinitialisée par le support : toute route hors
            // `auth/*` rend 403 `two_factor_required` jusqu'au ré-enrôlement, et le
            // front y conduit (`/onboarding/securite`).
            'force_2fa_reconfigure' => $this->whenHas('metadata', fn () => ($this->metadata['force_2fa_reconfigure'] ?? false) === true),
            // TCK-633 (lot C) — les préférences de contact ne sortent que pour SOI : `UserResource`
            // sert aussi les membres d'une agence (`AgencyController`), et le second numéro d'un
            // collègue n'a rien à faire dans cette liste.
            // Étalé, pas `mergeWhen()` (même raison que `CustomerResource`) : `AgencyController` et
            // `OAuthSessionOpener` appellent `toArray()` directement, où un `MergeValue` n'est pas
            // résolu — il sortait sous une clé `0`.
            ...($this->pourSoi || $request->user()?->getKey() === $this->resource->getKey() ? [
                // `null` = jamais répondu (l'écran de publication pose la question), `false` = non.
                'phone_whatsapp' => $this->phone_whatsapp === null ? null : (bool) $this->phone_whatsapp,
                'secondary_phone' => $this->secondary_phone,
                'secondary_phone_verified_at' => $this->iso($this->secondary_phone_verified_at),
                'secondary_phone_whatsapp' => (bool) $this->secondary_phone_whatsapp,
                'terms_accepted_at' => $this->iso($this->terms_accepted_at),
            ] : []),
            'agency_id' => $this->agency_id,
            'roles' => $this->profileTypes()->all(),
            'status' => $this->status?->value,
            // TCK-253 — opt-in personalisation hints set via PATCH /api/me.
            // Returned as an object (possibly empty) whenever the column was read, so clients can
            // assume the shape without null-checks; omitted under a sparse fieldset (TCK-1019).
            'preferences' => $this->whenHas('preferences', fn () => is_array($this->preferences) ? $this->preferences : (object) []),
            'created_at' => $this->iso($this->created_at),
        ];
    }
}
