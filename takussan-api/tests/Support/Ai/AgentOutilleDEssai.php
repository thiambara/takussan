<?php

namespace Tests\Support\Ai;

use App\Ai\Agents\SocleAgent;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\HasStructuredOutput;
use Laravel\Ai\Contracts\HasTools;

/** Un agent structuré QUI PORTE des outils : ce qu'un usage de contenu externe n'a pas le droit d'avoir. */
final class AgentOutilleDEssai extends SocleAgent implements HasStructuredOutput, HasTools
{
    public function schema(JsonSchema $schema): array
    {
        return ['titre' => $schema->string()->required()];
    }

    public function tools(): iterable
    {
        return [];
    }
}
