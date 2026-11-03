<?php

namespace App\Services\Ai;

use Laravel\Ai\Contracts\HasSkills;
use Laravel\Ai\Contracts\HasStructuredOutput;
use Laravel\Ai\Contracts\HasTools;

/**
 * TCK-2398 (ADR-0076 §10) — un usage qui lit un contenu externe n'a aucun outil et ne rend qu'une
 * sortie structurée. `HasSkills` compte comme un outil : le SDK lui en ajoute un
 * (`LoadSkill::mergeInto`, relu dans `laravel/ai` 1.3). Tenu par
 * `tests/Unit/Ai/ExternalContentUsagesHaveNoToolsTest.php` sur le catalogue réel.
 */
final class ExternalContentPolicy
{
    /**
     * @param  iterable<AiUsage>  $usages
     * @return list<string>
     */
    public static function violations(iterable $usages): array
    {
        $violations = [];
        foreach ($usages as $usage) {
            if (! $usage->readsExternalContent()) {
                continue;
            }
            $agent = $usage->agentClass();
            if (is_a($agent, HasTools::class, true) || is_a($agent, HasSkills::class, true)) {
                $violations[] = "{$usage->key()} lit un contenu externe et son agent {$agent} porte des outils";
            }
            if (! is_a($agent, HasStructuredOutput::class, true)) {
                $violations[] = "{$usage->key()} lit un contenu externe et son agent {$agent} ne rend pas de sortie structurée";
            }
        }

        return $violations;
    }
}
