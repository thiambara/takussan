<?php

namespace Tests\Feature\Property;

use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-618 (contrainte 1) — un titre sans lettre latine garde un slug lisible.
 *
 * `Str::slug()` rend `''` pour un titre fait d'émojis, d'idéogrammes ou de tirets : le slug devenait
 * `-XXXXXX`. Le repli `bien-XXXXXX` ne vaut qu'à la CRÉATION — aucun slug existant ne change, faute
 * de mécanisme de redirection d'un ancien slug.
 */
class PropertySlugFallbackTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{string}> */
    public static function titresSansLettreLatine(): array
    {
        return [
            'émojis' => ['🏠🌴'],
            'idéogrammes' => ['北京公寓'],
            'tirets' => ['---'],
        ];
    }

    #[DataProvider('titresSansLettreLatine')]
    public function test_le_slug_commence_par_une_lettre(string $titre): void
    {
        $property = Property::factory()->create(['title' => $titre, 'slug' => null]);

        $this->assertMatchesRegularExpression('/^[a-z][a-z0-9-]*-[A-Za-z0-9]{6}$/', (string) $property->slug);
    }

    public function test_un_titre_latin_garde_son_slug(): void
    {
        $property = Property::factory()->create(['title' => 'Villa Mermoz', 'slug' => null]);

        $this->assertMatchesRegularExpression('/^villa-mermoz-[A-Za-z0-9]{6}$/', (string) $property->slug);
    }

    public function test_un_slug_existant_sans_prefixe_ne_change_pas_a_la_modification(): void
    {
        $property = Property::factory()->create(['title' => '🏠🌴', 'slug' => '-AbC123']);

        $property->update(['description' => 'Une autre description']);

        $this->assertSame('-AbC123', $property->refresh()->slug);
    }
}
