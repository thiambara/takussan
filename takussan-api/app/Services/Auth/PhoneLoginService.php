<?php

namespace App\Services\Auth;

use App\Exceptions\SmsCodeUndelivered;
use App\Http\Resources\UserResource;
use App\Models\Enums\UserStatus;
use App\Models\RadarAdvertiser;
use App\Models\User;
use App\Services\Property\PublishReadiness;
use App\Support\CanonicalPhone;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * TCK-589 (ADR-0033) — l'entrée par téléphone : un code SMS remplace le mot de
 * passe, jamais le second facteur.
 *
 *  - Le code est rangé par NUMÉRO (portée `login`), sans `User` : la demande rend
 *    la même réponse que le numéro porte un compte ou non (énumération).
 *  - Un numéro ne connecte que le compte qui l'a VÉRIFIÉ (contrainte 2). Sinon le
 *    premier code valide crée un compte neuf — `phone_verified_at` posé par
 *    `markVerified`, mot de passe aléatoire, `password_set_at` nul, e-mail nul —
 *    même si un compte non vérifié porte ce numéro : aucune fusion. UNE exception
 *    (amendement du 2026-10-29, TCK-2389) : le compte que le Radar a créé pour ce
 *    numéro et qui n'a jamais eu d'autre facteur ({@see self::radarProvisionedAccount()}) —
 *    le code arrivé le vérifie, il ne s'en crée pas un second.
 *  - Verrou : celui du NUMÉRO (`LoginLock`, canal téléphone), avec ou sans compte —
 *    jamais celui du mot de passe (vérification adverse M1 : un tiers qui connaît le
 *    numéro fermait la porte du mot de passe). Lu AVANT le code : le bon code n'y
 *    échappe pas. Un code saisi alors qu'AUCUN n'est en cours rend 422 sans rien
 *    écrire : il ne prouve rien, il ne compte contre personne.
 *  - 2FA : le code SMS est d'abord vérifié SANS être consommé, la réponse
 *    `requires_2fa` invite à reposer le même code avec le TOTP.
 *  - Conditions (TCK-2404, article 6.3 des CGU) : le compte que le Radar désigne et qui ne les a
 *    jamais acceptées ({@see self::termsRequired()}) reçoit `requires_terms` et leur version, sur le
 *    même modèle — code non consommé, rien d'écrit — et c'est le même code reposé avec
 *    `terms_version` qui ouvre la session et date l'acceptation. Avant le second facteur : un TOTP ne
 *    survit pas à la lecture des conditions.
 *
 * Exposé sans `User` : TCK-596 / TCK-599 réutilisent `sendCodeTo` de
 * {@see PhoneVerificationService} sous leur propre portée.
 */
class PhoneLoginService
{
    public const SCOPE = 'login';

    public function __construct(
        private readonly PhoneVerificationService $codes,
        private readonly LoginLock $lock,
        private readonly TwoFactorService $twoFactor,
        private readonly SessionTokenIssuer $tokens,
        private readonly PhoneSendQuota $quota,
        private readonly PublishReadiness $readiness,
    ) {}

    /**
     * Émet un code si rien ne s'y oppose. Ne dit RIEN de l'issue : verrou, délai
     * entre deux envois et compte absent produisent la même réponse en amont.
     *
     * TCK-622 — seule la borne par numéro ({@see PhoneSendQuota}) peut refuser (429), et elle ne
     * dépend que des codes partis vers ce numéro. Dans le délai de renvoi, rien ne part et rien ne
     * compte. Un numéro verrouillé compte comme un envoi, délai de renvoi compris : sinon la borne
     * le distinguerait d'un numéro libre au quatrième appel.
     */
    public function requestCode(string $phone, ?string $locale): void
    {
        if (! $this->codes->canSendTo(self::SCOPE, $phone)) {
            return;
        }
        $this->quota->ensureAvailable($phone);

        if ($this->lock->isNumberLocked($phone)) {
            $this->codes->holdCooldownFor(self::SCOPE, $phone);
            $this->quota->hit($phone);

            return;
        }

        // P15.05 (TCK-783) — un SMS qu'aucun fournisseur n'a accepté ne se dit pas ici : cette
        // réponse ne dit rien de l'issue. Il compte comme un envoi, délai de renvoi compris.
        try {
            $sent = $this->codes->sendCodeTo(self::SCOPE, $phone, $locale);
        } catch (SmsCodeUndelivered) {
            $sent = true;
        }
        if ($sent) {
            $this->quota->hit($phone);
        }
    }

    /**
     * @param  array{two_factor_code?: ?string, recovery_code?: ?string, device_name?: ?string, terms_version?: ?string}  $proof
     */
    public function verify(string $phone, string $code, array $proof, ?string $locale): JsonResponse
    {
        $outcome = $this->authenticate($phone, $code, $proof, $locale);

        return $outcome instanceof JsonResponse ? $outcome : $outcome['response'];
    }

    /**
     * {@see self::verify()}, qui rend aussi le compte ouvert : la réclamation du Radar (TCK-2390) y publie avant de rendre la
     * réponse. Un refus (verrou, code faux, compte bloqué, 2FA attendue) est rendu tel quel, en `JsonResponse`.
     *
     * @param  array{two_factor_code?: ?string, recovery_code?: ?string, device_name?: ?string, terms_version?: ?string}  $proof
     * @return JsonResponse|array{user: User, is_new_account: bool, response: JsonResponse}
     */
    public function authenticate(string $phone, string $code, array $proof, ?string $locale): JsonResponse|array
    {
        $user = $this->verifiedAccount($phone);
        $radarAccount = false;
        if ($user === null) {
            $user = $this->radarProvisionedAccount($phone);
            $radarAccount = $user !== null;
        }

        if ($this->lock->isNumberLocked($phone)) {
            return AuthRefusal::response(423, 'account_locked', 'auth.account.locked');
        }

        // M1 (a) — sans code en cours, la saisie n'a rien à réfuter : 422, aucune écriture.
        if (! $this->codes->hasCodeFor(self::SCOPE, $phone)) {
            return AuthRefusal::response(422, 'phone_code_invalid', 'auth.phone.code_invalid');
        }

        $termsRequired = $user !== null && $this->termsRequired($user);
        $termsPending = $termsRequired && ($proof['terms_version'] ?? null) !== PublishReadiness::TERMS_VERSION;
        $twoFactorPending = $user !== null && $user->two_factor_enabled
            && empty($proof['two_factor_code']) && empty($proof['recovery_code']);

        if (! $this->codes->verifyCodeFor(self::SCOPE, $phone, $code, consume: ! $twoFactorPending && ! $termsPending)) {
            $this->lock->recordNumberFailure($phone);

            return AuthRefusal::response(422, 'phone_code_invalid', 'auth.phone.code_invalid');
        }

        if ($user !== null && ! $user->canOpenSession()) {
            return AuthRefusal::response(403, 'account_blocked', 'auth.account.blocked');
        }

        if ($termsPending) {
            return new JsonResponse([
                'requires_terms' => true,
                'terms_version' => PublishReadiness::TERMS_VERSION,
                'message' => __('auth.terms_required'),
            ], 200);
        }

        if ($twoFactorPending) {
            return new JsonResponse(['requires_2fa' => true, 'message' => __('auth.two_factor_required')], 200);
        }

        if ($user !== null && $user->two_factor_enabled && ! $this->secondFactorHolds($user, $proof)) {
            $this->lock->recordNumberFailure($phone);

            return new JsonResponse(['requires_2fa' => true, 'message' => __('auth.two_factor_invalid')], 401);
        }

        $isNewAccount = $user === null;
        $user ??= $this->createAccount($phone, $locale);
        if ($radarAccount) {
            // Le code vient d'arriver sur ce numéro : c'est lui qui le vérifie, après les contrôles
            // de code, de 2FA et de session (409 si un autre compte l'a vérifié entre-temps).
            DB::transaction(fn () => $this->codes->markVerified($user, $phone));
        }
        if ($termsRequired) {
            // La version reposée est celle que la réponse `requires_terms` désignait : l'acceptation la date.
            $this->readiness->recordTerms($user, true);
            // Vérification adverse m2 — la trace, comme `radar_claimed` : qui, quelle version, par quel chemin (la
            // connexion, ou la réclamation qui passe par ici). Ni numéro ni adresse IP.
            activity('Radar')
                ->causedBy($user)
                ->performedOn($user)
                ->withProperties([
                    'user_id' => $user->id,
                    'terms_version' => $user->terms_version,
                    'via' => request()->route()?->getName(),
                ])
                ->event('radar_terms_accepted')
                ->log('Conditions acceptées à l\'activation du compte créé par le Radar');
        }

        // Le verrou du mot de passe n'est PAS levé : un canal ne solde pas l'autre (M1 b).
        $this->lock->clearNumber($phone);
        $user->forceFill(['last_login_at' => now()])->save();

        $issued = $this->tokens->issue(
            $user,
            (string) ($proof['device_name'] ?? '') ?: 'auth_token',
            twoFactorJustVerified: (bool) $user->two_factor_enabled,
        );

        return ['user' => $user, 'is_new_account' => $isNewAccount, 'response' => new JsonResponse([
            'token' => $issued['token'],
            'expires_at' => $issued['expires_at']->toIso8601String(),
            // TCK-633 (lot C, tour 3) — `pourSoi` : la réponse porte les clés « pour soi » comme
            // `/api/auth/me` (`$request->user()` est nul ici), et le front la pose telle quelle.
            'user' => UserResource::pourSoi($user->fresh()),
            'is_new_account' => $isNewAccount,
        ], 200)];
    }

    /** TCK-2404 — la réponse présente-t-elle les conditions (`requires_terms`) ? Elle ne suit qu'un code juste. */
    public static function presentsTerms(JsonResponse $response): bool
    {
        return $response->getStatusCode() === 200 && ($response->getData(true)['requires_terms'] ?? false) === true;
    }

    /**
     * TCK-2390 — le code saisi pour ce numéro, jugé et CONSOMMÉ comme à la connexion (verrou du numéro lu d'abord, 422 sans
     * code en cours et sans écriture, un échec compté contre le numéro), sans ouvrir de session : pour un compte déjà
     * connecté qui doit encore prouver le numéro. `null` : le code est bon.
     */
    public function checkCode(string $phone, string $code): ?JsonResponse
    {
        if ($this->lock->isNumberLocked($phone)) {
            return AuthRefusal::response(423, 'account_locked', 'auth.account.locked');
        }
        if (! $this->codes->hasCodeFor(self::SCOPE, $phone)) {
            return AuthRefusal::response(422, 'phone_code_invalid', 'auth.phone.code_invalid');
        }
        if (! $this->codes->verifyCodeFor(self::SCOPE, $phone, $code)) {
            $this->lock->recordNumberFailure($phone);

            return AuthRefusal::response(422, 'phone_code_invalid', 'auth.phone.code_invalid');
        }
        $this->lock->clearNumber($phone);

        return null;
    }

    /**
     * TCK-2390 — le compte qu'un code valide pour ce numéro ouvrirait, sans rien écrire : celui qui l'a vérifié, sinon le
     * compte du Radar ({@see self::radarProvisionedAccount()}), sinon aucun (un compte neuf serait créé).
     *
     * @return array{user: ?User, verified: bool}
     */
    public function accountFor(string $phone): array
    {
        $verified = $this->verifiedAccount($phone);

        return ['user' => $verified ?? $this->radarProvisionedAccount($phone), 'verified' => $verified !== null];
    }

    /** Le compte qui a VÉRIFIÉ ce numéro — un numéro seulement saisi ne prouve rien. */
    private function verifiedAccount(string $phone): ?User
    {
        // Vérification adverse m5 — la forme canonique : un numéro vérifié hérité hors E.164
        // retrouve son compte au lieu d'en ouvrir un second.
        return User::query()
            ->whereRaw(CanonicalPhone::sql('phone').' = ?', [CanonicalPhone::fold($phone)])
            ->whereNotNull('phone_verified_at')
            ->first();
    }

    /**
     * ADR-0033 §3, amendement du 2026-10-29 (TCK-2389) — le compte que le Radar a créé pour ce numéro,
     * s'il n'a jamais eu d'autre facteur : désigné par un `radar_advertisers`, ce `phone` (forme
     * canonique), ni numéro vérifié, ni mot de passe choisi, ni e-mail. Plus d'un candidat : aucun.
     */
    private function radarProvisionedAccount(string $phone): ?User
    {
        $candidates = User::query()
            ->whereRaw(CanonicalPhone::sql('phone').' = ?', [CanonicalPhone::fold($phone)])
            ->whereNull('phone_verified_at')
            ->whereNull('password_set_at')
            ->whereNull('email')
            ->whereIn('id', RadarAdvertiser::query()->whereNotNull('user_id')->select('user_id'))
            ->limit(2)
            ->get();

        return $candidates->count() === 1 ? $candidates->first() : null;
    }

    /**
     * TCK-2404 — l'article 6.3 des CGU : le compte qu'un `radar_advertisers` désigne s'active par ce code, et les Conditions
     * lui sont alors présentées. Jugé sur le compte, activé ou non : un compte du Radar activé avant ce ticket n'a rien
     * accepté. Une acceptation déjà datée (réclamation, publication), quelle que soit sa version, ne se redemande pas.
     */
    private function termsRequired(User $user): bool
    {
        return $user->terms_accepted_at === null
            && RadarAdvertiser::query()->where('user_id', $user->id)->exists();
    }

    /** @param  array{two_factor_code?: ?string, recovery_code?: ?string}  $proof */
    private function secondFactorHolds(User $user, array $proof): bool
    {
        if (! empty($proof['two_factor_code'])
            && $this->twoFactor->verifyCodeForUser($user, (string) $user->two_factor_secret, (string) $proof['two_factor_code'])) {
            return true;
        }

        return ! empty($proof['recovery_code']) && $this->twoFactor->verifyRecoveryCode($user, (string) $proof['recovery_code']);
    }

    private function createAccount(string $phone, ?string $locale): User
    {
        return DB::transaction(function () use ($phone, $locale): User {
            $user = new User;
            $user->forceFill([
                'first_name' => '',
                'last_name' => '',
                'email' => null,
                // Aucun mot de passe connu : la valeur machine fait échouer
                // `Hash::check`, et `password_set_at` nul le dit (TCK-272).
                'password' => Hash::make(Str::random(40)),
                'status' => UserStatus::Active,
                'preferred_language' => $locale ?: config('app.locale'),
            ])->save();

            // Le seul écrivain de `phone_verified_at` (contrainte 5 ter) : le code
            // vient d'arriver sur ce numéro.
            $this->codes->markVerified($user, $phone);

            return $user;
        });
    }
}
