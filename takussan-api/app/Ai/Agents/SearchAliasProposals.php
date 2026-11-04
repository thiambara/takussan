<?php

namespace App\Ai\Agents;

use App\Jobs\Search\RefreshSearchAliases;
use App\Models\Enums\SearchAliasTargetKind;
use App\Services\Search\Aliases\SearchAliasCurator;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\JsonSchema\Types\Type;
use Laravel\Ai\Contracts\HasStructuredOutput;

/**
 * TCK-2476 (ADR-0088 §7) — l'agent de `search.variantes` : il lit des saisies sans résultat (normalisées, anonymes) et les
 * entités connues (lieux, types, termes), et propose des variantes d'écriture : `[{alias, target_kind, target_value,
 * target_city, confidence}]`. Ni outil ni compétence : une sortie structurée, rien d'autre.
 *
 * **Le modèle propose, le code valide** ({@see SearchAliasCurator}) : une variante n'est retenue que si sa cible existe, si
 * elle est écrite dans une saisie reçue, si elle n'est pas déjà comprise, et jamais contre une variante rejetée ou posée
 * par un opérateur.
 */
final class SearchAliasProposals extends SocleAgent implements HasStructuredOutput
{
    /** Le délai d'UN appel, partagé entre les maillons de la chaîne, comme {@see RadarDemandTargets::timeout()}. */
    public function timeout(): int
    {
        $links = $this->chainLength();
        $share = intdiv(RefreshSearchAliases::AI_CALL_BUDGET_SECONDS - RadarExtraction::SDK_RETRY_WAIT_SECONDS * $links, $links);

        return max(RadarExtraction::MIN_TIMEOUT_SECONDS, min(parent::timeout(), $share));
    }

    /** Strict sur aucun pilote : aucun vrai appel n'a attesté ce schéma ; le code relit chaque proposition. */
    protected function strictDrivers(): array
    {
        return [];
    }

    /** @return array<string, Type> */
    public function schema(JsonSchema $schema): array
    {
        return [
            'aliases' => $schema->array()->items($schema->object([
                'alias' => $schema->string()
                    ->description('L\'écriture telle qu\'elle apparaît dans une saisie reçue (un ou quelques mots).')
                    ->required(),
                'target_kind' => $schema->string()->enum(array_column(SearchAliasTargetKind::cases(), 'value'))->required(),
                'target_value' => $schema->string()
                    ->description('Ce que l\'écriture désigne, recopié des entités connues : nom du lieu, valeur du type, ou terme.')
                    ->required(),
                'target_city' => $schema->string()->nullable()
                    ->description('neighborhood : la ville du quartier, recopiée des entités connues ; null sinon.')
                    ->required(),
                'confidence' => $schema->number()->description('Entre 0 et 1.')->required(),
            ]))->description('Les variantes proposées ; liste vide si aucune saisie n\'en porte.')->required(),
        ];
    }
}
