<?php

namespace Tests\Feature\Radar;

use App\Models\RadarListing;
use App\Services\Radar\RadarMatcher;
use App\Services\Radar\RadarPurger;
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
}
