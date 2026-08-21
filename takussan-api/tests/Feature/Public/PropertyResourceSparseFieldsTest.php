<?php

namespace Tests\Feature\Public;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\Currency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-336 — `PropertyResource` sous SPARSE FIELDSET : une colonne que le
 * `SELECT` n'a jamais lue ne doit pas ressortir en valeur mesurée.
 *
 * ## Le défaut, mesuré le 2026-08-21
 *
 * `/api/properties` passe par `Property::buildQuery()`, donc par
 * `fields[properties]=…` de spatie, qui restreint réellement le `SELECT` —
 * sonde tinker sur `fields[properties]=id,title` :
 * `COLONNES CHARGEES: id,title`. La ressource, elle, accédait à ses trente
 * colonnes en direct. Eloquent rend `null` pour une colonne absente, et les
 * casts de `toArray()` transformaient ce `null` en affirmation :
 *
 * ```
 * price => 0        furnished => false      views_count => 0
 * featured => false favorites_count => 0
 * ```
 *
 * Un bien à 0 F CFA, non meublé, non mis en avant, jamais consulté et jamais
 * mis en favori — cinq faits sur des colonnes dont la requête n'a rien lu.
 * Les vingt-cinq autres sortaient à `null`, ce qui est le même mensonge en
 * plus discret : « ce bien n'a pas de statut » plutôt que « je ne l'ai pas
 * lu ».
 *
 * ## Ce que ces tests épinglent, et pourquoi chacun est un critère
 *
 * Le correctif est `whenHas()`, qui teste
 * `array_key_exists(…, getAttributes())` et **omet la clé** au lieu d'en
 * fabriquer la valeur — même règle que `UserResource::has_usable_password`
 * (TCK-272) et que `PaymentGatewayService::paymentAmount()` (ardoise D-51).
 *
 * La question posée à chaque test est « une régression silencieuse le
 * cocherait-elle aussi ? ». Trois réponses la ferment :
 *
 * - un filtre naïf par `fields[]` au niveau ressource (la voie que TCK-336
 *   prescrivait) cocherait le premier test — mais il fait rougir
 *   {@see self::test_les_cles_derivees_survivent_au_sparse_fieldset} et
 *   {@see self::test_les_relations_incluses_survivent_au_sparse_fieldset},
 *   parce que `location`, les `*_label`, `main_photo_url` et `owner` ne
 *   peuvent PAS figurer dans `fields[properties]` (spatie rend 400
 *   `InvalidFieldQuery`) ;
 * - un `whenNotNull()` — ou n'importe quel garde bâti sur `isset()` — cocherait
 *   lui aussi le premier test, et fait rougir
 *   {@see self::test_une_colonne_selectionnee_mais_nulle_reste_emise}, qui
 *   sépare « pas lue » de « lue et nulle » ;
 * - une omission GÉNÉRALISÉE (whenHas partout, y compris hors sparse fieldset)
 *   coche tout ce qui précède et fait rougir
 *   {@see self::test_sans_sparse_fieldset_la_reponse_reste_complete}.
 *
 * *Une clé absente se remarque ; une clé fausse se croit.*
 */
class PropertyResourceSparseFieldsTest extends ApiTestCase
{
    use RefreshDatabase;

    /**
     * Les cinq colonnes que les casts fabriquaient, plus trois qui sortaient à
     * `null`. Aucune ne doit être présente quand le `SELECT` ne l'a pas lue.
     *
     * @var array<int,string>
     */
    private const COLONNES_NON_DEMANDEES = [
        'price', 'furnished', 'featured', 'views_count', 'favorites_count',
        'status', 'currency', 'bathrooms',
    ];

    /**
     * LE test du défaut. `fields[properties]=id,title` : les huit autres clés
     * adossées à une colonne doivent être ABSENTES — pas à zéro, pas à `false`,
     * pas à `null`.
     */
    public function test_une_colonne_non_selectionnee_est_absente_et_non_fabriquee(): void
    {
        $bien = $this->bienDeLAgent(['price' => 42_500_000.50, 'furnished' => true, 'views_count' => 17]);

        $ligne = $this->ligneDeLIndex('?fields[properties]=id,title', $bien->id);

        foreach (self::COLONNES_NON_DEMANDEES as $colonne) {
            $this->assertArrayNotHasKey(
                $colonne,
                $ligne,
                "`{$colonne}` est émis alors que `fields[properties]=id,title` ne l'a pas fait "
                .'sélectionner. Sa valeur ne vient donc pas de la base mais du `null` par défaut '
                .'d\'Eloquent : les casts de la ressource en font `0`, `false` ou `null`, '
                .'c\'est-à-dire une mesure là où il n\'y a eu aucune lecture.'
            );
        }

        // Le versant positif du même appel : ce qui a été demandé arrive, et juste.
        $this->assertSame($bien->id, $ligne['id']);
        $this->assertSame($bien->title, $ligne['title']);
    }

    /**
     * Le discriminant que `whenNotNull()`, `isset()` ou `array_filter()` ne
     * passent pas : une colonne DEMANDÉE qui vaut `null` en base reste émise à
     * `null`. La distinction porte sur « lue ou pas », jamais sur « nulle ou
     * pas » — sans quoi le front ne pourrait plus distinguer « ce bien n'a pas
     * d'étage » de « je n'ai pas demandé l'étage ».
     */
    public function test_une_colonne_selectionnee_mais_nulle_reste_emise(): void
    {
        $bien = $this->bienDeLAgent(['floor_number' => null, 'price' => 9_750_000.50]);

        $ligne = $this->ligneDeLIndex('?fields[properties]=id,title,floor_number,price', $bien->id);

        $this->assertArrayHasKey(
            'floor_number',
            $ligne,
            '`floor_number` a été DEMANDÉ : la colonne est dans `getAttributes()`, elle vaut `null`, '
            .'et cette valeur-là est une mesure. Un garde bâti sur `isset()` ou `whenNotNull()` la '
            .'supprimerait et rendrait « non demandé » indiscernable de « vide ».'
        );
        $this->assertNull($ligne['floor_number']);
        // ⚠ Prix volontairement NON ROND : `json_encode()` n'active pas
        // `JSON_PRESERVE_ZERO_FRACTION`, donc `42500000.0` part sur le fil en
        // `42500000` et revient en `int`. Un prix à décimales garde le type et
        // permet un `assertSame` strict — un `assertEquals` laisserait passer la
        // chaîne `"0"`, c'est-à-dire exactement la valeur fabriquée qu'on traque.
        $this->assertSame(9_750_000.50, $ligne['price'], 'Le prix demandé doit être le vrai, pas le `0` du cast.');
    }

    /**
     * Les clés DÉRIVÉES ne vivent pas dans l'espace de noms de `fields[]` :
     * aucune n'est une colonne, spatie rend 400 `InvalidFieldQuery` si on les y
     * met, donc aucun appelant ne peut les demander. Elles doivent survivre au
     * sparse fieldset — c'est ce test qui fait rougir le filtre
     * `array_intersect_key` que TCK-336 prescrivait.
     */
    public function test_les_cles_derivees_survivent_au_sparse_fieldset(): void
    {
        $bien = $this->bienDeLAgent(['type' => PropertyType::Apartment]);

        $ligne = $this->ligneDeLIndex('?fields[properties]=id,title,type&include=address', $bien->id);

        foreach (['location', 'main_photo_url', 'type_label', 'status_label', 'contract_type_label'] as $derivee) {
            $this->assertArrayHasKey(
                $derivee,
                $ligne,
                "`{$derivee}` n'est pas une colonne : il ne peut pas figurer dans `fields[properties]` "
                .'(spatie rendrait 400). Le filtrer par `fields[]` le ferait disparaître chez des '
                .'appelants qui l\'affichent et qui n\'ont AUCUN moyen de le demander.'
            );
        }

        // Et elles disent vrai, pas seulement « présentes » : une dérivée vidée
        // de son contenu cocherait un simple `assertArrayHasKey`.
        $this->assertNotNull($ligne['type_label']);
        $this->assertSame('Dakar', $ligne['location']['city']);
    }

    /**
     * Même raisonnement pour les relations d'`include=` : `owner` n'est pas une
     * colonne de `properties`, il ne peut pas être demandé par `fields[]`.
     */
    public function test_les_relations_incluses_survivent_au_sparse_fieldset(): void
    {
        $bien = $this->bienDeLAgent();

        $ligne = $this->ligneDeLIndex('?fields[properties]=id,title,user_id&include=owner', $bien->id);

        // ⚠ `user_id` est demandé, et il le faut : Eloquent apparie un `belongsTo`
        // sur la clé étrangère de la ligne parente. Sans elle dans le `SELECT`, la
        // relation revient à `null` — comportement de spatie ANTÉRIEUR à TCK-336, que
        // `ADMIN_PROPERTY_FIELDS` documente déjà côté front pour `agency_id`.
        $this->assertArrayHasKey('owner', $ligne);
        $this->assertNotNull($ligne['owner'], 'La relation incluse ne doit pas être vidée par le sparse fieldset.');
        $this->assertSame($bien->user_id, $ligne['owner']['id']);
    }

    /**
     * Le garde contre l'omission généralisée : SANS `fields[]`, la réponse porte
     * toutes ses clés et leurs vraies valeurs. Sans ce test, un `whenHas` qui
     * omettrait partout (par exemple sur un modèle jamais hydraté) laisserait
     * les quatre tests ci-dessus verts.
     */
    public function test_sans_sparse_fieldset_la_reponse_reste_complete(): void
    {
        $bien = $this->bienDeLAgent([
            'price' => 42_500_000.50,
            'furnished' => true,
            'featured' => true,
            'views_count' => 17,
            'favorites_count' => 4,
            'status' => PropertyStatus::Available,
        ]);

        $ligne = $this->ligneDeLIndex('', $bien->id);

        foreach (self::COLONNES_NON_DEMANDEES as $colonne) {
            $this->assertArrayHasKey($colonne, $ligne, "`{$colonne}` manque alors qu'aucun `fields[]` n'a été passé.");
        }
        $this->assertSame(42_500_000.50, $ligne['price']);
        $this->assertTrue($ligne['furnished']);
        $this->assertTrue($ligne['featured']);
        $this->assertSame(Currency::XOF->value, $ligne['currency']);
        $this->assertSame(PropertyStatus::Available->value, $ligne['status']);
    }

    /**
     * TCK-336, seconde livraison — épingle le fait que les deux compteurs
     * restent dans la FORME LISTE.
     *
     * La proposition était de les passer derrière `$isDetail`, au motif que
     * `show()` incrémente `views_count` avant de sérialiser et change donc le
     * corps de toute page de résultats. **Mesuré le 2026-08-21, elle casserait
     * une vue** : `DASHBOARD_PROPERTY_FIELDS`
     * (`takussan-web/src/lib/queries/properties-server.ts:41-42`) les demande
     * explicitement, et `PropertyList.tsx` les rend dans chaque ligne du
     * tableau de bord agent (267/272 en cartes, 405/409 en tableau), derrière un
     * `?? 0` qui absorberait l'absence sans une erreur TypeScript ni un test
     * rouge. Ce test-ci est le rouge qui manquerait.
     */
    public function test_les_compteurs_restent_dans_la_forme_liste(): void
    {
        $bien = $this->bienDeLAgent(['views_count' => 17, 'favorites_count' => 4]);

        $ligne = $this->ligneDeLIndex('?fields[properties]=id,title,views_count,favorites_count', $bien->id);

        $this->assertSame(17, $ligne['views_count']);
        $this->assertSame(4, $ligne['favorites_count']);
    }

    /**
     * Un bien de l'agence de l'agent authentifié, avec une adresse à Dakar.
     *
     * @param  array<string,mixed>  $attributs
     */
    private function bienDeLAgent(array $attributs = []): Property
    {
        $agence = Agency::factory()->create();
        $agent = User::factory()->withAgentProfile($agence)->create();
        $this->actingAsApi($agent);

        $bien = Property::factory()->create([
            'user_id' => $agent->id,
            'agency_id' => $agence->id,
            ...$attributs,
        ]);

        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'city' => 'Dakar',
        ]);

        return $bien;
    }

    /**
     * @return array<string,mixed>
     */
    private function ligneDeLIndex(string $queryString, int $idAttendu): array
    {
        $reponse = $this->getJson('/api/properties'.$queryString)->assertOk();

        $ligne = collect($reponse->json('data'))->firstWhere('id', $idAttendu);
        $this->assertNotNull($ligne, "Le bien {$idAttendu} ne figure pas dans la réponse de /api/properties{$queryString}.");

        return $ligne;
    }
}
