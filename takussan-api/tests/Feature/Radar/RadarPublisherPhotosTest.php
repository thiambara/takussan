<?php

namespace Tests\Feature\Radar;

use App\Models\MediaFingerprint;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\Support\FixturesDePublicationRadar;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2389 — les photos de la réserve passent dans la collection `photos` du bien : copiées dans l'ordre, avec leurs
 * conversions, et leur empreinte (ADR-0054) calculée comme pour toute photo ajoutée à un bien.
 */
class RadarPublisherPhotosTest extends TestCase
{
    use FixturesDePublicationRadar;
    use OperateursPlateforme;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerLaPublication();
    }

    private function publier(array $ids)
    {
        return $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publish", ['listing_ids' => $ids]);
    }

    public function test_une_reserve_vide_refuse_la_publication(): void
    {
        $annonce = $this->annonceConsentie(photos: 0);

        $this->publier([$annonce->id])->assertStatus(422)->assertJsonPath('code', 'radar.publish.no_photo');

        $this->assertSame(0, Property::query()->count());
    }

    public function test_les_photos_de_la_reserve_deviennent_celles_du_bien_avec_leur_empreinte(): void
    {
        $annonce = $this->annonceConsentie(photos: 2);
        $reserve = $annonce->getMedia('radar_photos');

        $id = $this->publier([$annonce->id])->assertCreated()->json('data.properties.0.id');

        $bien = Property::query()->findOrFail($id);
        $photos = $bien->getMedia('photos');
        $this->assertCount(2, $photos);
        $this->assertSame($reserve->pluck('file_name')->all(), $photos->pluck('file_name')->all(), 'dans l\'ordre de la réserve');
        foreach ($photos as $i => $photo) {
            $this->assertSame('photos', $photo->collection_name);
            $this->assertNotSame(config('media-library.public_disk_name'), $photo->disk, 'l\'original reste sur le disque privé');
            $this->assertTrue(Storage::disk($photo->disk)->exists($photo->getPathRelativeToRoot()));
            $this->assertSame(
                hash('sha256', (string) Storage::disk($reserve[$i]->disk)->get($reserve[$i]->getPathRelativeToRoot())),
                hash('sha256', (string) Storage::disk($photo->disk)->get($photo->getPathRelativeToRoot())),
            );
            $this->assertSame(1, MediaFingerprint::query()->where('media_id', $photo->id)->where('property_id', $bien->id)->count(), 'empreinte calculée (file sync)');
        }
        // La réserve garde ses photos : la copie ne les déplace pas.
        $this->assertCount(2, $annonce->fresh()->getMedia('radar_photos'));
    }
}
