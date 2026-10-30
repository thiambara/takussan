<?php

namespace Tests\Feature\Radar\Observatory;

use App\Models\Address;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarAdvertiserNature;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceSite;
use App\Models\GeoNeighborhood;
use App\Models\Property;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\RadarListingSnapshot;
use App\Services\Radar\Observatory\RadarObservatory;
use App\Services\Radar\RadarPurger;
use App\Support\RadarPhone;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2393 (ADR-0083 §1, §2) — AC1 et AC6 : l'observatoire du marché survit à la purge et ne lit aucune colonne
 * personnelle ; le prix au m² est la médiane du dernier instantané, doublons exclus ; l'écart d'offre compte les annonces en
 * ligne hors catalogue contre les biens publics du quartier.
 */
class RadarObservatoryTest extends TestCase
{
    use ConstruitLeMarche;
    use OperateursPlateforme;
    use RefreshDatabase;

    /** Ce que la purge efface, et que l'observatoire ne doit jamais nommer. */
    private const COLONNES_PERSONNELLES = ['raw_text', 'extracted', 'source_url', 'phone', 'display_name', 'similarity_text', 'nature_signals'];

    /** Les sections du marché, anonymes. `natures` lit l'annonceur, que la purge vide (TCK-2431). */
    private const SECTIONS_ANONYMES = ['summary', 'price_per_m2', 'time_on_market', 'supply_gap', 'gone_sources'];

    private GeoNeighborhood $almadies;

    private GeoNeighborhood $mermoz;

    private Property $bienPublie;

    private RadarAdvertiser $annonceur;

    /** @var array<string, int> les passages qui ont écrit les instantanés, par site (un instantané détaché garde le sien) */
    private array $passages = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeTime();
        $this->travelTo('2026-10-30 12:00:00');
        Queue::fake();
        $this->almadies = GeoNeighborhood::factory()->create(['name' => 'Almadies']);
        $this->mermoz = GeoNeighborhood::factory()->create(['name' => 'Mermoz']);
    }

    private function bienPublicA(GeoNeighborhood $quartier, array $surcharge = []): Property
    {
        $bien = Property::factory()->published()->create($surcharge + ['contract_type' => 'rent', 'type' => 'apartment']);
        Address::factory()->create(['addressable_type' => $bien->getMorphClass(), 'addressable_id' => $bien->id, 'geo_neighborhood_id' => $quartier->id]);

        return $bien;
    }

    /**
     * Un marché : à Almadies, deux annonces en ligne (5 000 et 9 000 XOF/m²) et une disparue (dernier prix 7 000/m², présente
     * 8 jours) ; le doublon de la première (20 000/m²) ne compte pas ; à Mermoz, une annonce publiée. Un bien public à Almadies.
     */
    private function semerLeMarche(): void
    {
        $this->annonceur = RadarAdvertiser::query()->create([
            'phone' => '+221740000001',
            'phone_hmac' => RadarPhone::hmac('+221740000001'),
            'display_name' => 'Annonceur fictif',
            'nature' => RadarAdvertiserNature::ProbableIntermediary,
        ]);
        // Un passage par site, incomplet : il n'est là que parce qu'un instantané est toujours écrit par un passage.
        $this->passages = [
            'expat_dakar' => $this->passage('2026-09-30 08:00:00', finDeListe: false)->id,
            'coinafrique' => $this->passage('2026-09-30 08:00:00', finDeListe: false, site: RadarSourceSite::Coinafrique)->id,
        ];
        $almadies = ['geo_neighborhood_id' => $this->almadies->id, 'crawl_run_id' => $this->passages['expat_dakar']];

        $a = $this->annonceCollectee(['radar_advertiser_id' => $this->annonceur->id, 'raw_text' => 'Texte fictif A']);
        $this->instantane($a, '2026-10-01 08:00:00', '2026-10-29 08:00:00', $almadies + ['price' => 500000, 'surface_m2' => 100]);

        $b = $this->annonceCollectee(['radar_advertiser_id' => $this->annonceur->id]);
        $this->instantane($b, '2026-10-02 08:00:00', '2026-10-29 08:00:00', $almadies + ['price' => 900000, 'surface_m2' => 100]);

        $disparue = $this->annonceCollectee(['radar_advertiser_id' => $this->annonceur->id]);
        $this->instantane($disparue, '2026-10-10 08:00:00', '2026-10-14 08:00:00', $almadies + ['price' => 600000, 'surface_m2' => 100]);
        $this->instantane($disparue, '2026-10-14 08:00:00', '2026-10-18 08:00:00', $almadies + ['price' => 700000, 'surface_m2' => 100]);
        $disparue->forceFill(['source_gone_at' => '2026-10-19 08:00:00'])->save();

        $doublon = $this->annonceCollectee(['stage' => RadarListingStage::Duplicate, 'duplicate_of_listing_id' => $a->id], RadarSourceSite::Coinafrique);
        $this->instantane($doublon, '2026-10-01 08:00:00', '2026-10-29 08:00:00', ['crawl_run_id' => $this->passages['coinafrique']] + $almadies + ['price' => 2000000, 'surface_m2' => 100]);

        $this->bienPublie = $this->bienPublicA($this->mermoz);
        $publiee = $this->annonceCollectee(['stage' => RadarListingStage::Published, 'property_id' => $this->bienPublie->id]);
        $this->instantane($publiee, '2026-10-05 08:00:00', '2026-10-29 08:00:00', ['geo_neighborhood_id' => $this->mermoz->id, 'crawl_run_id' => $this->passages['expat_dakar'], 'price' => 400000, 'surface_m2' => 80]);

        $this->bienPublicA($this->almadies);
        // Un bien privé ne compte pas au catalogue.
        $prive = Property::factory()->draft()->create(['contract_type' => 'rent', 'type' => 'apartment']);
        Address::factory()->create(['addressable_type' => $prive->getMorphClass(), 'addressable_id' => $prive->id, 'geo_neighborhood_id' => $this->almadies->id]);
    }

    private function observer(array $sections = RadarObservatory::SECTIONS, array $filtres = []): array
    {
        return app(RadarObservatory::class)->compute($sections, $filtres);
    }

    /** AC6 — le prix au m² : médiane et quartiles du DERNIER instantané de chaque annonce, doublons exclus. */
    public function test_le_prix_au_m2_lit_le_dernier_instantane_sans_les_doublons(): void
    {
        $this->semerLeMarche();

        $lignes = collect($this->observer(['price_per_m2'])['price_per_m2']);
        $almadies = $lignes->firstWhere('neighborhood.id', $this->almadies->id);

        $this->assertSame(3, $almadies['listings']);
        $this->assertSame(7000, $almadies['median_xof_per_m2']);
        $this->assertSame(6000, $almadies['p25_xof_per_m2']);
        $this->assertSame(8000, $almadies['p75_xof_per_m2']);
        $this->assertSame(['apartment', 'rent', 'monthly'], [$almadies['property_type'], $almadies['contract'], $almadies['rent_period']]);
        $this->assertSame('Almadies', $almadies['neighborhood']['name']);
        $this->assertSame(5000, $lignes->firstWhere('neighborhood.id', $this->mermoz->id)['median_xof_per_m2']);
    }

    /** Le temps de mise sur le marché : la présence des seules annonces dont la disparition est constatée. */
    public function test_le_temps_de_mise_sur_le_marche_ne_lit_que_les_disparitions_constatees(): void
    {
        $this->semerLeMarche();

        $almadies = collect($this->observer(['time_on_market'])['time_on_market'])->firstWhere('neighborhood.id', $this->almadies->id);

        $this->assertSame(1, $almadies['gone']);
        $this->assertSame(2, $almadies['online']);
        $this->assertSame(8.0, $almadies['median_days']);
    }

    /** AC6 — l'écart d'offre : en ligne et hors catalogue, contre les biens publics du quartier. */
    public function test_l_ecart_d_offre_compare_le_radar_au_catalogue_public(): void
    {
        $this->semerLeMarche();

        $ecart = collect($this->observer(['supply_gap'])['supply_gap']);

        $this->assertSame(['id' => $this->almadies->id, 'name' => 'Almadies'], $ecart->first()['neighborhood']);
        $this->assertSame(['radar_online' => 2, 'catalog_public' => 1, 'gap' => 1], array_slice($ecart->first(), 1));
        // L'annonce publiée est au catalogue : Mermoz n'a que son bien.
        $this->assertSame(['radar_online' => 0, 'catalog_public' => 1, 'gap' => -1], array_slice($ecart->firstWhere('neighborhood.id', $this->mermoz->id), 1));
    }

    /** Le résumé, les natures et les filtres serveur. */
    public function test_le_resume_les_natures_et_les_filtres(): void
    {
        $this->semerLeMarche();

        $tout = $this->observer(['summary', 'natures']);
        $this->assertSame(['listings' => 4, 'online' => 3, 'gone' => 1, 'in_catalog' => 1, 'sites' => ['expat_dakar']], $tout['summary']);
        $this->assertSame(['probable_owner' => 0, 'probable_intermediary' => 1, 'agency' => 0, 'unknown' => 0], $tout['natures']);

        $this->assertSame(0, $this->observer(['summary'], ['contract' => 'sale'])['summary']['listings']);
        $this->assertSame(1, $this->observer(['summary'], ['neighborhood_id' => $this->mermoz->id])['summary']['listings']);
        // Vue depuis le 20 octobre, l'annonce disparue le 18 sort du marché.
        $this->assertSame(3, $this->observer(['summary'], ['since' => $this->instant('2026-10-20')])['summary']['listings']);
        $this->assertSame(0, $this->observer(['summary'], ['source_site' => 'coinafrique'])['summary']['listings']);
    }

    /**
     * AC1 — les agrégats du marché calculés avant la purge sont identiques après : ils ne lisent rien de ce qu'elle efface.
     * La purge DÉTACHE les instantanés (TCK-2392) : le marché compte ces lignes sans annonce, une par annonce purgée.
     */
    public function test_les_agregats_du_marche_survivent_a_la_purge(): void
    {
        $this->semerLeMarche();
        $avant = $this->observer(self::SECTIONS_ANONYMES);

        // L'annonceur dit STOP, et 90 jours passent : ses annonces jamais publiées sont purgées, son numéro et son nom effacés.
        $this->annonceur->forceFill(['do_not_contact_at' => now()])->save();
        $this->travelTo('2027-02-15 12:00:00');
        $comptes = app(RadarPurger::class)->run();

        $this->assertGreaterThanOrEqual(3, $comptes['listings']);
        $this->assertSame(0, RadarListing::query()->whereNotNull('raw_text')->where('stage', RadarListingStage::Purged->value)->count());
        $this->assertNull($this->annonceur->refresh()->phone);
        // Trois annonces purgées hors doublon, une ligne détachée chacune ; le doublon n'en laisse aucune.
        $this->assertSame(3, RadarListingSnapshot::query()->whereNull('radar_listing_id')->count());
        $this->assertSame($avant, $this->observer(self::SECTIONS_ANONYMES));
    }

    /**
     * Une annonce purgée laisse au marché son dernier état connu, en une ligne : son dernier prix, toute sa présence, sa
     * disparition si elle était constatée, et le catalogue si elle était le doublon d'un bien. Le doublon d'une autre
     * annonce ne laisse rien : le marché ne le comptait pas.
     */
    public function test_une_annonce_purgee_laisse_une_ligne_au_dernier_etat_connu(): void
    {
        $run = $this->passage('2026-09-30 08:00:00', finDeListe: false)->id;
        $quartier = ['geo_neighborhood_id' => $this->almadies->id, 'crawl_run_id' => $run, 'surface_m2' => 100];
        $bien = $this->bienPublicA($this->mermoz);

        $disparue = $this->annonceCollectee(['purge_at' => '2026-10-29 00:00:00']);
        $this->instantane($disparue, '2026-10-10 08:00:00', '2026-10-14 08:00:00', $quartier + ['price' => 600000, 'observations' => 2]);
        $this->instantane($disparue, '2026-10-14 08:00:00', '2026-10-18 08:00:00', $quartier + ['price' => 700000, 'observations' => 3]);
        $disparue->forceFill(['source_gone_at' => '2026-10-19 08:00:00'])->save();
        $auCatalogue = $this->annonceCollectee(['purge_at' => '2026-10-29 00:00:00', 'stage' => RadarListingStage::Duplicate, 'duplicate_of_property_id' => $bien->id]);
        $this->instantane($auCatalogue, '2026-10-12 08:00:00', '2026-10-28 08:00:00', $quartier + ['price' => 800000]);
        $doublon = $this->annonceCollectee(['purge_at' => '2026-10-29 00:00:00', 'stage' => RadarListingStage::Duplicate, 'duplicate_of_listing_id' => $disparue->id]);
        $this->instantane($doublon, '2026-10-10 08:00:00', '2026-10-18 08:00:00', $quartier + ['price' => 2000000]);
        $avant = $this->observer(self::SECTIONS_ANONYMES);

        $comptes = app(RadarPurger::class)->run();

        $this->assertSame(3, $comptes['listings']);
        $this->assertSame(2, $comptes['snapshots_detached']);
        $lignes = RadarListingSnapshot::query()->whereNull('radar_listing_id')->orderBy('first_seen_at')->get();
        $this->assertCount(2, $lignes);
        $this->assertEquals(700000, $lignes[0]->price);
        $this->assertTrue($lignes[0]->first_seen_at->equalTo($this->instant('2026-10-10 08:00:00')));
        $this->assertTrue($lignes[0]->last_seen_at->equalTo($this->instant('2026-10-18 08:00:00')));
        $this->assertSame(5, $lignes[0]->observations);
        $this->assertTrue($lignes[0]->detached_gone_at->equalTo($this->instant('2026-10-19 08:00:00')));
        $this->assertFalse($lignes[0]->detached_in_catalog);
        $this->assertNull($lignes[1]->detached_gone_at);
        $this->assertTrue($lignes[1]->detached_in_catalog);
        $this->assertSame(0, RadarListingSnapshot::query()->whereNotNull('radar_listing_id')->count());

        $this->assertSame($avant, $this->observer(self::SECTIONS_ANONYMES));
        $this->assertSame(['listings' => 2, 'online' => 1, 'gone' => 1, 'in_catalog' => 1, 'sites' => ['expat_dakar']], $this->observer(['summary'])['summary']);
    }

    /** AC1 — aucune requête des sections du marché ne nomme une colonne personnelle. */
    public function test_aucune_requete_du_marche_ne_lit_une_colonne_personnelle(): void
    {
        $this->semerLeMarche();
        $requetes = [];
        DB::listen(function ($requete) use (&$requetes): void {
            $requetes[] = $requete->sql;
        });

        $this->observer(RadarObservatory::SECTIONS);

        $this->assertNotEmpty($requetes);
        foreach ($requetes as $sql) {
            foreach (self::COLONNES_PERSONNELLES as $colonne) {
                $this->assertDoesNotMatchRegularExpression('/\b'.$colonne.'\b/', $sql, "L'observatoire lit `{$colonne}` : {$sql}");
            }
        }
    }

    /** AC7 (côté API) — la route sert les sections demandées par `fields[radar_observatory]`, filtrées par le serveur. */
    public function test_la_route_sert_les_sections_demandees(): void
    {
        $this->semerLeMarche();
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $reponse = $this->getJson('/api/admin/radar/observatory?fields[radar_observatory]=summary,supply_gap&filter[contract]=rent')->assertOk();

        $this->assertSame(['summary', 'supply_gap'], array_keys($reponse->json('data')));
        $this->assertSame(4, $reponse->json('data.summary.listings'));

        // Une valeur en liste vaut absente (ADR-0075) ; une valeur unique invalide est refusée.
        $this->getJson('/api/admin/radar/observatory?fields[radar_observatory]=summary&filter[contract][]=sale')
            ->assertOk()->assertJsonPath('data.summary.listings', 4);
        $this->getJson('/api/admin/radar/observatory?filter[contract]=lease')->assertUnprocessable();
    }

    /** La source disparue d'un bien est listée, avec son bien. */
    public function test_les_sources_disparues_de_biens_sont_listees(): void
    {
        $this->semerLeMarche();
        $publiee = RadarListing::query()->where('property_id', $this->bienPublie->id)->sole();
        $publiee->forceFill(['source_gone_at' => '2026-10-29 10:00:00'])->save();

        $sources = $this->observer(['gone_sources'])['gone_sources'];

        $this->assertCount(1, $sources);
        $this->assertSame($publiee->id, $sources[0]['listing_id']);
        $this->assertSame('2026-10-29T10:00:00+00:00', $sources[0]['gone_at']);
        $this->assertSame(['id' => $this->bienPublie->id, 'title' => $this->bienPublie->title, 'public' => true], $sources[0]['property']);
    }

    /** La route est fermée à qui n'opère pas le Radar. */
    public function test_la_route_est_gardee(): void
    {
        $this->getJson('/api/admin/radar/observatory')->assertUnauthorized();
    }
}
