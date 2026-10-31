<?php

namespace App\Services\Ai;

/** TCK-2383 — un maillon d'une chaîne : un fournisseur, un modèle, un plafond de tokens. */
final readonly class ModelLink
{
    public function __construct(
        public string $provider,
        public string $model,
        public ?int $maxTokens = null,
    ) {}

    /** @param  array{provider: string, model: string, max_tokens?: int|null}  $link */
    public static function fromArray(array $link): self
    {
        return new self($link['provider'], $link['model'], isset($link['max_tokens']) ? (int) $link['max_tokens'] : null);
    }

    /** `fournisseur/modèle`, la forme de `ai:eval --model=`. */
    public static function parse(string $value): ?self
    {
        [$provider, $model] = array_pad(explode('/', $value, 2), 2, '');

        return $provider !== '' && $model !== '' ? new self($provider, $model) : null;
    }

    /** @return array{provider: string, model: string, max_tokens: int|null} */
    public function toArray(): array
    {
        return ['provider' => $this->provider, 'model' => $this->model, 'max_tokens' => $this->maxTokens];
    }

    /** Seul un modèle actif du catalogue s'affecte : sans tarif, son coût ne se budgéterait pas. */
    public function isPriced(): bool
    {
        return app(AiModelCatalogue::class)->isAssignable($this->provider, $this->model);
    }
}
