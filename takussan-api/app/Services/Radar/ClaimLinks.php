<?php

namespace App\Services\Radar;

use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Support\LienFront;
use App\Support\RadarPhone;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/**
 * TCK-2390 (ADR-0077 §3) — le lien de réclamation : propre à l'annonceur, signé, à durée limitée, et mort après un STOP
 * ou une révocation. Le message d'accord (`accord.v2`, `{lien_reclamation}`) et le second message (`publie.v2`) le portent.
 *
 * Le jeton est `{annonceur}.{émis_à}.{signature}` : HMAC-SHA256 tronqué à 128 bits, clé dérivée de `app.key`, et
 * reconnue sous `APP_PREVIOUS_KEYS` comme les URL signées de Laravel. TCK-2414 : PAS sous la clé dédiée des refus
 * ({@see RadarPhone::hmac()}) — une rotation d'`APP_KEY` peut tuer un lien (le suivant en porte un neuf), elle ne doit
 * jamais faire oublier un refus. **Rien n'est stocké** : l'expiration se calcule à la lecture
 * (`émis_à` + `radar.claim.link_ttl_days`), et la révocation se lit dans l'état de l'annonceur. Un jeton se recompose
 * donc à l'identique depuis `émis_à` — c'est ce qui garde le texte enregistré d'un message, celui de son lien `wa.me` et
 * l'aperçu de la console sur une seule chaîne, quand `émis_à` est le `created_at` du message.
 *
 * Jeton illisible, signature fausse, annonceur inconnu : 404 `radar.claim.invalid`, sans distinction (rien ne s'énumère).
 * Lien expiré : 410 `radar.claim.expired`. Annonceur qui a dit STOP, dont un accord est révoqué ou dont le numéro est
 * purgé : 410 `radar.claim.revoked`.
 */
final class ClaimLinks
{
    /** Le motif de route ; `resolve()` rejuge la forme exacte. */
    public const TOKEN_PATTERN = '[0-9]{1,12}\.[0-9]{1,12}\.[A-Za-z0-9_-]{22}';

    private const SIGNATURE_BYTES = 16;

    /** Une horloge d'émission en avance (serveurs décalés) se tolère jusque-là, pas au-delà. */
    private const CLOCK_SKEW_SECONDS = 300;

    public function token(RadarAdvertiser $advertiser, CarbonInterface $issuedAt): string
    {
        $payload = $advertiser->getKey().'.'.$issuedAt->getTimestamp();

        return $payload.'.'.self::sign($payload);
    }

    /** La page publique de réclamation, dans la langue du message qui porte le lien. */
    public function url(RadarAdvertiser $advertiser, CarbonInterface $issuedAt, string $locale): string
    {
        return LienFront::vers("/{$locale}/claim/".$this->token($advertiser, $issuedAt));
    }

    public function expiresAt(CarbonInterface $issuedAt): CarbonInterface
    {
        return CarbonImmutable::createFromTimestamp($issuedAt->getTimestamp())->addDays((int) config('radar.claim.link_ttl_days'));
    }

    /** L'annonceur du lien, s'il sert encore ; 404 ou 410 sinon. */
    public function resolve(string $token): RadarAdvertiser
    {
        $parts = self::signedParts($token);
        abort_code_if($parts === null, 404, 'radar.claim.invalid');

        $advertiser = RadarAdvertiser::query()->find((int) $parts[0]);
        abort_code_if($advertiser === null, 404, 'radar.claim.invalid');

        $issuedAt = CarbonImmutable::createFromTimestamp((int) $parts[1]);
        abort_code_if($issuedAt->getTimestamp() > now()->getTimestamp() + self::CLOCK_SKEW_SECONDS, 404, 'radar.claim.invalid');
        abort_code_if(self::revoked($advertiser), 410, 'radar.claim.revoked');
        abort_code_if(now()->greaterThanOrEqualTo($this->expiresAt($issuedAt)), 410, 'radar.claim.expired');

        return $advertiser;
    }

    /**
     * Le lien ne sert plus, quelle que soit sa date : STOP ou révocation (`do_not_contact_at`, ADR-0077 §8), un accord retiré
     * (`radar_consents.revoked_at`), ou le numéro purgé — il n'y a plus personne à qui envoyer le code.
     */
    public static function revoked(RadarAdvertiser $advertiser): bool
    {
        return $advertiser->do_not_contact_at !== null
            || $advertiser->phone === null
            || RadarConsent::query()->where('radar_advertiser_id', $advertiser->getKey())->whereNotNull('revoked_at')->exists();
    }

    /**
     * Le numéro de l'annonceur d'un jeton bien signé, quelle que soit sa date, sans rien lever : la clé du limiteur de la
     * confirmation, qui doit être celle de `auth-phone-verify` pour ce numéro (un seul seau par numéro, ADR-0033 §6, M1 c).
     */
    public static function phoneOf(string $token): ?string
    {
        $parts = self::signedParts($token);

        return $parts === null ? null : RadarAdvertiser::query()->whereKey((int) $parts[0])->value('phone');
    }

    /** @return array{0: string, 1: string}|null l'annonceur et l'émission, si la forme et la signature tiennent */
    private static function signedParts(string $token): ?array
    {
        $parts = explode('.', $token);

        if (count($parts) !== 3 || ! ctype_digit($parts[0]) || ! ctype_digit($parts[1])) {
            return null;
        }
        foreach ([config('app.key'), ...(array) config('app.previous_keys', [])] as $appKey) {
            if (hash_equals(self::sign($parts[0].'.'.$parts[1], $appKey), $parts[2])) {
                return [$parts[0], $parts[1]];
            }
        }

        return null;
    }

    private static function sign(string $payload, mixed $appKey = null): string
    {
        $key = 'radar-claim|'.($appKey ?? config('app.key'));
        $raw = substr(hash_hmac('sha256', 'radar-claim|'.$payload, $key, true), 0, self::SIGNATURE_BYTES);

        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }
}
