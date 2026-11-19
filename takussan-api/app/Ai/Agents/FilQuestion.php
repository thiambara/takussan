<?php

namespace App\Ai\Agents;

use App\Jobs\Copilote\DemanderAuCopilote;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\JsonSchema\Types\Type;
use Laravel\Ai\Contracts\HasStructuredOutput;

/**
 * TCK-2975 (ADR-0131 § 3) — l'agent de `fil.question` : une réponse et ses sources (messages du fil, objets du
 * fil). Une source hors de l'entrée est retirée avant écriture (`AppuisDuFil`). Strict sur aucun pilote.
 */
final class FilQuestion extends SocleAgent implements HasStructuredOutput
{
    /** Ce que le SDK peut ajouter à un maillon : une nouvelle tentative après au plus 10 s d'attente. */
    public const SDK_RETRY_WAIT_SECONDS = RadarExtraction::SDK_RETRY_WAIT_SECONDS;

    public const MIN_TIMEOUT_SECONDS = RadarExtraction::MIN_TIMEOUT_SECONDS;

    /**
     * Le délai d'UN appel : le budget d'appel du job, moins l'attente de nouvelle tentative de chaque maillon,
     * partagé entre les maillons, jamais sous le plancher ni au-delà du délai du socle.
     */
    public function timeout(): int
    {
        $links = $this->chainLength();
        $share = intdiv(DemanderAuCopilote::AI_CALL_BUDGET_SECONDS - self::SDK_RETRY_WAIT_SECONDS * $links, $links);

        return max(self::MIN_TIMEOUT_SECONDS, min(parent::timeout(), $share));
    }

    protected function strictDrivers(): array
    {
        return [];
    }

    /** @return array<string, Type> */
    public function schema(JsonSchema $schema): array
    {
        return [
            'reponse' => $schema->string()->description('La réponse à la question, en français, au vouvoiement.')->required(),
            'sources' => $schema->array()
                ->items($schema->object([
                    'type' => $schema->string()->enum(['message', 'objet'])->required(),
                    'id' => $schema->integer()->description('L\'identifiant du message, ou celui de l\'objet.')->required(),
                    'objet_type' => $schema->string()->description('Pour un objet : son type (lease, payment…), sinon vide.')->required(),
                ]))
                ->description('Les messages et objets du fil qui fondent la réponse ; vide si aucun.')
                ->required(),
        ];
    }
}
