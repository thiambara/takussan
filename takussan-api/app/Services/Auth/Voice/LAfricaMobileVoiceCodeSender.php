<?php

namespace App\Services\Auth\Voice;

use App\Services\Auth\PhoneVerificationService;
use App\Services\Notifications\Sms\PhoneNumber;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Log;

/**
 * TCK-2940 (ADR-0126 § 1) — LAfricaMobile, API TTS « Push A TTS Call » (developers.lafricamobile.com/docs/tts) :
 *
 *  - `POST {base}/login`, formulaire `username` / `password` → `access_token` ;
 *  - `POST {base}/push_tts`, `Authorization: Bearer …`, JSON `text`, `to_lang`, `login`, `password`, `contacts_list`.
 *
 * Non publiés par la documentation, donc configurés et non devinés : l'URL de base (`VOICE_LAM_BASE_URL`), les valeurs
 * de `to_lang` (`VOICE_LAM_LANG`, `fr` par défaut), la durée du jeton (gardé {@see self::TOKEN_TTL_SECONDS} s, refait
 * une fois sur un 401). Un appel est réputé parti sur un 2xx. Une clé absente : {@see available()} est faux, la voie
 * n'est pas proposée — jamais une erreur 500.
 */
class LAfricaMobileVoiceCodeSender implements VoiceCodeSender
{
    public const TOKEN_TTL_SECONDS = 600;

    private const TOKEN_CACHE_KEY = 'voice-lam-access-token';

    private const TIMEOUT_SECONDS = 10;

    public function __construct(
        private readonly HttpFactory $http,
        private readonly CacheRepository $cache,
    ) {}

    public function available(): bool
    {
        return $this->baseUrl() !== '' && $this->login() !== '' && $this->password() !== '';
    }

    public function call(string $phone, string $code, ?string $locale): bool
    {
        if (! $this->available()) {
            return false;
        }

        try {
            $response = $this->push($phone, $code, $locale, $this->token());
            if ($response?->status() === 401) {
                $this->cache->forget(self::TOKEN_CACHE_KEY);
                $response = $this->push($phone, $code, $locale, $this->token());
            }
        } catch (\Throwable $e) {
            Log::warning('[voice.lam] exception HTTP', ['error' => $e->getMessage(), 'phone_suffix' => substr($phone, -4)]);

            return false;
        }

        if ($response === null || ! $response->successful()) {
            // Jamais le code dans le journal : seulement le constat.
            Log::warning('[voice.lam] appel refusé', ['status' => $response?->status(), 'phone_suffix' => substr($phone, -4)]);

            return false;
        }

        return true;
    }

    /** Le texte dicté : le code chiffre par chiffre, dit deux fois, et sa durée. Rien d'autre (ADR-0126 § 5). */
    public static function text(string $code, ?string $locale): string
    {
        return __('auth.phone.voice_code', [
            'digits' => implode(', ', str_split($code)),
            'minutes' => (int) (PhoneVerificationService::CODE_TTL_SECONDS / 60),
        ], self::locale($locale));
    }

    /** `en` se dit en anglais ; tout le reste en français (le wolof est en pause, et la synthèse wolof n'est pas vérifiée). */
    private static function locale(?string $locale): string
    {
        return $locale === 'en' ? 'en' : 'fr';
    }

    private function push(string $phone, string $code, ?string $locale, ?string $token): ?Response
    {
        if ($token === null) {
            return null;
        }

        return $this->http->timeout(self::TIMEOUT_SECONDS)->acceptJson()->withToken($token)
            ->post($this->baseUrl().'/push_tts', [
                'text' => self::text($code, $locale),
                'to_lang' => self::locale($locale) === 'en' ? 'en' : $this->lang(),
                'login' => $this->login(),
                'password' => $this->password(),
                'contacts_list' => [ltrim(PhoneNumber::normalize($phone), '+')],
            ]);
    }

    private function token(): ?string
    {
        $cached = $this->cache->get(self::TOKEN_CACHE_KEY);
        if (is_string($cached) && $cached !== '') {
            return $cached;
        }

        $response = $this->http->timeout(self::TIMEOUT_SECONDS)->acceptJson()->asForm()
            ->post($this->baseUrl().'/login', ['username' => $this->login(), 'password' => $this->password()]);
        $token = $response->successful() ? (string) ($response->json('access_token') ?? '') : '';
        if ($token === '') {
            Log::warning('[voice.lam] authentification refusée', ['status' => $response->status()]);

            return null;
        }
        $this->cache->put(self::TOKEN_CACHE_KEY, $token, self::TOKEN_TTL_SECONDS);

        return $token;
    }

    private function baseUrl(): string
    {
        return rtrim((string) config('services.lafricamobile_voice.base_url'), '/');
    }

    private function login(): string
    {
        return (string) config('services.lafricamobile_voice.login');
    }

    private function password(): string
    {
        return (string) config('services.lafricamobile_voice.password');
    }

    private function lang(): string
    {
        return (string) config('services.lafricamobile_voice.lang') ?: 'fr';
    }
}
