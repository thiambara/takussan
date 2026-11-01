<?php

namespace App\Services\Ai;

use RuntimeException;

/**
 * TCK-2384 (ADR-0076 §6) — les prompts sont du code : `resources/ai/prompts/<usage>/v<N>.md`, relus
 * en PR, jamais réécrits (`PromptVersionsAreFrozenTest`). La version jouée s'inscrit dans `ai_calls`.
 */
final class PromptRepository
{
    /** @var list<string> */
    private readonly array $roots;

    /** @param  list<string>|null  $roots  racines lues dans l'ordre ; les tests en ajoutent une */
    public function __construct(?array $roots = null)
    {
        $this->roots = $roots ?? [resource_path('ai/prompts')];
    }

    public function load(string $usageKey, int $version): string
    {
        foreach ($this->roots as $root) {
            $path = $root.'/'.$usageKey.'/v'.$version.'.md';
            if (is_file($path)) {
                return trim((string) file_get_contents($path));
            }
        }

        throw new RuntimeException('ai.prompt_missing');
    }
}
