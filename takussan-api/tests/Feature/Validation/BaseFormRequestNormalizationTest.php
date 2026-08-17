<?php

namespace Tests\Feature\Validation;

use App\Models\SavedSearch;
use App\Models\Tag;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-305 — le contrat de normalisation des entrées, désormais généralisé à 120 endpoints.
 *
 * `BaseFormRequest::prepareForValidation()` normalise récursivement ce qui arrive : toute chaîne
 * est **trimée**, et une chaîne **vide devient `null`**. TCK-305 ayant fait passer 120 validations
 * en ligne à des FormRequest étendant cette classe, ce contrat vaut maintenant pour elles toutes —
 * un champ `nullable` recevant `""` écrit `null` en base là où il écrivait `""`.
 *
 * **Pourquoi ce fichier existe.** Mon rapport disait « rien n'a rougi ». C'est exactement la phrase
 * qui décrivait aussi l'inversion 403 → 422 deux heures plus tôt : *« rien n'a rougi » n'est pas
 * « quelque chose l'observe »*. Un contrat que rien n'observe se perd au premier refactor, et sa
 * perte ne se manifeste que par une donnée légèrement différente en base — le genre de régression
 * qu'on découvre des mois plus tard, dans un export.
 *
 * ⚠️ **Ce que les ablations ont révélé — et qui corrige ce que j'avais écrit.**
 *
 * Trois ablations, parce que la première ne suffisait pas à conclure :
 *
 * | Ablation | Ce qu'on retire | Résultat |
 * |---|---|---|
 * | A | `BaseFormRequest::prepareForValidation()` | **4 verts** |
 * | B | `TrimStrings` + `ConvertEmptyStringsToNull` du stack global | **4 verts** |
 * | C | **les deux** | **4 rouges** |
 *
 * Les deux mécanismes sont **redondants l'un avec l'autre**. Laravel monte `TrimStrings` et
 * `ConvertEmptyStringsToNull` en middleware **global**
 * (`Illuminate\Foundation\Configuration\Middleware`, lignes 461-462), `bootstrap/app.php` ne les
 * retire pas, et tous deux traversent les tableaux imbriqués — exactement comme
 * `prepareForValidation()`.
 *
 * **Conséquence à écrire noir sur blanc : TCK-305 n'a rien changé sur ce point.** J'avais annoncé
 * « un changement de comportement pour les 120 endpoints convergés » ; c'était une déduction tirée
 * de la lecture de `BaseFormRequest`, pas une mesure. Les endpoints qui validaient en ligne
 * recevaient **déjà** des chaînes trimées et des `""` convertis en `null` : le middleware global
 * s'en chargeait avant eux. *Ne jamais déduire un comportement d'une classe qu'on lit sans
 * regarder ce qui court avant elle.*
 *
 * Et c'est pourquoi ces tests visent le **contrat**, pas la classe qui le porte : l'ablation A
 * seule les aurait laissés verts, et on en aurait conclu qu'ils ne gardent rien. Ils gardent la
 * propriété observable — la seule qui compte pour un client de l'API — et ne rougissent que
 * lorsqu'elle disparaît vraiment, c'est-à-dire quand les **deux** mécanismes tombent.
 */
class BaseFormRequestNormalizationTest extends ApiTestCase
{
    use RefreshDatabase;

    /**
     * Le pendant « chaîne vide » : `notification_frequency` est `nullable`, et `""` doit arriver
     * en base comme `null` — pas comme une chaîne vide qui échouerait plus tard le `in:` d'une
     * lecture, ou qui remonterait au front comme une valeur choisie.
     */
    public function test_an_empty_string_on_a_nullable_field_is_stored_as_null(): void
    {
        $this->apiActingAsRole('super_admin');

        $this->postJson('/api/tags', [
            'name' => 'Piscine',
            'type' => 'amenity',
            'description' => '',
            'icon' => '',
        ])->assertCreated();

        $tag = Tag::where('name', 'Piscine')->sole();

        $this->assertNull($tag->description, 'une chaîne vide sur `nullable` doit être stockée `null`, pas ""');
        $this->assertNull($tag->icon);
    }

    /**
     * ⚠️ Le cas que ce fichier a mis au jour, et qui n'est PAS une régression de TCK-305.
     *
     * `saved_searches.notification_frequency` est `string()->default('daily')` — donc **NOT NULL**
     * — alors que la règle de validation est `nullable`. Un client qui envoie `""` obtient un
     * `null` normalisé, puis un **500** sur la contrainte d'intégrité. Vérifié identique dans le
     * contrôleur d'avant le déplacement (`git show ad007231:…SavedSearchController.php`) : mêmes
     * règles, même `create(array_merge($data, …))`. Le middleware global convertissait déjà `""`
     * en `null` avant TCK-305 ; le défaut préexiste et n'a pas été introduit ici.
     *
     * Ce test le **fige tel quel** plutôt que de le corriger : corriger la colonne ou la règle est
     * une décision produite (« absent » et « off » sont-ils la même chose ?) qui n'appartient pas à
     * TCK-305. Le jour où quelqu'un la prend, ce test rougira et le lui dira.
     */
    public function test_a_nullable_rule_over_a_not_null_column_still_fails_and_it_predates_this_ticket(): void
    {
        $this->apiActingAsRole('agent');

        $this->postJson('/api/saved-searches', [
            'name' => 'Villa Dakar',
            'criteria' => ['city' => 'Dakar'],
            'notification_frequency' => '',
        ])->assertStatus(500);
    }

    /**
     * Le pendant « espaces superflus » : la valeur arrive trimée en base.
     *
     * Sans cela, deux recherches nommées « Dakar » et « Dakar  » sont deux lignes distinctes que
     * l'utilisateur voit comme un doublon inexplicable.
     */
    public function test_surrounding_whitespace_is_trimmed_before_it_reaches_the_database(): void
    {
        $user = $this->apiActingAsRole('agent');

        $this->postJson('/api/saved-searches', [
            'name' => "  Villa Dakar  \t",
            'criteria' => ['city' => 'Dakar'],
        ])->assertCreated();

        $search = SavedSearch::where('user_id', $user->id)->sole();

        $this->assertSame('Villa Dakar', $search->name);
    }

    /**
     * La normalisation est **récursive** : elle descend dans les tableaux imbriqués.
     *
     * C'est le cas qui compte le plus ici, parce que `criteria` est une colonne JSON — une valeur
     * non normalisée y est stockée telle quelle et ressort intacte à chaque lecture. Un `""` au
     * fond d'un critère de recherche devient un filtre sur la chaîne vide, pas une absence de
     * filtre.
     */
    public function test_normalization_reaches_into_nested_arrays(): void
    {
        $user = $this->apiActingAsRole('agent');

        $this->postJson('/api/saved-searches', [
            'name' => 'Villa Dakar',
            'criteria' => [
                'city' => '  Dakar  ',
                'neighborhood' => '',
                'tags' => ['  mer  ', ''],
            ],
        ])->assertCreated();

        $criteria = SavedSearch::where('user_id', $user->id)->sole()->criteria;

        $this->assertSame('Dakar', $criteria['city'], 'trim dans un tableau imbriqué');
        $this->assertNull($criteria['neighborhood'], 'chaîne vide → null dans un tableau imbriqué');
        $this->assertSame('mer', $criteria['tags'][0], 'trim dans un tableau de tableau');
        $this->assertNull($criteria['tags'][1], 'chaîne vide → null dans un tableau de tableau');
    }
}
