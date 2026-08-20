<?php

namespace App\Services\Account;

use App\Http\Requests\Auth\RequestAccountDeletionRequest;
use App\Models\User;
use App\Notifications\AccountDeletionStepUpCodeNotification;
use App\Services\Auth\PhoneVerificationService;
use Illuminate\Contracts\Cache\Repository as CacheRepository;

/**
 * TCK-272 — step-up par code e-mail, pour les comptes dont le mot de passe
 * en base est une valeur machine ({@see User::hasUsablePassword()}).
 *
 * Le mécanisme est **calqué sur {@see PhoneVerificationService}**,
 * délibérément et à l'identique : code à 6 chiffres, stocké en cache sous
 * une clé par utilisateur, TTL 5 minutes, renvoi limité à 1 / 60 s par une
 * seconde clé, vérification par `hash_equals` puis `forget()` — donc usage
 * unique. Le produit sait déjà faire exactement cela ; on n'invente pas un
 * second patron d'OTP.
 *
 * Deux écarts assumés par rapport au modèle :
 *  1. Le canal est l'e-mail, pas le SMS. `PhoneVerificationService::sendSms()`
 *     n'est branché sur AUCUN driver (il journalise le code), et le
 *     provisioning OAuth ne renseigne jamais `phone` : un step-up SMS serait
 *     ici un mécanisme sans transport ET sans destinataire. `users.email`,
 *     lui, est NOT NULL pour tout le monde.
 *  2. La vérification est scindée en {@see verifyCode()} (lit, ne consomme
 *     pas) et {@see consumeCode()} (efface). Voir
 *     `RequestAccountDeletionRequest` : le code
 *     ne doit pas être brûlé par un échec 2FA ou par le pré-contrôle des
 *     obligations, sans quoi l'utilisateur perd son code sans rien avoir
 *     supprimé et réémet en boucle. La consommation reste dans la MÊME
 *     requête que la suppression, donc sans fenêtre de rejeu utile.
 */
class DeletionStepUpService
{
    public const CODE_TTL_SECONDS = 300;        // 5 minutes

    public const RESEND_COOLDOWN_SECONDS = 60;  // 1 / 60s

    public function __construct(private readonly CacheRepository $cache) {}

    public function canResend(User $user): bool
    {
        return ! $this->cache->has($this->cooldownKey($user));
    }

    /**
     * Génère + stocke un code frais, applique le cooldown, et notifie.
     * Rend le code hors production (les tests en ont besoin), jamais en
     * production. Rend `null` si le cooldown court encore — l'appelant
     * répond quand même 202 pour ne rien divulguer par le timing.
     */
    public function sendCode(User $user): ?string
    {
        if (! $this->canResend($user)) {
            return null;
        }

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        $this->cache->put($this->codeKey($user), $code, self::CODE_TTL_SECONDS);
        $this->cache->put($this->cooldownKey($user), true, self::RESEND_COOLDOWN_SECONDS);

        $user->notify(new AccountDeletionStepUpCodeNotification(
            $code,
            (int) (self::CODE_TTL_SECONDS / 60),
        ));

        return app()->environment('production') ? null : $code;
    }

    /** Vérifie SANS consommer. Comparaison à temps constant. */
    public function verifyCode(User $user, string $code): bool
    {
        $stored = $this->cache->get($this->codeKey($user));

        return is_string($stored) && $stored !== '' && hash_equals($stored, trim($code));
    }

    /**
     * Consomme le code : l'usage unique tient à cet appel.
     *
     * Il efface AUSSI le cooldown, ce qui a l'air d'annuler la borne « 1 e-mail
     * / 60 s » annoncée en tête de classe. Ce n'en est pas une brèche, et la
     * raison mérite d'être écrite plutôt que redécouverte :
     *
     *  1. `consumeCode()` n'est atteint que depuis
     *     {@see RequestAccountDeletionRequest}, une fois
     *     TOUS les contrôles passés — donc dans la requête qui appelle
     *     `AccountDeletionService::requestDeletion()`, laquelle **révoque
     *     immédiatement tous les jetons Sanctum** de l'utilisateur. À la
     *     milliseconde suivante, l'appelant n'a plus de quoi redemander un code.
     *  2. Le plafond d'e-mails ne repose de toute façon pas sur ce cooldown
     *     seul : la route porte `throttle:account-deletion-step-up`, borné à
     *     3/min ET 10/h par utilisateur.
     *
     * Le cooldown est là pour espacer les DEMANDES d'un utilisateur qui attend
     * son code, pas pour survivre à un parcours mené à son terme : le garder
     * ferait patienter jusqu'à 60 s quelqu'un qui annule sa suppression et la
     * relance, sans rien protéger de plus.
     */
    public function consumeCode(User $user): void
    {
        $this->cache->forget($this->codeKey($user));
        $this->cache->forget($this->cooldownKey($user));
    }

    private function codeKey(User $user): string
    {
        return "deletion-step-up:{$user->id}";
    }

    private function cooldownKey(User $user): string
    {
        return "deletion-step-up-cooldown:{$user->id}";
    }
}
