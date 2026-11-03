<?php

namespace Tests\Support\Ai;

use App\Ai\Agents\SocleAgent;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\HasStructuredOutput;

/** L'agent du socle d'essai : une extraction structurée, toujours servie par `AgentDEssai::fake()`. */
final class AgentDEssai extends SocleAgent implements HasStructuredOutput
{
    public function schema(JsonSchema $schema): array
    {
        return [
            'titre' => $schema->string()->required(),
            'prix' => $schema->integer()->required(),
        ];
    }
}
