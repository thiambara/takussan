<?php

namespace Tests\Feature\Search;

use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-578 (ADR-0008, amendement du 2026-11-16) — la recherche des consoles trouve les biens que
 * l'index PUBLIC ne contient pas : `filter[search]` de `Property::buildQuery()` cherche en SQL.
 *
 * Le moteur est réel (`InteractsWithMeilisearch`) : la non-fuite se juge sur ce que l'index contient
 * vraiment, et la console doit trouver ses biens non publics MÊME quand l'index est à jour.
 */
class RechercheConsoleDesBiensTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    /** @return array<string, array{0: array<string, mixed>}> */
    public static function biensNonPublics(): array
    {
        return [
            'brouillon' => [['status' => PropertyStatus::Draft, 'visibility' => PropertyVisibility::Public]],
            'en attente de validation' => [['status' => PropertyStatus::PendingReview, 'visibility' => PropertyVisibility::Public]],
            'refusé' => [['status' => PropertyStatus::Rejected, 'visibility' => PropertyVisibility::Public]],
            'privé' => [['status' => PropertyStatus::Available, 'visibility' => PropertyVisibility::Private]],
        ];
    }

    /**
     * AC2 — par le titre et par la référence exacte, jamais le bien d'une autre agence.
     *
     * @param  array<string, mixed>  $etat
     */
    #[DataProvider('biensNonPublics')]
    public function test_l_agent_trouve_son_bien_non_public_par_titre_et_par_reference(array $etat): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->withAgentProfile($agency)->create();
        $mien = Property::factory()->create([
            ...$etat,
            'user_id' => $agent->id,
            'agency_id' => $agency->id,
            'title' => 'Villa Zorglubienne des Almadies',
            'reference_number' => 'PR-FC-FCBYZW',
        ]);
        // Le même titre, la même forme de bien, dans une autre agence.
        Property::factory()->create([
            ...$etat,
            'agency_id' => Agency::factory()->create()->id,
            'title' => 'Villa Zorglubienne voisine',
            'reference_number' => 'PR-FC-AUTRE1',
        ]);
        $this->indexProperties();

        Sanctum::actingAs($agent);

        foreach (['zorglubienne', 'ZORGLUBIENNE', 'PR-FC-FCBYZW', 'pr-fc-fcbyzw'] as $terme) {
            $this->getJson('/api/properties?filter[search]='.urlencode($terme).'&fields[properties]=id,title')
                ->assertOk()
                ->assertJsonPath('meta.total', 1)
                ->assertJsonPath('data.0.id', $mien->id);
        }

        // La référence de l'autre agence ne rend rien.
        $this->getJson('/api/properties?filter[search]=PR-FC-AUTRE1&fields[properties]=id')
            ->assertOk()
            ->assertJsonPath('meta.total', 0);
    }

    /**
     * AC3 — la recherche PUBLIQUE ne rend aucun bien non public : ni le moteur seul (l'index n'en
     * contient aucun, {@see Property::shouldBeSearchable()}), ni l'endpoint public.
     *
     * @param  array<string, mixed>  $etat
     */
    #[DataProvider('biensNonPublics')]
    public function test_l_index_public_ne_recoit_aucun_bien_non_public(array $etat): void
    {
        $agency = Agency::factory()->create();
        $cache = Property::factory()->create([
            ...$etat,
            'agency_id' => $agency->id,
            'title' => 'Duplex Quetzalcoatlique',
            'reference_number' => 'PR-NP-CACHE1',
        ]);
        $this->indexProperties();

        $this->assertSame([], Property::search('Quetzalcoatlique')->keys()->all());
        $this->assertSame([], Property::search('PR-NP-CACHE1')->keys()->all());

        $ids = $this->getJson('/api/public/properties/search?q=Quetzalcoatlique')
            ->assertOk()
            ->json('data.*.id');
        $this->assertNotContains($cache->id, $ids);
    }

    /** AC3 — témoin : le même bien, public, est bien indexé (sinon le test ci-dessus ne prouverait rien). */
    public function test_temoin_le_bien_public_est_indexe(): void
    {
        $public = Property::factory()->create([
            'agency_id' => Agency::factory()->create()->id,
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'title' => 'Duplex Quetzalcoatlique',
        ]);
        $this->indexProperties();

        $this->assertSame([$public->id], array_map('intval', Property::search('Quetzalcoatlique')->keys()->all()));
    }

    /** AC4 — la référence exacte en tête, devant un bien plus récent dont le titre la contient. */
    public function test_la_reference_exacte_vient_en_tete(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->withAgentProfile($agency)->create();
        $bien = fn (array $attrs) => Property::factory()->create([
            'user_id' => $agent->id,
            'agency_id' => $agency->id,
            'status' => PropertyStatus::Draft,
            ...$attrs,
        ]);

        $exacte = $bien(['title' => 'Terrain nu', 'reference_number' => 'TK-2026-ABC123', 'created_at' => now()->subDays(5)]);
        $dansLaDescription = $bien(['title' => 'Studio', 'description' => 'Voir aussi TK-2026-ABC123', 'reference_number' => 'TK-2026-ZZZ001', 'created_at' => now()->subDay()]);
        $dansLeTitre = $bien(['title' => 'Ex TK-2026-ABC123 rénové', 'reference_number' => 'TK-2026-ZZZ002', 'created_at' => now()]);

        Sanctum::actingAs($agent);

        $ids = $this->getJson('/api/properties?filter[search]=tk-2026-abc123&fields[properties]=id,title')
            ->assertOk()
            ->assertJsonPath('meta.total', 3)
            ->json('data.*.id');

        $this->assertSame([$exacte->id, $dansLeTitre->id, $dansLaDescription->id], $ids);

        // Un `sort=` explicite reste souverain.
        $ids = $this->getJson('/api/properties?filter[search]=tk-2026-abc123&sort=-created_at&fields[properties]=id,created_at')
            ->assertOk()
            ->json('data.*.id');

        $this->assertSame([$dansLeTitre->id, $dansLaDescription->id, $exacte->id], $ids);
    }

    /** La console super-admin des biens d'une agence passe par le même chemin. */
    public function test_la_console_super_admin_trouve_le_brouillon_d_une_agence(): void
    {
        $agency = Agency::factory()->create();
        $brouillon = Property::factory()->create([
            'agency_id' => $agency->id,
            'status' => PropertyStatus::Draft,
            'title' => 'Penthouse Brouillonnesque',
            'reference_number' => 'PR-SA-DRAFT1',
        ]);
        Property::factory()->create([
            'agency_id' => Agency::factory()->create()->id,
            'status' => PropertyStatus::Draft,
            'title' => 'Penthouse Brouillonnesque ailleurs',
        ]);
        $this->indexProperties();

        $this->actingAsRole('super_admin');

        foreach (['brouillonnesque', 'PR-SA-DRAFT1'] as $terme) {
            $this->getJson("/api/admin/agencies/{$agency->id}/properties?filter[search]={$terme}&fields[properties]=id,status")
                ->assertOk()
                ->assertJsonPath('meta.total', 1)
                ->assertJsonPath('data.0.id', $brouillon->id);
        }
    }

    /**
     * Les trois autres appelants de `Property::buildQuery()` : le décompte du portefeuille (égal à la
     * liste), les sous-biens, les biens d'un bailleur. Chacun avec `filter[search]` sur un brouillon.
     */
    public function test_les_autres_listes_de_console_trouvent_le_brouillon(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->withAgentProfile($agency)->create();
        $immeuble = Property::factory()->create(['user_id' => $agent->id, 'agency_id' => $agency->id, 'title' => 'Immeuble']);
        $brouillon = Property::factory()->create([
            'user_id' => $agent->id,
            'agency_id' => $agency->id,
            'parent_id' => $immeuble->id,
            'status' => PropertyStatus::Draft,
            'title' => 'Lot Brouillonnesque',
            'reference_number' => 'PR-LOT-0001',
        ]);
        Property::factory()->create(['user_id' => $agent->id, 'agency_id' => $agency->id, 'parent_id' => $immeuble->id, 'title' => 'Autre lot']);
        $this->indexProperties();

        Sanctum::actingAs($agent);

        $liste = $this->getJson('/api/properties?filter[search]=brouillonnesque&filter[status]=draft&fields[properties]=id')
            ->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $brouillon->id);
        $this->getJson('/api/properties/portfolio-summary?filter[search]=brouillonnesque&filter[status]=draft')
            ->assertOk()->assertJsonPath('data.total', $liste->json('meta.total'));
        $this->getJson("/api/properties/{$immeuble->id}/children?filter[search]=PR-LOT-0001&fields[properties]=id")
            ->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $brouillon->id);

        $bailleur = User::factory()->create();
        $profil = OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $agency->id]);
        $sien = Property::factory()->create([
            'user_id' => $bailleur->id,
            'agency_id' => $agency->id,
            'status' => PropertyStatus::Draft,
            'title' => 'Maison Brouillonnesque du bailleur',
        ]);
        Sanctum::actingAs($bailleur);
        $this->getJson("/api/me/owner-profiles/{$profil->id}/properties?filter[search]=brouillonnesque&fields[properties]=id,title")
            ->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $sien->id);
    }
}
