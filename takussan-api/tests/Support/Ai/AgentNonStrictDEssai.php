<?php

namespace Tests\Support\Ai;

use App\Ai\Agents\SocleAgent;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\HasStructuredOutput;

/** Un agent structuré non strict, sur tous les pilotes : le pendant d'`AgentDEssai`, même schéma. */
final class AgentNonStrictDEssai extends SocleAgent implements HasStructuredOutput
{
    protected function strictDrivers(): array
    {
        return [];
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'titre' => $schema->string()->required(),
            'prix' => $schema->integer()->required(),
        ];
    }
}
