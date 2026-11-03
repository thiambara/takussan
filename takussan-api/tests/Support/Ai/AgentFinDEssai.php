<?php

namespace Tests\Support\Ai;

use App\Ai\Agents\SocleAgent;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\HasStructuredOutput;
use Laravel\Ai\Responses\AgentResponse;
use Laravel\Ai\Responses\Data\FinishReason;
use Laravel\Ai\Responses\Data\Meta;
use Laravel\Ai\Responses\Data\Step;
use Laravel\Ai\Responses\Data\TextUsage;
use Laravel\Ai\Responses\StructuredAgentResponse;

/**
 * Un agent dont la réponse se termine par la raison qu'on lui donne, par modèle. Le faux du SDK
 * (`FakeTextGateway`) rend toujours `Stop` : une réponse tronquée ou filtrée ne s'éprouve qu'ainsi.
 * Lié à la place d'`AgentDEssai` dans le conteneur, la passerelle le résout comme le vrai.
 */
final class AgentFinDEssai extends SocleAgent implements HasStructuredOutput
{
    /** @param  array<string, FinishReason>  $fins  modèle → raison de fin ; `Stop` par défaut */
    public function __construct(private readonly array $fins = []) {}

    public function schema(JsonSchema $schema): array
    {
        return ['titre' => $schema->string()->required(), 'prix' => $schema->integer()->required()];
    }

    public function prompt($prompt, array $attachments = [], $provider = null, ?string $model = null, ?int $timeout = null): AgentResponse
    {
        $fin = $this->fins[$model] ?? FinishReason::Stop;
        $meta = new Meta('anthropic', (string) $model);
        $usage = new TextUsage(1000, 200);

        return (new StructuredAgentResponse('essai', ['titre' => 'Villa', 'prix' => 100], '{}', $usage, $meta))
            ->withSteps(collect([new Step('{}', [], [], $fin, $usage, $meta, '', [])]));
    }
}
