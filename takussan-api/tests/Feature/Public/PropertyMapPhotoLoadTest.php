<?php

namespace Tests\Feature\Public;

use App\Models\Address;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\TestCase;

/**
 * TCK-902 (P01.10) — la carte publique ne charge que la photo qu'elle affiche.
 *
 * `PropertyMapGeoJsonResource` ne lit que `getFirstMedia('photos')` pour la vignette. Le
 * contrôleur chargeait `with('media')` : toutes les photos de chacun des 501 biens au plus, et
 * les médias des autres collections. Le test compte les médias hydratés, et vérifie que la
 * vignette reste la première photo dans l'ordre de la galerie (`order_column`).
 */
class PropertyMapPhotoLoadTest extends TestCase
{
    use RefreshDatabase;

    private const URL = '/api/public/properties/map?bounds=14.0,-18.0,15.0,-17.0';

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake(config('media-library.disk_name'));
        Storage::fake(config('media-library.public_disk_name'));
    }

    /** Un bien public sur la carte, avec trois photos dont la troisième est mise en tête. */
    private function bienAvecTroisPhotos(): Media
    {
        $property = Property::factory()->published()->create();
        Address::create([
            'addressable_type' => Property::class,
            'addressable_id' => $property->id,
            'city' => 'Dakar',
            'country' => 'SN',
            'latitude' => 14.7,
            'longitude' => -17.5,
        ]);

        $photos = [];
        foreach (['photo-alpha.jpg', 'photo-beta.jpg', 'photo-gamma.jpg'] as $nom) {
            $photos[] = $property->addMedia(UploadedFile::fake()->image($nom))->toMediaCollection('photos');
        }
        Media::setNewOrder([$photos[2]->id, $photos[0]->id, $photos[1]->id]);

        return $photos[2];
    }

    public function test_la_carte_ne_charge_que_la_premiere_photo_de_chaque_bien(): void
    {
        $premieres = [$this->bienAvecTroisPhotos(), $this->bienAvecTroisPhotos()];

        $hydrates = 0;
        Event::listen('eloquent.retrieved: '.Media::class, function () use (&$hydrates) {
            $hydrates++;
        });

        $response = $this->getJson(self::URL)->assertOk()->assertJsonCount(2, 'features');

        $this->assertSame(2, $hydrates, "{$hydrates} médias chargés pour 2 biens à trois photos");

        foreach ($response->json('features') as $feature) {
            $attendue = collect($premieres)->first(fn (Media $m) => $m->model_id === $feature['properties']['id']);
            $this->assertNotNull($feature['properties']['thumbnail']);
            $this->assertStringContainsString(
                pathinfo($attendue->file_name, PATHINFO_FILENAME),
                $feature['properties']['thumbnail'],
                'la vignette est la première photo de la galerie',
            );
        }
    }
}
