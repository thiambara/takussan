<?php

namespace App\Ai\Agents;

use App\Jobs\Radar\ExtractRadarListing;
use App\Models\Enums\PropertyType;
use App\Models\Enums\RadarAdvertiserNature;
use App\Models\Enums\RadarConfidence;
use App\Models\Enums\RentPeriod;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\JsonSchema\Types\Type;
use Laravel\Ai\Contracts\HasStructuredOutput;

/**
 * TCK-2386 (ADR-0077 §5, ADR-0076 §10) — l'agent de `radar.extraction` : il lit une annonce collectée
 * (texte, page nettoyée ou captures) et rend, champ par champ, une valeur, une confiance et le
 * passage cité qui la justifie. Ni outil ni compétence : une sortie structurée, rien d'autre.
 *
 * Le modèle recopie, le code convertit : `price` est le texte tel qu'écrit (« 1M5 »,
 * « 450.000f/mois »), et `ExtractionNormalizer` (même ticket) le lit, force la confiance à `low`
 * sans passage cité et confronte chaque valeur aux bornes. Il itère sur {@see self::PROPERTY_FIELDS}.
 */
final class RadarExtraction extends SocleAgent implements HasStructuredOutput
{
    /** Les champs du bien, chacun rendu en `{value, confidence, evidence}`, dans l'ordre du schéma. */
    public const PROPERTY_FIELDS = [
        'property_type', 'contract', 'rent_period', 'price', 'neighborhood', 'city',
        'bedrooms', 'bathrooms', 'surface_m2', 'furnished', 'amenities', 'title', 'description',
    ];

    /** Les champs de l'annonceur rendus sous la même forme. */
    public const ADVERTISER_FIELDS = ['advertiser_name', 'advertiser_nature'];

    public const CONTRACTS = ['rent', 'sale'];

    /** Ce que le SDK peut ajouter à un maillon : une nouvelle tentative après au plus 10 s d'attente. */
    public const SDK_RETRY_WAIT_SECONDS = 10;

    /** En deçà, un appel n'a plus le temps de rendre une extraction : le plancher l'emporte sur le partage. */
    public const MIN_TIMEOUT_SECONDS = 5;

    /**
     * Le délai d'UN appel, borné pour que tous les maillons de la chaîne JOUÉE (`chainLength()`, posé
     * par la passerelle : `extraction`, `vision` pour des captures, un seul maillon pour un modèle
     * forcé ou une évaluation) tiennent dans `ExtractRadarListing::AI_CALL_BUDGET_SECONDS`, sous le
     * `$timeout` du job. Chaque maillon réserve aussi l'attente de la nouvelle tentative du SDK
     * (`HandlesFailoverErrors` : une seule, après au plus 10 s, sur un 429/5xx à `Retry-After`
     * court) : délai = (budget − 10 × maillons) ÷ maillons. Avec le budget de 75 s : 65 s pour un
     * maillon, 27 s pour deux, 5 s pour cinq (le plus long que la console admet).
     *
     * Sans cette borne, le délai du socle (300 s) laissait le worker tuer le job avant toute bascule :
     * un fournisseur muet lève ici une erreur de connexion, et la passerelle passe au maillon suivant.
     * Jamais au-delà du délai du socle, jamais sous {@see self::MIN_TIMEOUT_SECONDS} — au-delà de cinq
     * maillons (une chaîne écrite à la main dans la configuration), le plancher fait dépasser le
     * budget, et le job dépassé est repris par la file, pas perdu.
     *
     * Reste hors de la borne : une première réponse 429/5xx LENTE (proche du délai) suivie d'une
     * seconde tentative muette coûte jusqu'à deux délais et l'attente. Le job est alors coupé et
     * repris, jamais terminé.
     */
    public function timeout(): int
    {
        $links = $this->chainLength();
        $share = intdiv(ExtractRadarListing::AI_CALL_BUDGET_SECONDS - self::SDK_RETRY_WAIT_SECONDS * $links, $links);

        return max(self::MIN_TIMEOUT_SECONDS, min(parent::timeout(), $share));
    }

    /** @return array<string, Type> */
    public function schema(JsonSchema $schema): array
    {
        $fields = [];
        foreach (self::PROPERTY_FIELDS as $field) {
            $fields[$field] = $this->field($schema, $this->propertyValue($schema, $field));
        }

        return $fields + [
            'phones' => $schema->array()->items($schema->string())
                ->description('Chaque numéro de téléphone de l\'annonce, recopié tel qu\'écrit ; liste vide si aucun.')
                ->required(),
            'advertiser_name' => $this->field($schema, $schema->string()->nullable()),
            // Jamais null : sans indice, `unknown`. Une seule forme de l'inconnu (le normaliseur lit null comme `unknown`).
            'advertiser_nature' => $this->field($schema, $schema->string()->enum(RadarAdvertiserNature::class)),
            'nature_signals' => $schema->array()->items($schema->object([
                'signal' => $schema->string()->required(),
                'evidence' => $schema->string()->required(),
            ]))->description('Les indices de la nature de l\'annonceur, chacun avec son passage cité ; liste vide si aucun.')->required(),
        ];
    }

    private function propertyValue(JsonSchema $schema, string $field): Type
    {
        return (match ($field) {
            'property_type' => $schema->string()->enum(PropertyType::class),
            'contract' => $schema->string()->enum(self::CONTRACTS),
            'rent_period' => $schema->string()->enum(RentPeriod::class),
            'bedrooms', 'bathrooms' => $schema->integer(),
            'surface_m2' => $schema->number(),
            'furnished' => $schema->boolean(),
            'amenities' => $schema->array()->items($schema->string()),
            'price' => $schema->string()->description('Le prix tel qu\'écrit dans l\'annonce, sans conversion.'),
            default => $schema->string(),
        })->nullable();
    }

    private function field(JsonSchema $schema, Type $value): Type
    {
        return $schema->object([
            'value' => $value->required(),
            'confidence' => $schema->string()->enum(RadarConfidence::class)->required(),
            'evidence' => $schema->string()->nullable()
                ->description('Le passage de l\'annonce recopié mot pour mot qui justifie la valeur ; null sinon.')
                ->required(),
        ])->required();
    }
}
