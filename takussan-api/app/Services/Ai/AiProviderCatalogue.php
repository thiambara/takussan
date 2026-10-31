<?php

namespace App\Services\Ai;

/**
 * TCK-2385 (ADR-0076 §3) — ce que la console peut savoir d'un fournisseur : son nom légal, si une clé
 * est présente (un booléen, jamais la valeur) et ses modèles actifs au catalogue, les seuls affectables.
 */
final class AiProviderCatalogue
{
    public function __construct(private readonly AiModelCatalogue $models) {}

    /** @return list<array{key: string, legal_name: string, key_present: bool, models: list<string>}> */
    public function describe(): array
    {
        $providers = [];
        foreach (config('ai.providers') as $key => $provider) {
            $providers[] = [
                'key' => $key,
                'legal_name' => (string) ($provider['legal_name'] ?? $key),
                'key_present' => filled($provider['key'] ?? null),
                'models' => $this->models->assignableModels($key),
            ];
        }

        return $providers;
    }

    public function has(string $provider): bool
    {
        return array_key_exists($provider, config('ai.providers'));
    }

    public function keyPresent(string $provider): bool
    {
        return filled(config('ai.providers')[$provider]['key'] ?? null);
    }

    /** TCK-2423 — un fournisseur d'embeddings ne joue pas un rôle de texte, et l'inverse non plus. */
    public function servesEmbeddings(string $provider): bool
    {
        return (config('ai.providers')[$provider]['serves'] ?? null) === 'embeddings';
    }

    /** Sans requête : aucune clé d'embeddings, et l'appariement du Radar ne change pas d'une ligne. */
    public function anyEmbeddingKeyPresent(): bool
    {
        foreach (array_keys(config('ai.providers')) as $provider) {
            if ($this->servesEmbeddings($provider) && $this->keyPresent($provider)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Une clé ; le refus de l'entraînement déclaré, pour un fournisseur qui le demande ; une adresse https sur un hôte que la
     * configuration accepte, quand elle en déclare (ADR-0085 §4). Sinon, rien ne lui est envoyé.
     */
    public function reachable(string $provider): bool
    {
        $config = config('ai.providers')[$provider] ?? [];
        if (! $this->keyPresent($provider) || ($config['training_opt_out'] ?? true) !== true) {
            return false;
        }
        if (! isset($config['allowed_hosts'])) {
            return true;
        }
        $url = (string) ($config['url'] ?? '');

        return parse_url($url, PHP_URL_SCHEME) === 'https' && in_array(parse_url($url, PHP_URL_HOST), $config['allowed_hosts'], true);
    }

    public function cheapestModel(string $provider): ?string
    {
        return $this->models->cheapestModel($provider);
    }
}
