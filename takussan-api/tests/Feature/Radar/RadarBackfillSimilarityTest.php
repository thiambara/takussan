<?php

namespace Tests\Feature\Radar;

use App\Models\Enums\RadarListingStage;
use App\Models\RadarListing;
use App\Support\RadarSimilarityText;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-2392 (ADR-0080) — `radar:backfill-similarity` : les annonces saisies avant la colonne `similarity_text` n'ont pas
 * de texte comparé, et le quatrième signal ne les voit pas tant que leur lecture ne change pas. La commande le calcule
 * par lots, par la même règle que le modèle, sans toucher à `updated_at` (rien de l'annonce n'a changé).
 */
class RadarBackfillSimilarityTest extends TestCase
{
    use RefreshDatabase;

    private const DESCRIPTION = 'Appartement fictif de trois chambres, salon spacieux, cuisine équipée, gardien et parking, '
        .'proche de la corniche. Visite sur rendez-vous.';

    public function test_la_commande_calcule_le_texte_compare_des_annonces_anciennes_et_d_elles_seules(): void
    {
        $this->freezeSecond();
        $ancienne = RadarListing::factory()->extracted(['description' => ['value' => self::DESCRIPTION]])->create();
        $brute = RadarListing::factory()->create();
        $recente = RadarListing::factory()->extracted()->create();
        $purgee = RadarListing::factory()->create();
        RadarListing::query()->whereKey([$ancienne->id, $brute->id])->update(['similarity_text' => null]);
        RadarListing::query()->whereKey($purgee->id)->update(['similarity_text' => null, 'raw_text' => null, 'extracted' => null, 'stage' => RadarListingStage::Purged->value]);
        $avant = $recente->fresh()->similarity_text;
        $this->travel(1)->hours();

        $this->artisan('radar:backfill-similarity', ['--chunk' => 1])
            ->expectsOutputToContain('radar:backfill-similarity — 2 annonce(s) complétée(s).')
            ->assertSuccessful();

        $this->assertSame(RadarSimilarityText::fold(self::DESCRIPTION), $ancienne->fresh()->similarity_text);
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
