<?php

namespace App\Services\Ai;

/**
 * TCK-2385 (ADR-0076 §3), TCK-2450 (ADR-0085 §3, §4) — ce que la console peut savoir d'un fournisseur : son nom
 * légal, si une clé est présente (un booléen, jamais la valeur), s'il est sélectionnable et pourquoi il ne l'est
 * pas, l'hôte de son adresse (jamais l'adresse entière) et ses modèles actifs au catalogue, les seuls affectables.
 */
final class AiProviderCatalogue
{
    public const REASON_KEY_MISSING = 'key_missing';

    public const REASON_HOST_NOT_ALLOWED = 'host_not_allowed';

    public function __construct(private readonly AiModelCatalogue $models) {}

    /**
     * Les entrées de `config/ai.php`, sans le double que la passerelle ajoute à l'exécution
     * ({@see AiGateway::providerFor()}) et qui reste dans la configuration jusqu'à la fin du processus.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function declared(): array
    {
        return array_filter(
            config('ai.providers'),
            fn (string $key): bool => ! str_ends_with($key, AiGateway::TOOL_OUTPUT_SUFFIX),
            ARRAY_FILTER_USE_KEY,
        );
    }

    /** @return list<array{key: string, legal_name: string, key_present: bool, selectable: bool, reason: string|null, host: string|null, models: list<string>}> */
    public function describe(): array
    {
        $providers = [];
        foreach (self::declared() as $key => $provider) {
            $reason = $this->unselectableReason($key);
            $providers[] = [
                'key' => $key,
                'legal_name' => (string) ($provider['legal_name'] ?? $key),
                'key_present' => filled($provider['key'] ?? null),
                'selectable' => $reason === null,
                'reason' => $reason,
                'host' => $this->hostOf($key),
                'models' => $this->models->assignableModels($key),
            ];
        }

        return $providers;
    }

    public function has(string $provider): bool
    {
        return array_key_exists($provider, self::declared());
    }

    public function keyPresent(string $provider): bool
    {
        return filled(self::declared()[$provider]['key'] ?? null);
    }

    /** Déclaré, avec une clé et une adresse acceptée (ADR-0085 §4). `privacy.ts` est tenu par la garde, en CI. */
    public function selectable(string $provider): bool
    {
        return $this->has($provider) && $this->unselectableReason($provider) === null;
    }

    /** @return list<string> */
    public function selectableKeys(): array
    {
        return array_values(array_filter(array_keys(self::declared()), $this->selectable(...)));
    }

    /** Pourquoi un fournisseur déclaré n'est pas sélectionnable. La clé d'abord : sans elle, rien ne part de toute façon. */
    public function unselectableReason(string $provider): ?string
    {
        if (! $this->keyPresent($provider)) {
            return self::REASON_KEY_MISSING;
        }

        return $this->addressAccepted($provider) ? null : self::REASON_HOST_NOT_ALLOWED;
    }

    /** Le code `ai.*` de ce qui empêche de joindre ce fournisseur, ou `null`. */
    public function refusalCode(string $provider): ?string
    {
        if (! $this->has($provider)) {
            return 'ai.provider_unknown';
        }

        return match ($this->unselectableReason($provider)) {
            self::REASON_KEY_MISSING => 'ai.provider_key_missing',
            self::REASON_HOST_NOT_ALLOWED => 'ai.provider_host_not_allowed',
            default => null,
        };
    }

    /** Clé posée, adresse refusée : ce que la sonde de santé signale, sans nommer ni le fournisseur ni son adresse. */
    public function anyKeyedWithRefusedAddress(): bool
    {
        foreach (array_keys(self::declared()) as $key) {
            if ($this->unselectableReason($key) === self::REASON_HOST_NOT_ALLOWED) {
                return true;
            }
        }

        return false;
    }

    public function cheapestModel(string $provider): ?string
    {
        return $this->models->cheapestModel($provider);
    }

    /** L'hôte de l'adresse, le seul détail qui en sorte, avec son port s'il n'est pas celui du schéma. Une adresse illisible n'en a pas. */
    public function hostOf(string $provider): ?string
    {
        $parts = $this->addressParts($provider);
        if (! isset($parts['host'])) {
            return null;
        }
        $host = strtolower($parts['host']);
        $port = $parts['port'] ?? null;
        $default = ['https' => 443, 'http' => 80][strtolower((string) ($parts['scheme'] ?? ''))] ?? null;

        return $port === null || $port === $default ? $host : "{$host}:{$port}";
    }

    /**
     * Comparaison exacte, sans joker, port compris : un port qui n'est pas celui du schéma s'écrit dans `allowed_hosts`
     * (`hote:8443`). `https` seul hors `local` et `testing`. Une adresse à identifiants est refusée : `parse_url` et le
     * client HTTP pourraient ne pas y lire le même hôte (une barre inverse devant `@`).
     */
    private function addressAccepted(string $provider): bool
    {
        $parts = $this->addressParts($provider);
        if ($parts === null || ! isset($parts['host'], $parts['scheme']) || isset($parts['user']) || isset($parts['pass'])) {
            return false;
        }
        $schemes = app()->environment(['local', 'testing']) ? ['https', 'http'] : ['https'];
        if (! in_array(strtolower($parts['scheme']), $schemes, true)) {
            return false;
        }
        $allowed = array_map(strtolower(...), (array) (self::declared()[$provider]['allowed_hosts'] ?? []));

        return in_array($this->hostOf($provider), $allowed, true);
    }

    /** @return array<string, int|string>|null */
    private function addressParts(string $provider): ?array
    {
        $url = self::declared()[$provider]['url'] ?? null;
        if (! is_string($url)) {
            return null;
        }
        $parts = parse_url($url);

        return is_array($parts) ? $parts : null;
    }
}
