<?php

namespace Tests\Feature\Radar;

use App\Models\Enums\RadarListingStage;
use App\Models\RadarListing;
use App\Services\Radar\RadarMatcher;
use App\Services\Radar\RadarPurger;
use App\Support\RadarSimilarityText;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-2392 (AC6) — le quatrième signal de rapprochement, la similarité de texte, sans fournisseur d'embeddings : le pilote
 * `trigram` (`pg_trgm`) sur `similarity_text`. Les trois autres signaux sont neutralisés (aucun téléphone, aucun quartier
 * rattaché, aucune empreinte de photo).
 */
class RadarTextSignalTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeTime();
    }

    private const DESCRIPTION = 'Bel appartement fictif au troisième étage, salon double très lumineux, cuisine équipée, '
        .'deux chambres avec placards, terrasse donnant sur la mer, gardien et parking en sous-sol.';

    private function listing(string $description, array $attributes = []): RadarListing
    {
        return RadarListing::factory()->extracted([
            'phones' => [],
            'description' => ['value' => $description],
        ])->create($attributes);
    }

    /** @return array<int, array<string, mixed>> les rapprochements avec d'autres annonces, par identifiant */
    private function listingMatches(RadarListing $listing): array
    {
        $out = [];
        foreach ($this->app->make(RadarMatcher::class)->matchesFor($listing->fresh()) as $match) {
            if ($match['kind'] === 'listing') {
                $out[$match['id']] = $match;
            }
        }

        return $out;
    }

    public function test_deux_annonces_au_meme_texte_se_rapprochent_par_le_signal_text(): void
    {
        $other = $this->listing(self::DESCRIPTION);
        // Le même texte, recopié sur un autre site avec un autre prix et un numéro : les chiffres ne comptent pas.
        $source = $this->listing(str_replace('troisième', 'troisième (tel 74 000 00 02)', self::DESCRIPTION).' Prix 450 000.');

        $matches = $this->listingMatches($source);

        $this->assertArrayHasKey($other->id, $matches);
        $this->assertSame(['text'], array_column($matches[$other->id]['signals'], 'signal'));
        $this->assertSame('medium', $matches[$other->id]['signals'][0]['strength']);
        $this->assertGreaterThanOrEqual(0.8, $matches[$other->id]['signals'][0]['similarity']);
    }

    public function test_un_texte_different_ne_rapproche_rien(): void
    {
        $this->listing('Terrain fictif viabilisé en zone résidentielle calme, titre foncier disponible, accès goudronné, '
            .'proche de la route nationale et des écoles du quartier.');
        $source = $this->listing(self::DESCRIPTION);

        $this->assertSame([], $this->listingMatches($source));
    }

    public function test_le_texte_compare_ne_garde_aucun_chiffre_et_suit_la_lecture(): void
    {
        $listing = $this->listing(self::DESCRIPTION.' Appelez le 74 000 00 03.');

        $this->assertNotNull($listing->similarity_text);
        $this->assertDoesNotMatchRegularExpression('/\d/', $listing->similarity_text);

        // Une description trop courte : le texte brut prend le relais.
        $listing->forceFill(['extracted' => ['description' => ['value' => 'Court.']], 'raw_text' => self::DESCRIPTION])->save();
        $this->assertStringStartsWith('bel appartement fictif', (string) $listing->fresh()->similarity_text);
    }

    public function test_la_purge_vide_le_texte_compare(): void
    {
        $listing = $this->listing(self::DESCRIPTION, ['purge_at' => now()->subDay()]);
        $this->assertNotNull($listing->similarity_text);

        $this->app->make(RadarPurger::class)->run();

        $this->assertNull($listing->fresh()->similarity_text);
    }

    private const DESCRIPTION_ANCIENNE = 'Appartement fictif de trois chambres, salon spacieux, cuisine équipée, gardien et parking, '
        .'proche de la corniche. Visite sur rendez-vous.';

    /**
     * TCK-2392 (ADR-0080, ex-`RadarBackfillSimilarityTest`, versé par TCK-3017) — `radar:backfill-similarity` : les
     * annonces saisies avant la colonne `similarity_text` n'ont pas de texte comparé, et ce signal ne les voit pas tant
     * que leur lecture ne change pas. La commande le calcule par lots, par la même règle que le modèle, sans toucher à
     * `updated_at`.
     */
    public function test_la_commande_calcule_le_texte_compare_des_annonces_anciennes_et_d_elles_seules(): void
    {
        $this->freezeSecond();
        $ancienne = RadarListing::factory()->extracted(['description' => ['value' => self::DESCRIPTION_ANCIENNE]])->create();
        // Le texte brut est fixé : la fabrique tire un `paragraph()` qui passe parfois sous MIN_CHARS (60),
        // et `of()` rend alors null — l'annonce n'est pas complétée et le compte tombe à 1, au hasard.
        $brute = RadarListing::factory()->create(['raw_text' => 'Villa fictive à vendre aux Almadies, quatre chambres, piscine, jardin arboré, titre foncier.']);
        $recente = RadarListing::factory()->extracted()->create();
        $purgee = RadarListing::factory()->create();
        RadarListing::query()->whereKey([$ancienne->id, $brute->id])->update(['similarity_text' => null]);
        RadarListing::query()->whereKey($purgee->id)->update(['similarity_text' => null, 'raw_text' => null, 'extracted' => null, 'stage' => RadarListingStage::Purged->value]);
        $avant = $recente->fresh()->similarity_text;
        $this->travel(1)->hours();

        $this->artisan('radar:backfill-similarity', ['--chunk' => 1])
            ->expectsOutputToContain('radar:backfill-similarity — 2 annonce(s) complétée(s).')
            ->assertSuccessful();

        $this->assertSame(RadarSimilarityText::fold(self::DESCRIPTION_ANCIENNE), $ancienne->fresh()->similarity_text);
        $this->assertNotNull($brute->fresh()->similarity_text, 'Sans description, le texte brut.');
        $this->assertSame(RadarSimilarityText::of(null, $brute->raw_text), $brute->fresh()->similarity_text);
        $this->assertSame($avant, $recente->fresh()->similarity_text);
        $this->assertNull($purgee->fresh()->similarity_text, 'Une annonce purgée n\'a plus de texte à comparer.');
        $this->assertTrue($ancienne->fresh()->updated_at->equalTo($ancienne->updated_at), 'Rien de l\'annonce n\'a changé.');

        $this->artisan('radar:backfill-similarity')
            ->expectsOutputToContain('radar:backfill-similarity — 0 annonce(s) complétée(s).')
            ->assertSuccessful();
    }
}
