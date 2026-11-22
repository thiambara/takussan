<?php

namespace App\Ai\Agents;

use App\Jobs\Copilote\DemanderAuCopilote;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\JsonSchema\Types\Type;
use Laravel\Ai\Contracts\HasStructuredOutput;

/**
 * TCK-2975 (ADR-0131 § 3) — l'agent de `fil.promesses` : les promesses du fil, aux champs de création d'un
 * engagement. Une promesse hors de l'entrée, un porteur non participant, une échéance passée : écartés ou ramenés
 * à nul par le job avant écriture. Strict sur aucun pilote.
 */
final class FilPromesses extends SocleAgent implements HasStructuredOutput
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
            'promesses' => $schema->array()
                ->items($schema->object([
                    'message_id' => $schema->integer()->description('L\'identifiant du message qui porte la promesse.')->required(),
                    'porteur_id' => $schema->integer()->description('L\'identifiant de la personne qui s\'engage (l\'auteur, sauf mention contraire).')->required(),
                    'libelle' => $schema->string()->description('La promesse en quelques mots, en français (« Repasser pour la fuite »).')->required(),
                    'echeance' => $schema->string()->description('L\'échéance en ISO 8601 si le message la fixe, sinon une chaîne vide.')->required(),
                ]))
                ->description('Les promesses du fil ; vide s\'il n\'y en a pas.')
                ->required(),
        ];
    }
}
