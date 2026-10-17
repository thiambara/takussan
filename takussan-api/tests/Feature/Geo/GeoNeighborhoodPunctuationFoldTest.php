<?php

namespace Tests\Feature\Geo;

use App\Models\Enums\ReferentialStatus;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\User;
use App\Services\Geo\GeoNeighborhoodResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-788 (P17.02) — un quartier tapé avec un tiret ou une apostrophe à la place d'une espace se
 * replie sur le quartier existant, au lieu d'en proposer un double. Les accents, eux, restent
 * distincts (ADR-0062 § 1) : « Medina » devient une proposition, mais la file de modération lui
 * montre « Médina », le quartier approuvé dont la clé repliée sans accents coïncide.
 */
class GeoNeighborhoodPunctuationFoldTest extends TestCase
{
    use RefreshDatabase;

    private GeoCity $dakar;

    private User $auteur;

    private GeoNeighborhood $grandYoff;

    private GeoNeighborhood $medina;

    protected function setUp(): void
    {
        parent::setUp();
        $this->dakar = GeoCity::factory()->create(['slug' => 'dakar', 'name' => 'Dakar']);
        $this->auteur = User::factory()->create();
        $this->grandYoff = GeoNeighborhood::factory()->for($this->dakar, 'city')->create(['slug' => 'grand-yoff', 'name' => 'Grand Yoff']);
        $this->medina = GeoNeighborhood::factory()->for($this->dakar, 'city')->create(['slug' => 'medina', 'name' => 'Médina']);
    }

    private function resoudre(string $texte): ?GeoNeighborhood
    {
        return app(GeoNeighborhoodResolver::class)->resoudreOuProposer($this->dakar, $texte, $this->auteur->id);
    }

    public function test_grand_yoff_avec_un_tiret_se_replie_sur_grand_yoff(): void
    {
        $avant = GeoNeighborhood::query()->count();

        $this->assertSame($this->grandYoff->id, $this->resoudre('Grand-Yoff')?->id);
        $this->assertSame($this->grandYoff->id, $this->resoudre(' grand – yoff ')?->id);
        $this->assertSame($avant, GeoNeighborhood::query()->count());
    }

    public function test_une_apostrophe_se_replie_comme_une_espace(): void
    {
        $cite = GeoNeighborhood::factory()->for($this->dakar, 'city')->create(['slug' => 'cite-d-arafat', 'name' => "Cité d'Arafat"]);
        $avant = GeoNeighborhood::query()->count();

        $this->assertSame($cite->id, $this->resoudre('Cité d’Arafat')?->id);
        $this->assertSame($cite->id, $this->resoudre('cité d arafat')?->id);
        $this->assertSame($avant, GeoNeighborhood::query()->count());
    }

    public function test_le_nom_exact_l_emporte_sur_un_nom_replie(): void
    {
        $tiret = GeoNeighborhood::factory()->for($this->dakar, 'city')->create(['slug' => 'grand-yoff-2', 'name' => 'Grand-Yoff']);

        $this->assertSame($tiret->id, $this->resoudre('grand-yoff')?->id);
        $this->assertSame($this->grandYoff->id, $this->resoudre('grand yoff')?->id);
    }

    public function test_les_accents_restent_distincts(): void
    {
        $proposition = $this->resoudre('Medina');

        $this->assertNotNull($proposition);
        $this->assertNotSame($this->medina->id, $proposition->id);
        $this->assertSame(ReferentialStatus::Pending, $proposition->status);
    }

    public function test_la_file_montre_les_quartiers_approuves_proches(): void
    {
        $proposition = $this->resoudre('Medina');
        $sansParent = GeoNeighborhood::factory()->for($this->dakar, 'city')->pending($this->auteur)->create(['slug' => 'cite-x', 'name' => 'Cité X']);
        $ailleurs = GeoCity::factory()->create(['slug' => 'thies', 'name' => 'Thiès']);
        GeoNeighborhood::factory()->for($ailleurs, 'city')->create(['slug' => 'medina', 'name' => 'Medina']);
        GeoNeighborhood::factory()->for($this->dakar, 'city')->rejected()->create(['slug' => 'medina-refuse', 'name' => 'MÉDINA']);

        $this->actingAsRole('super_admin');
        $lignes = collect($this->getJson('/api/admin/geo/neighborhoods?filter[status]=pending')->assertOk()->json('data'))->keyBy('id');

        $this->assertSame([['id' => $this->medina->id, 'name' => 'Médina']], $lignes[$proposition?->id]['similar']);
        $this->assertSame([], $lignes[$sansParent->id]['similar']);
    }
}
