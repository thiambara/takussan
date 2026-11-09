<?php

namespace Tests\Feature\Favorites;

use App\Jobs\SendFavoriteChangeAlerts;
use App\Models\Enums\Currency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Favorite;
use App\Models\Property;
use App\Models\SavedSearch;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-2507 — ce qu'un favori a gagné ou perdu DEPUIS L'AJOUT (`price_change`), et la dernière ouverture d'une
 * recherche sauvegardée (`last_viewed_at`).
 */
class PrixDepuisLAjoutTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Notification::fake();
    }

    private function favori(User $client, int $prix): Property
    {
        $bien = Property::factory()->published()->create(['price' => $prix, 'currency' => Currency::XOF]);
        Favorite::create(['user_id' => $client->id, 'property_id' => $bien->id]);

        return $bien;
    }

    /** Le prix d'ajout est posé à la création, au prix du bien à cet instant. */
    public function test_le_prix_d_ajout_est_pose_a_la_creation(): void
    {
        $client = User::factory()->create();
        $bien = Property::factory()->published()->create(['price' => 480_000]);

        Sanctum::actingAs($client);
        $this->postJson('/api/favorites', ['property_id' => $bien->id])
            ->assertCreated()
            ->assertJsonPath('data.price_change', 0)
            ->assertJsonMissingPath('data.price_at_favorite');

        $this->assertSame('480000.00', Favorite::sole()->getRawOriginal('price_at_favorite'));
    }

    /**
     * **AC1** — 300 000 → 250 000, puis un passage des alertes, qui REBASE `alert_baseline_price` à 250 000 : l'écart
     * depuis l'ajout reste −50 000. Lu sur la base d'alerte, il vaudrait 0.
     */
    public function test_l_ecart_depuis_l_ajout_survit_au_rebasage_de_l_alerte(): void
    {
        $client = User::factory()->create();
        $bien = $this->favori($client, 300_000);
        $bien->update(['price' => 250_000]);

        (new SendFavoriteChangeAlerts)->handle();
        $this->assertSame('250000.00', Favorite::sole()->getRawOriginal('alert_baseline_price'), 'la base d\'alerte a bien été rebasée');

        Sanctum::actingAs($client);
        $this->getJson('/api/favorites')
            ->assertOk()
            ->assertJsonPath('data.0.price_change', -50000)
            ->assertJsonMissingPath('data.0.price_at_favorite')
            ->assertJsonMissingPath('data.0.alert_baseline_price');
    }

    /**
     * @return array<string, array{0: array<string, mixed>, 1: string}>
     */
    public static function etatsNonPublics(): array
    {
        return [
            'loué' => [['status' => PropertyStatus::Rented], Favorite::RENTED],
            'vendu' => [['status' => PropertyStatus::Sold], Favorite::SOLD],
            'devenu privé' => [['visibility' => PropertyVisibility::Private], Favorite::UNAVAILABLE],
            'repassé en brouillon' => [['status' => PropertyStatus::Draft, 'published_at' => null], Favorite::UNAVAILABLE],
        ];
    }

    /**
     * **AC2** et contrainte n°2 — un bien sorti du public, quelle qu'en soit la raison, n'émet ni écart ni aucun prix
     * (JSON brut), alors que son prix a baissé depuis l'ajout.
     *
     * @param  array<string, mixed>  $etat
     */
    #[DataProvider('etatsNonPublics')]
    public function test_un_favori_non_public_n_emet_aucun_prix(array $etat, string $disponibilite): void
    {
        $client = User::factory()->create();
        $bien = $this->favori($client, 300_000);
        $bien->update(['price' => 250_000] + $etat);

        Sanctum::actingAs($client);
        $reponse = $this->getJson('/api/favorites')
            ->assertOk()
            ->assertJsonPath('data.0.availability', $disponibilite)
            ->assertJsonPath('data.0.price_change', null)
            ->assertJsonMissingPath('data.0.property.price');

        $brut = $reponse->getContent();
        foreach (['250000', '300000', '-50000', '50000'] as $montant) {
            $this->assertStringNotContainsString($montant, $brut, "aucun montant dans la réponse : {$montant}");
        }
    }

    /**
     * Revue du 2026-11-09 — un favori posé sur un bien NON public (brouillon que son bailleur ou l'agence voit) ne
     * prend pas de prix d'ajout : une fois le bien publié moins cher, aucun écart ne compare le prix public au prix du
     * brouillon.
     */
    public function test_un_favori_pose_sur_un_brouillon_n_a_pas_de_prix_d_ajout(): void
    {
        $client = User::factory()->create();
        $bien = Property::factory()->draft()->create(['price' => 400_000, 'currency' => Currency::XOF]);
        Favorite::create(['user_id' => $client->id, 'property_id' => $bien->id]);
        $this->assertNull(Favorite::sole()->getRawOriginal('price_at_favorite'));

        $bien->update(['price' => 350_000, 'status' => PropertyStatus::Available, 'visibility' => PropertyVisibility::Public, 'published_at' => now()]);

        Sanctum::actingAs($client);
        $this->getJson('/api/favorites')
            ->assertOk()
            ->assertJsonPath('data.0.availability', Favorite::AVAILABLE)
            ->assertJsonPath('data.0.price_change', null);
    }

    /** **AC4** — un favori antérieur à la colonne émet `null`, pas 0. */
    public function test_un_favori_anterieur_a_la_colonne_emet_null(): void
    {
        $client = User::factory()->create();
        $this->favori($client, 300_000);
        DB::table('favorites')->update(['price_at_favorite' => null]);

        Sanctum::actingAs($client);
        $this->getJson('/api/favorites')
            ->assertOk()
            ->assertJsonPath('data.0.availability', Favorite::AVAILABLE)
            ->assertJsonPath('data.0.price_change', null);
    }

    /** **AC3** — la recherche d'un autre : 404, rien ne bouge. */
    public function test_ouvrir_la_recherche_d_un_autre_rend_404_sans_rien_modifier(): void
    {
        $titulaire = User::factory()->create();
        $recherche = SavedSearch::factory()->create(['user_id' => $titulaire->id]);
        $avant = $recherche->fresh()->getAttributes();

        Sanctum::actingAs(User::factory()->create());
        $this->postJson("/api/saved-searches/{$recherche->id}/viewed")->assertNotFound();

        $this->assertSame($avant, $recherche->fresh()->getAttributes());
        $this->assertNull($recherche->fresh()->last_viewed_at);
    }

    /** **AC3** — la sienne : 204, `last_viewed_at` posé et émis, `updated_at` intact. */
    public function test_ouvrir_sa_recherche_pose_last_viewed_at(): void
    {
        $titulaire = User::factory()->create();
        $recherche = SavedSearch::factory()->create(['user_id' => $titulaire->id]);
        $majAvant = $recherche->fresh()->getRawOriginal('updated_at');

        Sanctum::actingAs($titulaire);
        $this->getJson('/api/saved-searches')->assertOk()->assertJsonPath('data.0.last_viewed_at', null);

        Carbon::setTestNow('2026-11-09 10:15:00');
        $this->postJson("/api/saved-searches/{$recherche->id}/viewed")->assertNoContent();

        $this->getJson('/api/saved-searches')
            ->assertOk()
            ->assertJsonPath('data.0.last_viewed_at', '2026-11-09T10:15:00+00:00');
        $this->assertSame($majAvant, $recherche->fresh()->getRawOriginal('updated_at'), 'une ouverture ne modifie pas la recherche');
    }

    public function test_ouvrir_sans_session_rend_401(): void
    {
        $recherche = SavedSearch::factory()->create();

        $this->postJson("/api/saved-searches/{$recherche->id}/viewed")->assertUnauthorized();
    }
}
