<?php

namespace App\Ai\Agents;

use App\Jobs\Copilote\DemanderAuCopilote;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\JsonSchema\Types\Type;
use Laravel\Ai\Contracts\HasStructuredOutput;

/**
 * TCK-2974 (ADR-0131 § 3, ADR-0076 §10) — l'agent de `fil.resume` : des points, chacun avec le message qu'il
 * résume, et si le point attend le lecteur. Ni outil ni compétence ; le fil lui arrive dans un bloc
 * `ExternalContent::wrap()`. Un `message_id` hors de l'entrée est retiré par le job avant écriture.
 *
 * Strict sur AUCUN pilote : aucun vrai appel n'a attesté sa grammaire (`SocleAgent::strictDrivers()`). Le job
 * valide donc toute la sortie.
 */
final class FilResume extends SocleAgent implements HasStructuredOutput
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
            'points' => $schema->array()
                ->items($schema->object([
                    'texte' => $schema->string()->description('Une phrase, en français.')->required(),
                    'message_id' => $schema->integer()->description('L\'identifiant du message de la fenêtre que le point résume.')->required(),
                    'attend_le_lecteur' => $schema->boolean()->description('Vrai si le point attend une réponse ou un geste de l\'agence.')->required(),
                ]))
                ->description('De un à six points ; la question qui attend le lecteur en tête.')
                ->required(),
        ];
    }
}
