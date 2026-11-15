<?php

namespace Tests\Feature\Favorites;

use App\Models\Enums\Currency;
use App\Models\Enums\PropertyVisibility;
use App\Models\Favorite;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2625 — `GET /api/favorites?filter[price_changed]=1` : les favoris dont le prix a bougé depuis l'ajout
 * (« vos favoris qui bougent », accueil du client), filtrés par le SERVEUR, sur les seuls biens publics.
 */
class FiltrePrixChangeTest extends TestCase
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

    /** @return list<int> */
    private function idsDesBiens(string $url): array
    {
        return collect($this->getJson($url)->assertOk()->json('data'))->pluck('property_id')->sort()->values()->all();
    }

    public function test_ne_sert_que_les_favoris_dont_le_prix_a_bouge(): void
    {
        $client = User::factory()->create();
        $baisse = $this->favori($client, 300_000);
        $hausse = $this->favori($client, 200_000);
        $immobile = $this->favori($client, 150_000);
        $baisse->update(['price' => 250_000]);
        $hausse->update(['price' => 220_000]);

        Sanctum::actingAs($client);
        $this->assertSame([$baisse->id, $hausse->id], $this->idsDesBiens('/api/favorites?filter[price_changed]=1'));
        $this->assertSame([$baisse->id, $hausse->id, $immobile->id], $this->idsDesBiens('/api/favorites'));
        $this->assertSame([$baisse->id, $hausse->id, $immobile->id], $this->idsDesBiens('/api/favorites?filter[price_changed]=0'));
    }

    /** Un bien sorti du public ne dit aucun prix (`price_change` nul) : il ne « bouge » pas non plus ici. */
    public function test_un_bien_devenu_prive_n_est_pas_un_favori_qui_bouge(): void
    {
        $client = User::factory()->create();
        $prive = $this->favori($client, 300_000);
        $prive->update(['price' => 250_000, 'visibility' => PropertyVisibility::Private]);

        Sanctum::actingAs($client);
        $this->assertSame([], $this->idsDesBiens('/api/favorites?filter[price_changed]=1'));
    }

    /** Un favori antérieur à la colonne n'a pas d'écart (`price_change` nul) : absent du filtre. */
    public function test_un_favori_sans_prix_d_ajout_n_a_pas_bouge(): void
    {
        $client = User::factory()->create();
        $ancien = $this->favori($client, 300_000);
        DB::table('favorites')->update(['price_at_favorite' => null]);
        $ancien->update(['price' => 250_000]);

        Sanctum::actingAs($client);
        $this->assertSame([], $this->idsDesBiens('/api/favorites?filter[price_changed]=1'));
    }

    /** Les favoris d'un autre compte restent hors de la liste, filtre ou non. */
    public function test_le_filtre_ne_sort_pas_des_favoris_de_l_appelant(): void
    {
        $client = User::factory()->create();
        $autre = User::factory()->create();
        $bien = $this->favori($autre, 300_000);
        $bien->update(['price' => 250_000]);

        Sanctum::actingAs($client);
        $this->assertSame([], $this->idsDesBiens('/api/favorites?filter[price_changed]=1'));
    }

    /** Liste blanche fermée : un filtre inconnu rend 422, jamais une liste non filtrée. */
    public function test_un_filtre_inconnu_est_refuse(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/favorites?filter[city]=Dakar')->assertUnprocessable();
        $this->getJson('/api/favorites?filter[price_changed]=peut-etre')->assertUnprocessable();
    }
}
