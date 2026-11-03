<?php

namespace App\Ai\Agents;

use App\Services\Ai\ExternalContent;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\JsonSchema\Types\Type;
use Laravel\Ai\Contracts\HasStructuredOutput;

/**
 * TCK-2388 (ADR-0077 §4, ADR-0076 §10) — l'agent de `radar.message_accord` : il écrit les DEUX seules parties
 * variables du message d'accord, la salutation et le résumé des annonces. Les clauses sont un texte du dépôt, ajouté
 * par le code (`ConsentMessageComposer`) : ni outil, ni compétence, une sortie structurée à deux clés, rien d'autre.
 *
 * Le nom de l'annonceur et les titres des annonces viennent d'une annonce collectée : contenu externe, ils arrivent
 * dans un bloc délimité par `ExternalContent::wrap()` (ADR-0076 §10).
 */
final class RadarConsentMessage extends SocleAgent implements HasStructuredOutput
{
    /**
     * La préparation d'un message se fait DANS une requête web (60 s, `docker/php.ini`) : tous les maillons de la
     * chaîne jouée doivent y tenir, avec la marge de la réponse.
     */
    public const REQUEST_BUDGET_SECONDS = 40;

    /** Ce que le SDK peut ajouter à un maillon : une nouvelle tentative après au plus 10 s d'attente. */
    public const SDK_RETRY_WAIT_SECONDS = RadarExtraction::SDK_RETRY_WAIT_SECONDS;

    public const MIN_TIMEOUT_SECONDS = RadarExtraction::MIN_TIMEOUT_SECONDS;

    /**
     * Le délai d'UN appel : (budget − attente de nouvelle tentative × maillons) ÷ maillons, comme
     * {@see RadarExtraction::timeout()}, jamais sous le plancher ni au-delà du délai du socle.
     */
    public function timeout(): int
    {
        $links = $this->chainLength();
        $share = intdiv(self::REQUEST_BUDGET_SECONDS - self::SDK_RETRY_WAIT_SECONDS * $links, $links);

        return max(self::MIN_TIMEOUT_SECONDS, min(parent::timeout(), $share));
    }

    /**
     * Ce que le modèle reçoit : l'en-tête (langue, rang de la relance) puis le nom et les faits des annonces,
     * en JSON, dans le bloc du contenu externe.
     *
     * @param  list<array<string, mixed>>  $facts
     */
    public static function input(?string $displayName, string $locale, array $facts, int $followUpRank): string
    {
        $data = json_encode(
            ['nom' => $displayName, 'annonces' => $facts],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
        );

        return "Langue : {$locale}. Relance : {$followUpRank}.\n".ExternalContent::wrap('radar', $data);
    }

    /** @return array<string, Type> */
    public function schema(JsonSchema $schema): array
    {
        return [
            'salutation' => $schema->string()
                ->description('La salutation d\'une ligne, vouvoiement, qui précède le message (« Bonjour Awa, »).')
                ->required(),
            'resume' => $schema->string()
                ->description('Le résumé d\'une ligne des annonces, qui complète « Nous avons vu … et nous aimerions les publier ».')
                ->required(),
        ];
    }
}
