<?php

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

/**
 * TCK-589, vérification adverse passe 3 (p3-1) — remplacer un numéro DÉJÀ VÉRIFIÉ exige une
 * preuve sur le facteur en place (ADR-0033, « le numéro vérifié est un identifiant »).
 *
 * Depuis TCK-589, le numéro vérifié n'est plus un attribut de profil : il ouvre le compte
 * (`request-code`) et porte le step-up de suppression d'un compte sans e-mail. Le remplacer sur
 * la seule session faisait d'un jeton volé une entrée DURABLE — un numéro vérifié qui survit à
 * l'expiration du jeton, à sa révocation et au changement de mot de passe — et l'ancien numéro
 * n'en savait rien.
 *
 * La preuve, au choix ({@see self::proofHolds()}) :
 *  (a) un code envoyé à l'ANCIEN numéro vérifié (`POST /auth/phone/change-code`), toujours
 *      disponible : la voie d'un compte sans mot de passe ;
 *  (b) le mot de passe du compte, s'il en a un ;
 *  (c) un step-up TOTP de moins de 10 min sur le jeton courant.
 *
 * Un compte sans numéro vérifié n'est pas concerné : son premier ajout reste libre.
 *
 * Les trois écrivains du numéro passent ici : `PUT /auth/profile`, `PATCH /me` et
 * `send-otp`/`phone/resend` avec un numéro. Le juge reprend la condition EXACTE de leur
 * écriture (`$user->phone !== $nouveau`) : toute écriture qui lèverait la vérification exige la
 * preuve. Une variante de forme jugée « même numéro » aurait levé la vérification sans preuve,
 * et le compte, devenu « sans numéro vérifié », aurait ensuite accepté n'importe quel numéro.
 */
class PhoneChangeGuard
{
    /** Portée du code envoyé à l'ancien numéro ({@see PhoneVerificationService::sendCodeTo()}). */
    public const SCOPE = 'phone-change';

    /** Mots de passe faux tolérés par fenêtre : au-delà, plus aucune preuve par mot de passe. */
    public const MAX_PASSWORD_FAILURES = 5;

    public const PASSWORD_WINDOW_MINUTES = 15;

    /** Les champs de preuve, acceptés par les trois écrivains du numéro. */
    public const PROOF_RULES = [
        'current_password' => ['sometimes', 'nullable', 'string', 'max:255'],
        'phone_change_code' => ['sometimes', 'nullable', 'string', 'max:16'],
    ];

    public function __construct(
        private readonly PhoneVerificationService $codes,
        private readonly CacheRepository $cache,
    ) {}

    /** L'écriture de `$nouveau` lèverait-elle la vérification d'un numéro vérifié ? */
    public function replacesVerified(User $user, ?string $nouveau): bool
    {
        return $user->phone_verified_at !== null
            && $user->phone !== null
            && $user->phone !== $nouveau;
    }

    /** 403 `phone.change_requires_proof` sans preuve ; ne rend la main qu'avec une preuve. */
    public function authorize(Request $request, User $user): void
    {
        abort_code_unless($this->proofHolds($request, $user), 403, 'phone.change_requires_proof');
    }

    /** (a) — le code part à l'ANCIEN numéro, par la porte commune des codes. */
    public function sendCode(User $user): bool
    {
        return $user->phone_verified_at !== null
            && $user->phone !== null
            && $this->codes->sendCodeTo(self::SCOPE, (string) $user->phone, $user->preferred_language);
    }

    private function proofHolds(Request $request, User $user): bool
    {
        // (c) — un TOTP saisi il y a moins de 10 min sur CE jeton.
        if (SessionTokenIssuer::stepUpValidUntil($user->currentAccessToken()) !== null) {
            return true;
        }

        // (b) — le mot de passe. Les échecs sont bornés : sans borne, la route deviendrait un
        // oracle du mot de passe à la cadence du limiteur de groupe, pour tout porteur du jeton.
        $password = $request->input('current_password');
        if (is_string($password) && $password !== '' && $user->hasUsablePassword()) {
            if ($this->passwordLocked($user)) {
                return false;
            }
            if (Hash::check($password, (string) $user->getAuthPassword())) {
                return true;
            }
            $this->recordPasswordFailure($user);

            return false;
        }

        // (a) — le code reçu sur l'ancien numéro : usage unique, 5 essais par code (le service).
        $code = $request->input('phone_change_code');

        return is_string($code) && $code !== ''
            && $this->codes->verifyCodeFor(self::SCOPE, (string) $user->phone, $code);
    }

    private function passwordLocked(User $user): bool
    {
        return (int) $this->cache->get($this->failuresKey($user), 0) >= self::MAX_PASSWORD_FAILURES;
    }

    private function recordPasswordFailure(User $user): void
    {
        $key = $this->failuresKey($user);
        // Fenêtre fixe : `add` n'écrit que si la clé manque, `increment` garde son échéance.
        $this->cache->add($key, 0, now()->addMinutes(self::PASSWORD_WINDOW_MINUTES));
        $this->cache->increment($key);
    }

    private function failuresKey(User $user): string
    {
        return "phone-change-password-failures:{$user->getKey()}";
    }
}
