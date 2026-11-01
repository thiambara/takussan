<?php

namespace Tests\Support\Ai;

use App\Ai\Agents\SocleAgent;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\HasSkills;
use Laravel\Ai\Contracts\HasStructuredOutput;

/** Un agent structuré à compétences : le SDK leur ajoute un outil (`LoadSkill::mergeInto`). */
final class AgentCompetencesDEssai extends SocleAgent implements HasSkills, HasStructuredOutput
{
    public function schema(JsonSchema $schema): array
    {
        return ['titre' => $schema->string()->required()];
    }

    public function skills(): iterable
    {
        return [];
    }
}
