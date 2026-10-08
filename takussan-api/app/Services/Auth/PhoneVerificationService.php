<?php

namespace App\Services\Auth;

use App\Models\User;
use App\Services\Account\DeletionStepUpService;
use App\Services\Notifications\Sms\SmsResult;
use App\Services\Notifications\Sms\SmsRouterDriver;
use App\Support\CanonicalPhone;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Support\Facades\Log;

/**
 * Cycle de vie du code à usage unique envoyé par SMS (ADR-0033 §5).
 *
 * Deux sujets partagent le même mécanisme :
 *  - la vérification du numéro d'un compte (profil, onboardings) — code rangé
 *    par utilisateur, lié au numéro auquel il a été envoyé ;
 *  - un numéro sans compte connu (connexion par téléphone, step-up SMS,
 *    TCK-596 / TCK-599) — code rangé par portée et par numéro.
 *
 * Le code : 6 chiffres, TTL 5 min, usage unique, HACHÉ en cache, comparé par
 * `hash_equals`, invalidé après 5 échecs. Il n'est rendu à AUCUN appelant, dans
 * aucun environnement : les tests le lisent par `Tests\Support\FakeSmsRouter`.
 *
 * TCK-589 — l'envoi passe par {@see SmsRouterDriver} directement, jamais par
 * `SmsChannel` : ce canal abandonne sans erreur tout destinataire dont
 * `phone_verified_at` est nul, et le destinataire d'un code l'est par
 * construction. Le pilote `log-stub` qui écrivait le code dans le journal, et
 * le `debug_code` qu'on rendait hors production, ont disparu.
 */
class PhoneVerificationService
{
    public const CODE_TTL_SECONDS = 300;         // 5 minutes

    public const MAX_ATTEMPTS_PER_CODE = 5;

    private const RESEND_COOLDOWN_SECONDS = 60;  // 1 / 60s

    public function __construct(
        private readonly CacheRepository $cache,
        private readonly SmsRouterDriver $sms,
    ) {}

    // -----------------------------------------------------------------
    // Vérification du numéro d'un compte
    // -----------------------------------------------------------------

    public function canResend(User $user): bool
    {
        return ! $this->cache->has($this->cooldownKey($this->userSubject($user)));
    }

    /**
     * Vérification adverse m4 — le délai de renvoi d'un envoi, sans envoi : une réponse
     * neutre doit se comporter comme un envoi réel, second appel compris.
     */
    public function holdResendCooldown(User $user): void
    {
        $this->cache->put($this->cooldownKey($this->userSubject($user)), true, self::RESEND_COOLDOWN_SECONDS);
    }

    /**
     * Émet un code vers le numéro du compte. `false` si aucun numéro, ou si le
     * délai entre deux envois court encore. Ne rend jamais le code.
     */
    public function sendOtp(User $user): bool
    {
        if (! $user->phone) {
            return false;
        }

        return $this->issue($this->userSubject($user), (string) $user->phone, $user->preferred_language);
    }

    /**
     * Le code reçu sur le numéro ACTUEL du compte : un code envoyé à un numéro
     * remplacé depuis ne vérifie pas le nouveau.
     */
    public function verifyOtp(User $user, string $code): bool
    {
        if (! $user->phone) {
            return false;
        }

        return $this->check($this->userSubject($user), (string) $user->phone, $code);
    }

    // -----------------------------------------------------------------
    // Code adressé à un numéro, sans compte (connexion, step-up)
    // -----------------------------------------------------------------

    public function canSendTo(string $scope, string $phone): bool
    {
        return ! $this->cache->has($this->cooldownKey($this->numberSubject($scope, $phone)));
    }

    public function sendCodeTo(string $scope, string $phone, ?string $locale = null): bool
    {
        return $this->issue($this->numberSubject($scope, $phone), $phone, $locale);
    }

    /**
     * `$consume = false` vérifie le code sans le consommer : la connexion par téléphone d'un
     * compte à 2FA rend d'abord `requires_2fa`, et le client repose le MÊME code avec
     * son TOTP. Un code faux compte toujours comme un échec.
     */
    public function verifyCodeFor(string $scope, string $phone, string $code, bool $consume = true): bool
    {
        return $this->check($this->numberSubject($scope, $phone), $phone, $code, $consume);
    }

    /** Secondes avant qu'un nouvel envoi soit possible vers ce sujet. */
    /**
     * Vérification adverse M1 — un code est-il EN COURS pour ce numéro, sous cette portée ? Sans
     * code, une saisie ne prouve ni ne réfute rien : elle ne compte contre personne.
     */
    public function hasCodeFor(string $scope, string $phone): bool
    {
        $entry = $this->cache->get($this->codeKey($this->numberSubject($scope, $phone)));

        return is_array($entry) && ($entry['phone'] ?? null) === $phone;
    }

    public function retryAfter(): int
    {
        return self::RESEND_COOLDOWN_SECONDS;
    }

    // -----------------------------------------------------------------
    // Le seul écrivain de `phone_verified_at` (contrainte 5 ter)
    // -----------------------------------------------------------------

    public function isVerifiedElsewhere(string $phone, ?User $except = null): bool
    {
        // Vérification adverse m5 — la forme canonique, celle de l'index d'unicité.
        return User::query()
            ->whereRaw(CanonicalPhone::sql('phone').' = ?', [CanonicalPhone::fold($phone)])
            ->whereNotNull('phone_verified_at')
            ->when($except !== null, fn ($q) => $q->whereKeyNot($except->getKey()))
            ->exists();
    }

    /**
     * Pose `phone_verified_at` — après avoir vérifié qu'aucun autre compte n'a
     * déjà vérifié ce numéro (409 `phone.taken`). On TESTE avant d'écrire : la
     * violation de `users_phone_verified_unique` abandonnerait la transaction
     * entière sous PostgreSQL (piège n° 1), l'index n'est que le dernier recours.
     */
    public function markVerified(User $user, string $phone): void
    {
        if ($user->phone === $phone && $user->phone_verified_at !== null) {
            return;
        }

        if ($this->isVerifiedElsewhere($phone, $user)) {
            abort_code(409, 'phone.taken');
        }

        $user->forceFill(['phone' => $phone, 'phone_verified_at' => now()])->save();
    }

    // -----------------------------------------------------------------

    /**
     * Vérification adverse M3 — l'indicatif de ce numéro E.164 est-il servi pour un code
     * (`sms.otp_allowed_country_codes`) ? Jugé par chaque appelant AVANT toute écriture, et
     * répété par `issue()` : aucun chemin n'envoie hors de la liste.
     */
    public static function countryAllowed(string $phone): bool
    {
        foreach ((array) config('sms.otp_allowed_country_codes', []) as $indicatif) {
            if ($indicatif !== '' && str_starts_with($phone, '+'.$indicatif)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Passe 2 (p2-2) — la porte de TOUT SMS porteur d'un code : l'indicatif est servi, puis une
     * place est prise dans le plafond global du jour. `false` : rien ne doit partir. Publique pour
     * le step-up de suppression ({@see DeletionStepUpService}), qui garde
     * son code et son texte mais ne doit pas être une voie hors plafond.
     */
    public function reserveCodeDelivery(string $phone): bool
    {
        return self::countryAllowed($phone) && $this->reserveDailyCapacity();
    }

    private function issue(string $subject, string $phone, ?string $locale): bool
    {
        if (! self::countryAllowed($phone) || $this->cache->has($this->cooldownKey($subject))) {
            return false;
        }
        if (! $this->reserveCodeDelivery($phone)) {
            return false;
        }

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        $this->cache->put($this->codeKey($subject), [
            'hash' => $this->hash($code),
            'phone' => $phone,
            'attempts' => 0,
            'expires_at' => now()->addSeconds(self::CODE_TTL_SECONDS)->getTimestamp(),
        ], self::CODE_TTL_SECONDS);
        $this->cache->put($this->cooldownKey($subject), true, self::RESEND_COOLDOWN_SECONDS);

        $this->deliver($phone, $code, $locale);

        return true;
    }

    private function check(string $subject, string $phone, string $code, bool $consume = true): bool
    {
        $entry = $this->cache->get($this->codeKey($subject));
        if (! is_array($entry) || ($entry['phone'] ?? null) !== $phone) {
            return false;
        }

        if (hash_equals((string) $entry['hash'], $this->hash(trim($code)))) {
            if (! $consume) {
                return true;
            }
            $this->cache->forget($this->codeKey($subject));
            $this->cache->forget($this->cooldownKey($subject));

            return true;
        }

        // Compteur d'échecs PAR CODE : le limiteur de route se réarme chaque
        // minute pendant les 5 min de vie du code, il ne borne pas seul.
        $attempts = (int) ($entry['attempts'] ?? 0) + 1;
        $remaining = (int) $entry['expires_at'] - now()->getTimestamp();
        if ($attempts >= self::MAX_ATTEMPTS_PER_CODE || $remaining <= 0) {
            $this->cache->forget($this->codeKey($subject));
        } else {
            $this->cache->put($this->codeKey($subject), ['attempts' => $attempts] + $entry, $remaining);
        }

        return false;
    }

    /**
     * Vérification adverse M3 — plafond global journalier des codes (`sms.otp_daily_cap`).
     * Compté AVANT l'envoi : un envoi refusé au plafond ne dépense rien. L'alerte ne part
     * qu'une fois par jour, au premier refus.
     */
    private function reserveDailyCapacity(): bool
    {
        $key = 'sms-otp-day:'.now('UTC')->toDateString();
        $this->cache->add($key, 0, now('UTC')->endOfDay()->addHour());
        $sent = (int) $this->cache->increment($key);
        $cap = (int) config('sms.otp_daily_cap');
        if ($sent <= $cap) {
            return true;
        }

        if ($sent === $cap + 1) {
            Log::alert('Plafond journalier des codes SMS atteint : plus aucun code ne part avant demain.', [
                'cap' => $cap,
                'day' => now('UTC')->toDateString(),
            ]);
        }

        return false;
    }

    private function deliver(string $phone, string $code, ?string $locale): void
    {
        $results = $this->sms->send($phone, __('auth.phone.sms_code', [
            'code' => $code,
            'minutes' => (int) (self::CODE_TTL_SECONDS / 60),
        ], $locale ?: null), [
            'event_type' => 'phone_otp',
            'is_critical' => true,
            'bypass_quiet_hours' => true,
        ]);

        $delivered = array_filter($results, fn (SmsResult $r) => $r->status !== SmsResult::STATUS_FAILED);
        if ($delivered === []) {
            // Jamais le code dans le journal : seulement le constat.
            Log::warning('[phone-otp] aucun fournisseur SMS n\'a accepté le code', [
                'phone_suffix' => substr($phone, -4),
                'reasons' => array_values(array_map(fn (SmsResult $r) => $r->failureReason, $results)),
            ]);
        }
    }

    private function hash(string $code): string
    {
        return hash_hmac('sha256', $code, (string) config('app.key'));
    }

    private function userSubject(User $user): string
    {
        return (string) $user->id;
    }

    private function numberSubject(string $scope, string $phone): string
    {
        return "{$scope}:{$phone}";
    }

    private function codeKey(string $subject): string
    {
        return "phone-otp:{$subject}";
    }

    private function cooldownKey(string $subject): string
    {
        return "phone-otp-cooldown:{$subject}";
    }
}
