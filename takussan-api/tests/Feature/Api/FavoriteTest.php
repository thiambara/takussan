<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Favorite;
use App\Models\Property;
use App\Models\User;
use App\Services\Media\WatermarkTrace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Support\RemoteDiskFake;
use Tests\TestCase;

class FavoriteTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_add_and_list_favorites(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create();

        Sanctum::actingAs($user);

        $this->postJson('/api/favorites', ['property_id' => $property->id])
            ->assertCreated()
            ->assertJsonPath('data.property_id', $property->id);

        $this->getJson('/api/favorites')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    public function test_adding_same_property_twice_is_idempotent(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create();

        Sanctum::actingAs($user);

        $this->postJson('/api/favorites', ['property_id' => $property->id])->assertCreated();
        $this->postJson('/api/favorites', ['property_id' => $property->id])->assertCreated();

        $this->assertDatabaseCount('favorites', 1);
    }

    public function test_user_can_remove_favorite(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create();
        Favorite::create(['user_id' => $user->id, 'property_id' => $property->id]);

        Sanctum::actingAs($user);

        $this->deleteJson("/api/favorites/{$property->id}")->assertNoContent();
        $this->assertDatabaseCount('favorites', 0);
    }

    /** **AC5** — la page est bornée à 50 : au-delà, 422 plutôt qu'une liste entière servie. */
    public function test_per_page_est_borne_a_50(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/favorites?per_page=51')->assertUnprocessable()->assertJsonValidationErrors('per_page');
        $this->getJson('/api/favorites?per_page=50')->assertOk();
    }

    /**
     * **AC5** — le nombre de requêtes ne dépend pas du nombre de favoris : `main_photo_url` lisait
     * `getFirstMedia()` sans médias préchargés, et le filigrane se jugeait bien par bien.
     */
    public function test_le_nombre_de_requetes_est_le_meme_pour_2_et_20_favoris_avec_photo(): void
    {
        RemoteDiskFake::install('r2-media');
        RemoteDiskFake::install('r2-private');
        $client = User::factory()->create();
        // Agence sans filigrane : la photo est servie, mais la règle doit être lue pour le savoir.
        $agence = Agency::factory()->create(['settings' => ['watermark_enabled' => false]]);
        $ajouter = function (int $n) use ($client, $agence): void {
            Property::factory()->published()->count($n)->create(['agency_id' => $agence->id])
                ->each(function (Property $bien) use ($client): void {
                    // Photo antérieure à la trace de filigrane : la règle de l'agence doit être
                    // LUE (cas « absente » de TCK-539) — par lot, pas bien par bien.
                    $bien->addMedia(UploadedFile::fake()->image('photo.jpg'))->toMediaCollection('photos')
                        ->refresh()
                        ->setCustomProperty(WatermarkTrace::KEY, [])
                        ->setCustomProperty(WatermarkTrace::EXEMPT_KEY, [])
                        ->save();
                    Favorite::create(['user_id' => $client->id, 'property_id' => $bien->id]);
                });
        };
        Sanctum::actingAs($client);

        $ajouter(2);
        $pourDeux = $this->compterLesRequetes(fn () => $this->getJson('/api/favorites?per_page=50')->assertOk()->assertJsonCount(2, 'data'));
        $ajouter(18);
        $pourVingt = $this->compterLesRequetes(fn () => $this->getJson('/api/favorites?per_page=50')->assertOk()->assertJsonCount(20, 'data'));

        $this->assertNotNull($this->getJson('/api/favorites')->json('data.0.property.main_photo_url'), 'la photo est bien servie');
        $this->assertSame($pourDeux, $pourVingt, "{$pourDeux} requêtes pour 2 favoris, {$pourVingt} pour 20");
    }

    /** **AC6** — la note se lit telle qu'écrite, bornée à 500 caractères. */
    public function test_la_note_d_un_favori_se_modifie(): void
    {
        $client = User::factory()->create();
        $bien = Property::factory()->published()->create();
        Favorite::create(['user_id' => $client->id, 'property_id' => $bien->id]);
        Sanctum::actingAs($client);

        $this->patchJson("/api/favorites/{$bien->id}", ['notes' => 'Appeler lundi'])
            ->assertOk()
            ->assertJsonPath('data.notes', 'Appeler lundi')
            ->assertJsonPath('data.availability', 'available');
        $this->getJson('/api/favorites')->assertJsonPath('data.0.notes', 'Appeler lundi');

        $this->patchJson("/api/favorites/{$bien->id}", ['notes' => str_repeat('a', 501)])
            ->assertUnprocessable()->assertJsonValidationErrors('notes');
        $this->patchJson("/api/favorites/{$bien->id}", ['notes' => null])->assertOk()->assertJsonPath('data.notes', null);
    }

    /** **AC6** — second chemin : le favori d'un autre utilisateur ne se modifie pas, et ne se devine pas. */
    public function test_la_note_du_favori_d_un_autre_rend_404(): void
    {
        $bien = Property::factory()->published()->create();
        $autre = User::factory()->create();
        Favorite::create(['user_id' => $autre->id, 'property_id' => $bien->id, 'notes' => 'à moi']);

        Sanctum::actingAs(User::factory()->create());
        $this->patchJson("/api/favorites/{$bien->id}", ['notes' => 'volé'])->assertNotFound();

        $this->assertDatabaseHas('favorites', ['user_id' => $autre->id, 'property_id' => $bien->id, 'notes' => 'à moi']);
    }

    private function compterLesRequetes(callable $appel): int
    {
        $n = 0;
        DB::listen(function () use (&$n): void {
            $n++;
        });
        $avant = $n;
        $appel();

        return $n - $avant;
    }
}
