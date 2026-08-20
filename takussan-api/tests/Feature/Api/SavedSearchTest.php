<?php

namespace Tests\Feature\Api;

use App\Models\SavedSearch;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SavedSearchTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_creates_and_lists_saved_searches(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/saved-searches', [
            'name' => 'Appartements Almadies',
            'criteria' => ['neighborhood' => 'Almadies', 'min_price' => 200000],
            'notification_frequency' => 'daily',
        ])->assertCreated();

        $this->getJson('/api/saved-searches')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_user_cannot_update_other_users_search(): void
    {
        $u1 = User::factory()->create();
        $u2 = User::factory()->create();
        $search = SavedSearch::factory()->create(['user_id' => $u1->id]);

        Sanctum::actingAs($u2);
        $this->patchJson("/api/saved-searches/{$search->id}", ['name' => 'boom'])
            ->assertForbidden();
    }

    /**
     * TCK-330 — le bug : une fréquence d'alerte VIDE rendait 500.
     *
     * `ConvertEmptyStringsToNull` (middleware global) puis
     * `BaseFormRequest::prepareForValidation()` transforment `""` en `null` AVANT la validation ;
     * la règle de création portait `nullable`, qui laissait passer ce `null` jusqu'à
     * `SavedSearch::create()`, où la colonne `notification_frequency` est **NOT NULL**
     * (`string()->default('daily')`). L'erreur d'intégrité remontait en 500.
     *
     * Décision de TCK-330 : « pas d'alerte » et « champ non renseigné » sont DEUX états
     * distincts. Le domaine porte déjà une sentinelle pour le premier — `off` — donc le vide
     * n'est pas une valeur : il est refusé à la porte, comme il l'était déjà à la mise à jour.
     */
    public function test_creating_a_saved_search_with_an_empty_notification_frequency_is_rejected_not_a_server_error(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/saved-searches', [
            'name' => 'Villa Dakar',
            'criteria' => ['city' => 'Dakar'],
            'notification_frequency' => '',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['notification_frequency']);
    }

    /**
     * TCK-330 — le `null` explicite est le MÊME état que la chaîne vide une fois normalisée,
     * mais il arrive par un autre chemin (un client JSON qui sérialise son champ non renseigné).
     * Les deux doivent finir sur le même 422, sinon le trou se rouvre par la porte de derrière.
     */
    public function test_creating_a_saved_search_with_an_explicitly_null_notification_frequency_is_rejected(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/saved-searches', [
            'name' => 'Villa Dakar',
            'criteria' => ['city' => 'Dakar'],
            'notification_frequency' => null,
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['notification_frequency']);
    }

    /**
     * TCK-330 / AC2 — création et mise à jour rendent le MÊME code pour la MÊME saisie.
     *
     * C'est l'asymétrie qui a produit le bug : `['nullable', 'in:…']` d'un côté,
     * `['sometimes', 'in:…']` de l'autre, donc 500 ici et 422 là pour le même champ vide.
     * Le test compare les deux statuts entre eux, pas à une constante : il rougit dès que
     * les deux règles divergent à nouveau, quel que soit le code retenu.
     */
    public function test_store_and_update_agree_on_the_same_empty_notification_frequency(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $search = SavedSearch::factory()->create(['user_id' => $user->id]);

        $store = $this->postJson('/api/saved-searches', [
            'name' => 'Villa Dakar',
            'criteria' => ['city' => 'Dakar'],
            'notification_frequency' => '',
        ]);

        $update = $this->putJson("/api/saved-searches/{$search->id}", [
            'notification_frequency' => '',
        ]);

        $this->assertSame(
            $update->getStatusCode(),
            $store->getStatusCode(),
            'POST et PUT doivent rendre le même code pour la même saisie vide (TCK-330 AC2)'
        );
    }

    /**
     * TCK-330 / AC3 — la sentinelle « pas d'alerte » est `off`, et elle est acceptée.
     *
     * Refuser le vide n'a de sens que si le client dispose d'une façon de dire « ne m'alerte
     * pas ». Sans ce test, resserrer la règle reviendrait à supprimer la fonctionnalité.
     */
    public function test_the_off_sentinel_is_accepted_and_stored(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/saved-searches', [
            'name' => 'Villa Dakar',
            'criteria' => ['city' => 'Dakar'],
            'notification_frequency' => 'off',
        ])
            ->assertCreated()
            ->assertJsonPath('data.notification_frequency', 'off');

        $this->assertSame('off', SavedSearch::where('user_id', $user->id)->sole()->notification_frequency);
    }

    /**
     * TCK-330 — le champ ABSENT reste valide et retombe sur le défaut de la colonne.
     *
     * Le correctif resserre la règle ; il ne doit pas la rendre `required`. Ce test garde la
     * troisième branche des trois cas distincts (absent / vide / sentinelle) : sans lui, un
     * futur `required` passerait la CI en cassant tous les clients qui omettent le champ.
     */
    public function test_an_absent_notification_frequency_falls_back_to_the_column_default(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/saved-searches', [
            'name' => 'Villa Dakar',
            'criteria' => ['city' => 'Dakar'],
        ])->assertCreated();

        $this->assertSame('daily', SavedSearch::where('user_id', $user->id)->sole()->notification_frequency);
    }
}
