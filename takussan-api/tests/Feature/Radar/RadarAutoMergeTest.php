<?php

namespace Tests\Feature\Radar;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarCrawlStatus;
use App\Models\Enums\RadarCrawlTrigger;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\Enums\RadarSourceSite;
use App\Models\GeoNeighborhood;
use App\Models\RadarCrawlRun;
use App\Models\RadarListing;
use App\Models\RadarListingSnapshot;
use App\Models\User;
use App\Services\Radar\RadarAutoMerge;
use App\Support\PhotoFingerprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2392 (AC3, AC7) — la fusion automatique des doublons entre sites, et sa séparation.
 *
 * La même maison vue sur Expat-Dakar puis sur CoinAfrique : la seconde, trouvée par la collecte, devient le doublon de la
 * première, et la fiche montre deux provenances. Le numéro de téléphone n'est pas éprouvé ici : un numéro fictif
 * (`+221 74 …`) ne se lit pas comme sénégalais, et ce signal désigne l'annonceur, pas le bien.
 */
class RadarAutoMergeTest extends TestCase
{
    use OperateursPlateforme, RefreshDatabase;

    /** Un hash non dégénéré (pas d'aplat), déterministe. */
    private const HASH = 0x5A3C_96E1_0F2B_74D8;

    private const DESCRIPTION = 'Villa fictive de quatre pièces avec jardin arboré, garage couvert et terrasse sur le toit, au calme.';

    private User $operator;

    private RadarCrawlRun $run;

    private GeoNeighborhood $quartier;

    protected function setUp(): void
    {
        parent::setUp();

        $this->freezeSecond();
        $this->operator = $this->operateur(PlatformProfileLevel::SuperAdmin);
        $this->run = RadarCrawlRun::query()->create([
            'site' => RadarSourceSite::Coinafrique->value,
            'trigger' => RadarCrawlTrigger::Schedule->value,
            'status' => RadarCrawlStatus::Finished->value,
            'operator_id' => $this->operator->id,
        ]);
        $this->quartier = GeoNeighborhood::factory()->create();
    }

    private function merge(): RadarAutoMerge
    {
        return $this->app->make(RadarAutoMerge::class);
    }

    private static function photo(int $hash): array
    {
        [$b0, $b1, $b2, $b3] = PhotoFingerprint::bands($hash);

        return ['url' => 'https://cdn.test/p.jpg', 'hash' => $hash, 'b0' => $b0, 'b1' => $b1, 'b2' => $b2, 'b3' => $b3];
    }

    /**
     * Une annonce-URL lue, de ce site. Par défaut : aucun signal (ni quartier rattaché, ni photo, ni description longue).
     *
     * @param  array<string, mixed>  $extracted
     * @param  array<string, mixed>  $attributes
     */
    private function annonce(RadarSourceSite $site, array $extracted = [], array $attributes = []): RadarListing
    {
        static $n = 0;
        $n++;

        return RadarListing::factory()->extracted($extracted + [
            'phones' => [],
            'description' => ['value' => 'Courte description '.$n],
        ])->create($attributes + [
            'source_kind' => RadarSourceKind::Url,
            'source_site' => $site,
            'source_url' => "https://annonces.test/{$site->value}/{$n}",
            'raw_text' => "Annonce {$n}",
            'content_fingerprint' => hash('sha256', "annonce-{$n}"),
            'photo_urls' => [],
        ]);
    }

    /** Les deux photos ont la même empreinte, calculée. */
    private function avecPhoto(): array
    {
        return ['photo_urls' => ['https://cdn.test/p.jpg'], 'source_photo_hashes' => [self::photo(self::HASH)]];
    }

    private function trouveeParLaCollecte(array $attributes = []): array
    {
        return $attributes + ['discovered_by_run_id' => $this->run->id];
    }

    // ── AC3 ───────────────────────────────────────────────────────────────────────────────────

    public function test_ac3_la_meme_maison_sur_deux_sites_fait_une_fiche_a_deux_provenances(): void
    {
        $fiche = $this->annonce(RadarSourceSite::ExpatDakar, [], $this->avecPhoto());
        $vue = $this->annonce(RadarSourceSite::Coinafrique, [], $this->trouveeParLaCollecte($this->avecPhoto()));
        RadarListingSnapshot::query()->create([
            'radar_listing_id' => $vue->id, 'crawl_run_id' => $this->run->id, 'price' => 450000,
            'first_seen_at' => now()->subDay(), 'last_seen_at' => now(), 'observations' => 2,
        ]);

        $this->assertSame(1, $this->merge()->sweep(now()));

        $vue->refresh();
        $this->assertSame(RadarListingStage::Duplicate, $vue->stage);
        $this->assertSame($fiche->id, $vue->duplicate_of_listing_id);
        $this->assertSame(RadarAutoMerge::REASON, $vue->stage_reason);
        $this->assertTrue($vue->merged_at->equalTo(now()));
        $this->assertNotEmpty($vue->matches, 'Les rapprochements sont figés, comme pour un doublon posé à la main.');
        $this->assertSame(RadarListingStage::Extracted, $fiche->fresh()->stage);

        $this->agirEnOperateur(PlatformProfileLevel::Support);
        $provenances = $this->getJson("/api/admin/radar/listings/{$fiche->id}")->assertOk()->json('data.provenances');
        $this->assertCount(2, $provenances);
        $this->assertSame([$fiche->id, $vue->id], array_column($provenances, 'listing_id'));
        $this->assertSame(['expat_dakar', 'coinafrique'], array_column($provenances, 'source_site'));
        $this->assertSame([true, false], array_column($provenances, 'is_root'));
        $this->assertNull($provenances[0]['merged_at']);
        $this->assertNotNull($provenances[1]['merged_at']);
        $this->assertTrue($provenances[1]['crawled']);
        $this->assertEquals(450000, $provenances[1]['last_price']);
        $this->assertNotNull($provenances[1]['first_seen_at']);

        // Ouverte depuis le doublon, la fiche rend les mêmes provenances.
        $depuisLeDoublon = $this->getJson("/api/admin/radar/listings/{$vue->id}")->assertOk()->json('data.provenances');
        $this->assertSame([$fiche->id, $vue->id], array_column($depuisLeDoublon, 'listing_id'));
    }

    public function test_ac3_le_lieu_et_le_texte_ensemble_suffisent(): void
    {
        // Le lieu seul est un signal moyen : c'est le texte, second signal, qui rend le rapprochement fort.
        $lieu = [
            'neighborhood' => ['neighborhood_id' => $this->quartier->id],
            'price' => ['value' => 450000],
            'bedrooms' => ['value' => 3],
            'description' => ['value' => self::DESCRIPTION],
        ];

        $fiche = $this->annonce(RadarSourceSite::ExpatDakar, $lieu);
        $vue = $this->annonce(RadarSourceSite::Coinafrique, $lieu, $this->trouveeParLaCollecte());

        $this->assertSame(1, $this->merge()->sweep(now()));
        $this->assertSame($fiche->id, $vue->fresh()->duplicate_of_listing_id);
    }

    public function test_le_texte_seul_ne_fusionne_pas_il_designe_l_annonceur(): void
    {
        $texte = ['description' => ['value' => self::DESCRIPTION]];
        $this->annonce(RadarSourceSite::ExpatDakar, $texte);
        $vue = $this->annonce(RadarSourceSite::Coinafrique, $texte, $this->trouveeParLaCollecte());

        $this->assertSame(0, $this->merge()->sweep(now()));
        $vue->refresh();
        $this->assertSame(RadarListingStage::Extracted, $vue->stage);
        $this->assertNotNull($vue->merge_checked_at, 'Une annonce n\'est jugée qu\'une fois.');
    }

    public function test_deux_annonces_du_meme_site_restent_a_l_operateur(): void
    {
        $this->annonce(RadarSourceSite::Coinafrique, [], $this->avecPhoto());
        $vue = $this->annonce(RadarSourceSite::Coinafrique, [], $this->trouveeParLaCollecte($this->avecPhoto()));

        $this->assertSame(0, $this->merge()->sweep(now()));
        $this->assertSame(RadarListingStage::Extracted, $vue->fresh()->stage);
    }

    public function test_une_saisie_d_operateur_n_est_jamais_fusionnee_d_office(): void
    {
        $this->annonce(RadarSourceSite::ExpatDakar, [], $this->avecPhoto());
        $saisie = $this->annonce(RadarSourceSite::Coinafrique, [], $this->avecPhoto());

        $this->assertSame(0, $this->merge()->sweep(now()));
        $saisie->refresh();
        $this->assertSame(RadarListingStage::Extracted, $saisie->stage);
        $this->assertNull($saisie->merge_checked_at);
    }

    public function test_une_fiche_ecartee_ne_fait_pas_foi(): void
    {
        $this->annonce(RadarSourceSite::ExpatDakar, [], $this->avecPhoto() + ['stage' => RadarListingStage::Discarded]);
        $vue = $this->annonce(RadarSourceSite::Coinafrique, [], $this->trouveeParLaCollecte($this->avecPhoto()));

        $this->assertSame(0, $this->merge()->sweep(now()));
        $this->assertSame(RadarListingStage::Extracted, $vue->fresh()->stage);
    }

    public function test_la_configuration_eteint_la_fusion_sans_rien_juger(): void
    {
        config(['radar.merge.auto' => false]);
        $this->annonce(RadarSourceSite::ExpatDakar, [], $this->avecPhoto());
        $vue = $this->annonce(RadarSourceSite::Coinafrique, [], $this->trouveeParLaCollecte($this->avecPhoto()));

        $this->assertSame(0, $this->merge()->sweep(now()));
        $this->assertNull($vue->fresh()->merge_checked_at);
    }

    public function test_les_empreintes_en_cours_font_attendre_une_heure_au_plus(): void
    {
        $this->annonce(RadarSourceSite::ExpatDakar, [], $this->avecPhoto());
        $vue = $this->annonce(RadarSourceSite::Coinafrique, [], $this->trouveeParLaCollecte([
            'photo_urls' => ['https://cdn.test/p.jpg', 'https://cdn.test/q.jpg'],
            'source_photo_hashes' => [self::photo(self::HASH)],
        ]));

        $this->assertSame(0, $this->merge()->sweep(now()));
        $this->assertNull($vue->fresh()->merge_checked_at, 'Une photo reste à calculer : on attend.');

        $this->travel(61)->minutes();
        $this->assertSame(1, $this->merge()->sweep(now()));
        $this->assertSame(RadarListingStage::Duplicate, $vue->fresh()->stage);
    }

    // ── AC7 ───────────────────────────────────────────────────────────────────────────────────

    public function test_ac7_l_operateur_separe_une_fusion_automatique_et_elle_n_est_pas_retentee(): void
    {
        $fiche = $this->annonce(RadarSourceSite::ExpatDakar, [], $this->avecPhoto());
        $vue = $this->annonce(RadarSourceSite::Coinafrique, [], $this->trouveeParLaCollecte($this->avecPhoto()));
        $this->merge()->sweep(now());

        $operateur = $this->agirEnOperateur(PlatformProfileLevel::Support);
        $response = $this->postJson("/api/admin/radar/listings/{$vue->id}/unmerge")->assertOk();

        $this->assertSame('extracted', $response->json('data.stage'));
        $this->assertNull($response->json('data.duplicate_of_listing_id'));
        $vue->refresh();
        $this->assertSame(RadarListingStage::Extracted, $vue->stage);
        $this->assertNull($vue->merged_at);
        $this->assertNull($vue->stage_reason);
        $this->assertDatabaseHas('activity_log', [
            'event' => 'radar_listing_unmerged', 'subject_id' => $vue->id, 'causer_id' => $operateur->id,
        ]);

        $this->assertSame(0, $this->merge()->sweep(now()));
        $this->assertSame(RadarListingStage::Extracted, $vue->fresh()->stage);
        $this->assertCount(1, $this->getJson("/api/admin/radar/listings/{$fiche->id}")->json('data.provenances'));
    }

    public function test_ac7_un_doublon_pose_a_la_main_ne_se_separe_pas_par_cette_route(): void
    {
        $fiche = $this->annonce(RadarSourceSite::ExpatDakar);
        $doublon = $this->annonce(RadarSourceSite::Coinafrique);
        $this->agirEnOperateur(PlatformProfileLevel::Support);
        $this->postJson("/api/admin/radar/listings/{$doublon->id}/duplicate", ['of_listing_id' => $fiche->id])->assertOk();

        $this->postJson("/api/admin/radar/listings/{$doublon->id}/unmerge")
            ->assertStatus(409)
            ->assertJsonPath('code', 'radar.merge.not_automatic');
        $this->assertSame(RadarListingStage::Duplicate, $doublon->fresh()->stage);
    }
}
