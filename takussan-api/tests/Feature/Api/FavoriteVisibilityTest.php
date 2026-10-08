<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Favorite;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-599 §1 — un favori ne décrit jamais un bien qui n'est plus public (contrainte 3), et
 * l'ajout par identifiant ne révèle rien que la liste ne révélerait pas (contrainte 11).
 *
 * Les deux portes sont éprouvées : la LISTE (AC1, AC2, AC4) et l'AJOUT (AC3). Un correctif posé
 * sur une seule laisserait l'autre servir la carte complète.
 */
class FavoriteVisibilityTest extends TestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    /** Les clés qui DÉCRIVENT un bien : aucune ne sort pour un bien non disponible. */
    private const CLES_DESCRIPTIVES = ['price', 'location', 'main_photo_url', 'status', 'photos', 'description'];

    private function favori(User $user, Property $property): Favorite
    {
        return Favorite::create(['user_id' => $user->id, 'property_id' => $property->id]);
    }

    /** @return array<string, array{array<string, mixed>, string}> */
    public static function sortiesDuPublic(): array
    {
        return [
            'redevenu privé' => [['visibility' => PropertyVisibility::Private], 'unavailable'],
            'en attente de modération' => [['status' => PropertyStatus::PendingReview], 'unavailable'],
            'refusé' => [['status' => PropertyStatus::Rejected], 'unavailable'],
            'en maintenance' => [['status' => PropertyStatus::UnderMaintenance], 'unavailable'],
            'dépublié' => [['published_at' => null], 'unavailable'],
            'loué' => [['status' => PropertyStatus::Rented], 'rented'],
            'vendu' => [['status' => PropertyStatus::Sold], 'sold'],
        ];
    }

    /**
     * **AC1 + AC4 (liste)** — le bien sort du public APRÈS la mise en favori : la liste ne rend
     * plus que `{id, slug, title}` et la raison, jamais prix, localisation, photo ni statut interne.
     *
     * @param  array<string, mixed>  $sortie
     */
    #[DataProvider('sortiesDuPublic')]
    public function test_un_bien_sorti_du_public_n_est_plus_decrit_par_la_liste(array $sortie, string $disponibilite): void
    {
        $client = User::factory()->create();
        $bien = Property::factory()->published()->create();
        $this->favori($client, $bien);
        $bien->forceFill($sortie)->save();

        Sanctum::actingAs($client);
        $item = $this->getJson('/api/favorites')->assertOk()->json('data.0');

        $this->assertSame($disponibilite, $item['availability']);
        $this->assertSame(['id', 'slug', 'title'], array_keys($item['property']));
        foreach (self::CLES_DESCRIPTIVES as $cle) {
            $this->assertArrayNotHasKey($cle, $item['property'], "« {$cle} » sort pour un bien {$disponibilite}");
        }
    }

    /**
     * **AC2** — dans la MÊME réponse, le favori d'un bien public garde sa carte complète : masquer
     * tout cocherait AC1.
     */
    public function test_la_meme_reponse_garde_la_carte_complete_d_un_bien_public(): void
    {
        $client = User::factory()->create();
        $public = Property::factory()->published()->create(['price' => 450_000]);
        $public->address()->create(['city' => 'Dakar', 'neighborhood' => 'Almadies', 'country' => 'SN']);
        $prive = Property::factory()->published()->create();
        $this->favori($client, $prive);
        $this->favori($client, $public);
        $prive->forceFill(['visibility' => PropertyVisibility::Private])->save();

        Sanctum::actingAs($client);
        $data = collect($this->getJson('/api/favorites')->assertOk()->json('data'))->keyBy('property_id');

        $this->assertSame('available', $data[$public->id]['availability']);
        $this->assertEquals(450_000, $data[$public->id]['property']['price']);
        $this->assertSame('Dakar', $data[$public->id]['property']['location']['city']);
        $this->assertSame('unavailable', $data[$prive->id]['availability']);
        $this->assertArrayNotHasKey('price', $data[$prive->id]['property']);
    }

    /**
     * **AC4 (bien supprimé)** — `removed`, réponse 200, les autres favoris rendus, et le favori se
     * retire (204) alors que la liaison implicite excluait le bien supprimé (404).
     */
    public function test_un_bien_supprime_rend_removed_et_son_favori_se_retire(): void
    {
        $client = User::factory()->create();
        $supprime = Property::factory()->published()->create();
        $autre = Property::factory()->published()->create();
        $this->favori($client, $supprime);
        $this->favori($client, $autre);
        $supprime->delete();

        Sanctum::actingAs($client);
        $data = collect($this->getJson('/api/favorites')->assertOk()->json('data'))->keyBy('property_id');

        $this->assertCount(2, $data);
        $this->assertSame('removed', $data[$supprime->id]['availability']);
        $this->assertNull($data[$supprime->id]['property']);
        $this->assertSame('available', $data[$autre->id]['availability']);

        $this->deleteJson("/api/favorites/{$supprime->id}")->assertNoContent();
        $this->assertDatabaseMissing('favorites', ['user_id' => $client->id, 'property_id' => $supprime->id]);
    }

    /** @return array<string, array{array<string, mixed>}> */
    public static function biensPublicsEnApparence(): array
    {
        return [
            'en attente de modération' => [['status' => PropertyStatus::PendingReview]],
            'refusé' => [['status' => PropertyStatus::Rejected]],
            'archivé' => [['status' => PropertyStatus::Archived]],
            'bien de test' => [['is_test' => true]],
        ];
    }

    /**
     * **AC3 (ajout)** — `visibility=public` et `published_at` non nul ne suffisent pas : la copie
     * partielle de `scopePublic` laissait passer ces biens, avec la carte complète dans le 201.
     *
     * @param  array<string, mixed>  $etat
     */
    #[DataProvider('biensPublicsEnApparence')]
    public function test_l_ajout_d_un_bien_non_public_rend_404_comme_un_identifiant_inexistant(array $etat): void
    {
        $agence = Agency::factory()->create();
        $bien = Property::factory()->published()->create(['agency_id' => $agence->id, ...$etat]);
        $client = User::factory()->create();

        Sanctum::actingAs($client);
        $refus = $this->postJson('/api/favorites', ['property_id' => $bien->id]);
        $inexistant = $this->postJson('/api/favorites', ['property_id' => $bien->id + 100_000]);

        $refus->assertNotFound();
        $this->assertStringNotContainsString('"price"', (string) $refus->getContent());
        $this->assertDatabaseCount('favorites', 0);
        $this->assertSame($inexistant->getStatusCode(), $refus->getStatusCode(), 'même statut');
        $this->assertSame($inexistant->json(), $refus->json(), 'même corps : aucun oracle d\'existence');
    }

    /**
     * **AC3 (versant autorisé)** — le personnel de l'agence du bien (`can('view')`) l'ajoute, en
     * projection minimale ; un bien public s'ajoute avec la carte complète. Un refus universel
     * cocherait le cas précédent.
     */
    public function test_le_personnel_de_l_agence_et_un_bien_public_obtiennent_201(): void
    {
        $agence = Agency::factory()->create();
        $enAttente = Property::factory()->published()->create(['agency_id' => $agence->id, 'status' => PropertyStatus::PendingReview]);
        $public = Property::factory()->published()->create();

        Sanctum::actingAs($this->agencyAgent($agence));
        $this->postJson('/api/favorites', ['property_id' => $enAttente->id])
            ->assertCreated()
            ->assertJsonPath('data.availability', 'unavailable')
            ->assertJsonMissingPath('data.property.price');

        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/favorites', ['property_id' => $public->id])
            ->assertCreated()
            ->assertJsonPath('data.availability', 'available')
            ->assertJsonPath('data.property.id', $public->id)
            ->assertJsonStructure(['data' => ['property' => ['price', 'location']]]);
    }

    /**
     * Second chemin : un agent d'une AUTRE agence n'a pas `can('view')` sur ce bien, et la branche
     * « personnel » lisait `$user->agency_id`, le pont de compatibilité.
     */
    public function test_le_personnel_d_une_autre_agence_recoit_404(): void
    {
        $bien = Property::factory()->published()->create([
            'agency_id' => Agency::factory()->create()->id,
            'status' => PropertyStatus::PendingReview,
        ]);

        Sanctum::actingAs($this->agencyAgent(Agency::factory()->create()));
        $this->postJson('/api/favorites', ['property_id' => $bien->id])->assertNotFound();
        $this->assertDatabaseCount('favorites', 0);
    }
}
