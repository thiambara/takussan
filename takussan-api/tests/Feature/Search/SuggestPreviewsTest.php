<?php

namespace Tests\Feature\Search;

use App\Models\Enums\PropertyStatus;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\Concerns\BuildsSearchSuggestions;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-2474 — les trois biens de la suggestion : publics seulement, dans l'ordre de la liste, avec la photo publique
 * (jamais l'original) — sans interprétation, ceux de la saisie en plein texte.
 */
class SuggestPreviewsTest extends TestCase
{
    use BuildsSearchSuggestions;
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private string $url = '/api/search/suggest';

    public function test_sans_interpretation_les_trois_premiers_biens_du_plein_texte(): void
    {
        foreach (range(1, 4) as $i) {
            $this->publishedIn('Dakar', 'Mermoz', ['title' => "Penthouse panoramique {$i}"]);
        }
        $this->publishedIn('Dakar', 'Mermoz', ['title' => 'Penthouse panoramique brouillon', 'status' => PropertyStatus::Draft, 'published_at' => null]);
        $this->indexProperties();
        $this->buildSuggestions();

        $data = $this->getJson($this->url.'?q=panoramique')->assertOk()->json('data');

        $this->assertNull($data['interpretation']);
        $this->assertCount(3, $data['previews']);
        $liste = $this->getJson('/api/public/properties/search?q=panoramique&placements=false&per_page=3')->json('data');
        $this->assertSame(array_column($liste, 'id'), array_column($data['previews'], 'id'), 'l\'ordre de la liste');
        $this->assertStringNotContainsString('brouillon', json_encode($data['previews']));
    }

    public function test_la_forme_d_un_bien_et_sa_photo_publique(): void
    {
        $avecPhoto = $this->publishedIn('Dakar', 'Mermoz', [
            'title' => 'Penthouse panoramique', 'price' => 450000, 'contract_type' => 'rent', 'rent_period' => RentPeriod::Monthly,
        ]);
        $media = $this->photo($avecPhoto, ['thumbnail' => true, 'preview' => true, 'full' => true]);
        $sansConversion = $this->publishedIn('Dakar', 'Mermoz', ['title' => 'Duplex panoramique']);
        $this->photo($sansConversion, []);
        $this->indexProperties();
        $this->buildSuggestions();

        $previews = collect($this->getJson($this->url.'?q=panoramique')->json('data.previews'))->keyBy('id');

        $this->assertSame([
            'id' => $avecPhoto->id,
            'slug' => $avecPhoto->slug,
            'title' => 'Penthouse panoramique',
            'price' => 450000,
            'rent_period' => 'monthly',
            'contract_type' => 'rent',
            'neighborhood' => 'Mermoz',
            'city' => 'Dakar',
            'photo_url' => $media->getUrl('thumbnail'),
        ], $previews[$avecPhoto->id]);
        $this->assertNotSame($media->getUrl(), $previews[$avecPhoto->id]['photo_url'], 'jamais l\'original');
        $this->assertNull($previews[$sansConversion->id]['photo_url'], 'une photo sans conversion produite n\'a rien à montrer');
    }

    /** @param  array<string, bool>  $conversions */
    private function photo(Property $property, array $conversions): Media
    {
        $id = DB::table('media')->insertGetId([
            'model_type' => Property::class, 'model_id' => $property->id, 'uuid' => (string) Str::uuid(),
            'collection_name' => 'photos', 'name' => 'p', 'file_name' => 'p.jpg', 'mime_type' => 'image/jpeg',
            'disk' => config('media-library.public_disk_name'), 'conversions_disk' => config('media-library.public_disk_name'),
            'size' => 1, 'manipulations' => '[]', 'custom_properties' => '[]',
            'generated_conversions' => json_encode((object) $conversions), 'responsive_images' => '[]', 'order_column' => 1,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return Media::query()->findOrFail($id);
    }
}
