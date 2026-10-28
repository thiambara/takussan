<?php

namespace App\Ai\Agents;

use App\Jobs\Radar\VerifyRadarConsentReply;
use App\Models\Enums\RadarConfidence;
use App\Services\Ai\ExternalContent;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\JsonSchema\Types\Type;
use Laravel\Ai\Contracts\HasStructuredOutput;

/**
 * TCK-2388 (ADR-0077 §3, ADR-0076 §10) — l'agent de `radar.verification_accord` : il lit les captures d'une
 * conversation WhatsApp, la transcrit, dit si le numéro et le nom affichés sont ceux attendus, quelles clauses du
 * message envoyé y sont lisibles, et classe la dernière réponse de l'annonceur. Ni outil ni compétence : une sortie
 * structurée, rien d'autre. **Son verdict n'ouvre rien** : seule la confirmation d'un humain rend un accord valide.
 *
 * Les captures sont le contenu externe (ADR-0076 §10) : des images jointes, `input()` n'écrit que le bloc délimité
 * (vide) qui les désigne.
 */
final class RadarConsentVerification extends SocleAgent implements HasStructuredOutput
{
    public const CLASSIFICATIONS = ['consent', 'refusal', 'stop', 'question', 'ambiguous'];

    /**
     * Le délai d'UN appel, partagé entre les maillons de la chaîne jouée comme {@see RadarExtraction::timeout()} : tous
     * tiennent dans {@see VerifyRadarConsentReply::AI_CALL_BUDGET_SECONDS}, sous le `$timeout` du job.
     */
    public function timeout(): int
    {
        $links = $this->chainLength();
        $share = intdiv(VerifyRadarConsentReply::AI_CALL_BUDGET_SECONDS - RadarExtraction::SDK_RETRY_WAIT_SECONDS * $links, $links);

        return max(RadarExtraction::MIN_TIMEOUT_SECONDS, min(parent::timeout(), $share));
    }

    /** Ce que le job envoie : le texte exact envoyé, le numéro et le nom attendus ; les captures sont jointes. */
    public static function input(string $sentMessage, string $expectedPhone, ?string $expectedName, int $clauseCount): string
    {
        $name = $expectedName === null || trim($expectedName) === '' ? 'inconnu' : trim($expectedName);

        return "Message envoyé par Takussan (texte exact) :\n<<<\n{$sentMessage}\n>>>\n"
            ."Numéro attendu : {$expectedPhone}\n"
            ."Nom attendu : {$name}\n"
            ."Clauses numérotées : 1 à {$clauseCount}\n"
            .ExternalContent::wrap('capture', '');
    }

    /** @return array<string, Type> */
    public function schema(JsonSchema $schema): array
    {
        return [
            'transcript' => $schema->string()
                ->description('L\'échange lu sur les captures, dans l\'ordre, un message par ligne, préfixé « Takussan : » ou « Annonceur : ».')
                ->required(),
            'reply_text' => $schema->string()->nullable()
                ->description('La réponse de l\'annonceur, recopiée mot pour mot ; null si aucune.')
                ->required(),
            'counterpart_phone' => $schema->string()->nullable()
                ->description('Le numéro de l\'interlocuteur tel qu\'affiché ; null s\'il n\'apparaît pas.')
                ->required(),
            'counterpart_name' => $schema->string()->nullable()->required(),
            'number_matches' => $schema->boolean()->nullable()->required(),
            'name_matches' => $schema->boolean()->nullable()->required(),
            'clauses_found' => $schema->array()->items($schema->integer())
                ->description('Les numéros des clauses du message envoyé lisibles sur les captures.')
                ->required(),
            'classification' => $schema->string()->enum(self::CLASSIFICATIONS)->required(),
            'confidence' => $schema->string()->enum(RadarConfidence::class)->required(),
        ];
    }
}
