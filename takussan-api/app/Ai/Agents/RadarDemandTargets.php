<?php

namespace App\Ai\Agents;

use App\Jobs\Radar\RefreshRadarDemandTargets;
use App\Models\Enums\PropertyType;
use App\Services\Radar\Targets\RadarDemandCurator;
use App\Services\Radar\Targets\RadarTargetCriteria;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\JsonSchema\Types\Type;
use Laravel\Ai\Contracts\HasStructuredOutput;

/**
 * TCK-2470 (ADR-0087 §6) — l'agent de `radar.cibles` : il lit la demande sans résultat (des critères structurés et des
 * comptes, jamais un texte saisi par un visiteur ni un identifiant de compte) et les cibles existantes, et propose un écart :
 * créer, modifier, fusionner, retirer des cibles `demand`. Ni outil ni compétence : une sortie structurée, rien d'autre.
 *
 * **Le modèle propose, le code valide** ({@see RadarDemandCurator}) : chaque opération passe `RadarTargetCriteria`, le
 * plafond, le doublon, et n'atteint jamais une cible de l'opérateur ni une cible épinglée.
 */
final class RadarDemandTargets extends SocleAgent implements HasStructuredOutput
{
    public const OPERATIONS = ['create', 'update', 'merge', 'retire'];

    /** Les critères que le modèle peut proposer : ceux que la demande porte (ni sites, ni fraîcheur). */
    public const CRITERIA_KEYS = [
        'cities', 'neighborhoods', 'types', 'contract', 'price_min', 'price_max', 'bedrooms_min', 'bedrooms_max', 'furnished',
    ];

    /**
     * Le délai d'UN appel, partagé entre les maillons de la chaîne jouée comme {@see RadarExtraction::timeout()} : tous
     * tiennent dans {@see RefreshRadarDemandTargets::AI_CALL_BUDGET_SECONDS}, sous le `$timeout` du job.
     */
    public function timeout(): int
    {
        $links = $this->chainLength();
        $share = intdiv(RefreshRadarDemandTargets::AI_CALL_BUDGET_SECONDS - RadarExtraction::SDK_RETRY_WAIT_SECONDS * $links, $links);

        return max(RadarExtraction::MIN_TIMEOUT_SECONDS, min(parent::timeout(), $share));
    }

    /**
     * Strict sur aucun pilote : un vrai appel n'a attesté la compilation de ce schéma nulle part, et il dépasse le plus gros
     * schéma strict attesté (`StrictSchemasStayWithinTheAttestedSizeTest`). Le code relit chaque opération.
     */
    protected function strictDrivers(): array
    {
        return [];
    }

    /** @return array<string, Type> */
    public function schema(JsonSchema $schema): array
    {
        return [
            'operations' => $schema->array()->items($schema->object([
                'op' => $schema->string()->enum(self::OPERATIONS)->required(),
                'target_id' => $schema->integer()->nullable()
                    ->description('La cible visée (update, retire ; merge : celle qui reste) ; null pour create.')
                    ->required(),
                'merge_ids' => $schema->array()->items($schema->integer())
                    ->description('merge : les cibles fusionnées, au moins deux, celle qui reste comprise ; liste vide sinon.')
                    ->required(),
                'name' => $schema->string()
                    ->description('Le nom court de la cible créée ou résultante, en français ; chaîne vide pour retire.')
                    ->required(),
                'criteria' => $this->criteria($schema),
                'reason' => $schema->string()->description('Pourquoi, en une phrase, en français.')->required(),
                'signal_refs' => $schema->array()->items($schema->string())
                    ->description('Les références (« ref ») des signaux que l\'opération couvre.')
                    ->required(),
            ]))->description('L\'écart proposé ; liste vide si les cibles couvrent déjà la demande.')->required(),
        ];
    }

    /** Les critères d'une cible, dans la forme de {@see RadarTargetCriteria}, restreints à {@see self::CRITERIA_KEYS}. */
    private function criteria(JsonSchema $schema): Type
    {
        return $schema->object([
            'cities' => $schema->array()->items($schema->string())->required(),
            'neighborhoods' => $schema->array()->items($schema->object([
                'name' => $schema->string()->required(),
                'city' => $schema->string()->nullable()->required(),
            ]))->required(),
            'types' => $schema->array()->items($schema->string()->enum(PropertyType::class))->required(),
            'contract' => $schema->string()->enum(RadarTargetCriteria::CONTRACTS)->nullable()->required(),
            'price_min' => $schema->integer()->nullable()->required(),
            'price_max' => $schema->integer()->nullable()->required(),
            'bedrooms_min' => $schema->integer()->nullable()->required(),
            'bedrooms_max' => $schema->integer()->nullable()->required(),
            'furnished' => $schema->boolean()->nullable()->required(),
        ])->description('Les critères de la cible créée ou résultante ; pour retire, toutes listes vides et toutes valeurs null.')->required();
    }
}
