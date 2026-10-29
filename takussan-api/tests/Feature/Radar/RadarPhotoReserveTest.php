<?php

namespace Tests\Feature\Radar;

use App\Jobs\Radar\PrepareRadarListingPhotos;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarOutreachOutcome;
use App\Models\Enums\RadarSourceKind;
use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Models\User;
use App\Services\Radar\RadarConsentWorkflow;
use App\Services\Radar\RadarPhotoReserve;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2389 (décision 3a) — la réserve de photos d'une annonce `consented` : remplie après l'accord confirmé
 * (le job `PrepareRadarListingPhotos`, relancé à la main) ou à la main (dépôt), jamais avant. Les images sont
 * réencodées (l'EXIF, position comprise, ne survit pas) et rangées sur le disque PRIVÉ.
 */
class RadarPhotoReserveTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    private User $operateur;

    private RadarAdvertiser $annonceur;

    protected function setUp(): void
    {
        parent::setUp();
        $this->operateur = $this->agirEnOperateur(PlatformProfileLevel::Support);
        $this->annonceur = RadarAdvertiser::factory()->create();
        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/claim")->assertOk();
    }

    // --- Outils ------------------------------------------------------------------------------------

    /** @param  array<string, mixed>  $surcharge */
    private function annonce(array $surcharge = []): RadarListing
    {
        return RadarListing::factory()->extracted()->create($surcharge + [
            'radar_advertiser_id' => $this->annonceur->id,
            'stage' => RadarListingStage::Consented,
            'source_kind' => RadarSourceKind::Url,
            'source_url' => 'https://sn.coinafrique.com/annonce/42',
            'photo_urls' => ['https://a.cdn.test/p/1.png', 'https://b.cdn.test/p/2.png'],
        ]);
    }

    private function deposer(RadarListing $annonce, array $fichiers): TestResponse
    {
        return $this->post("/api/admin/radar/listings/{$annonce->id}/photos", ['photos' => $fichiers], ['Accept' => 'application/json']);
    }

    private static function jpegGeolocalise(): string
    {
        $image = imagecreatetruecolor(16, 12);
        imagefill($image, 0, 0, (int) imagecolorallocate($image, 168, 83, 50));
        ob_start();
        imagejpeg($image);
        $jpeg = (string) ob_get_clean();

        // IFD0 : `GPSInfo` (0x8825) pointe l'IFD GPS, qui porte `GPSLatitudeRef` = « N ».
        $tiff = "II*\x00".pack('V', 8)
            .pack('v', 1).pack('vvVV', 0x8825, 4, 1, 8 + 2 + 12 + 4).pack('V', 0)
            .pack('v', 1).pack('vvV', 0x0001, 2, 2)."N\x00\x00\x00".pack('V', 0);
        $charge = "Exif\x00\x00".$tiff;

        return substr($jpeg, 0, 2)."\xFF\xE1".pack('n', strlen($charge) + 2).$charge.substr($jpeg, 2);
    }

    private static function gif(): string
    {
        $image = imagecreatetruecolor(10, 10);
        ob_start();
        imagegif($image);

        return (string) ob_get_clean();
    }

    /** @return array<string, mixed> */
    private static function exif(string $octets): array
    {
        $fichier = tempnam(sys_get_temp_dir(), 'exif');
        file_put_contents($fichier, $octets);
        try {
            $lu = @exif_read_data($fichier);

            return is_array($lu) ? $lu : [];
        } finally {
            unlink($fichier);
        }
    }

    // --- Le service : lire, réencoder, ranger ------------------------------------------------------

    public function test_encode_retire_l_exif_et_garde_le_type(): void
    {
        $original = self::jpegGeolocalise();
        $this->assertSame('N', self::exif($original)['GPSLatitudeRef'] ?? null, 'le témoin doit porter une balise GPS lisible');

        $sortie = app(RadarPhotoReserve::class)->encode($original);

        $this->assertSame('image/jpeg', $sortie['mime']);
        $this->assertStringNotContainsString("Exif\x00\x00", $sortie['bytes']);
        $this->assertArrayNotHasKey('GPSLatitudeRef', self::exif($sortie['bytes']));
        $this->assertNotFalse(imagecreatefromstring($sortie['bytes']));
    }

    public function test_un_gif_est_reencode_en_jpeg(): void
    {
        $sortie = app(RadarPhotoReserve::class)->encode(self::gif());

        $this->assertSame('image/jpeg', $sortie['mime']);
        $this->assertSame(IMAGETYPE_JPEG, getimagesizefromstring($sortie['bytes'])[2]);
    }

    public function test_encode_refuse_l_illisible_et_le_demesure_sans_decoder(): void
    {
        $this->assertSame(['error' => RadarPhotoReserve::ERROR_UNREADABLE], app(RadarPhotoReserve::class)->encode('pas une image'));

        config(['radar.photos.max_pixels' => 50]);
        $this->assertSame(['error' => RadarPhotoReserve::ERROR_TOO_LARGE], app(RadarPhotoReserve::class)->encode(self::jpegGeolocalise()));
    }

    public function test_store_range_sur_le_disque_prive_avec_son_origine(): void
    {
        $annonce = $this->annonce();
        $sortie = app(RadarPhotoReserve::class)->encode(self::jpegGeolocalise());

        $media = app(RadarPhotoReserve::class)->store($annonce, $sortie['bytes'], $sortie['mime'], 'fetched', 'https://a.cdn.test/p/1.png');

        $this->assertSame('radar_photos', $media->collection_name);
        $this->assertSame(config('media-library.disk_name'), $media->disk);
        $this->assertNotSame(config('media-library.public_disk_name'), $media->disk);
        $this->assertSame('fetched', $media->getCustomProperty('origin'));
        $this->assertSame('https://a.cdn.test/p/1.png', $media->getCustomProperty('source_url'));
        $this->assertSame(hash('sha256', $sortie['bytes']), $media->getCustomProperty('sha256'));
        $this->assertTrue(Storage::disk($media->disk)->exists($media->getPathRelativeToRoot()));
    }

    // --- La mise en file à la confirmation de l'accord ---------------------------------------------

    public function test_confirmer_un_accord_met_le_job_en_file_pour_une_annonce_url_et_pas_pour_un_texte(): void
    {
        Queue::fake();
        $url = $this->annonce(['stage' => RadarListingStage::Contacted]);
        $texte = $this->annonce(['stage' => RadarListingStage::Contacted, 'source_kind' => RadarSourceKind::Text, 'source_url' => null, 'photo_urls' => []]);
        $message = RadarOutreach::factory()->withListings($url, $texte)->sent()->create([
            'radar_advertiser_id' => $this->annonceur->id, 'created_by_id' => $this->operateur->id, 'sent_by_id' => $this->operateur->id,
        ]);
        RadarConsent::factory()->create(['radar_outreach_id' => $message->id]);

        app(RadarConsentWorkflow::class)->recordOutcome($message, RadarOutreachOutcome::Consented, 'Lu sur la capture.', $this->operateur);

        $this->assertSame(RadarListingStage::Consented, $url->fresh()->stage);
        Queue::assertPushed(PrepareRadarListingPhotos::class, 1);
        Queue::assertPushed(PrepareRadarListingPhotos::class, fn (PrepareRadarListingPhotos $job) => $job->listingId === $url->id);
    }

    // --- Le dépôt ------------------------------------------------------------------------------------

    public function test_le_depot_range_les_photos_reencodees_et_journalise(): void
    {
        $annonce = $this->annonce();

        $this->deposer($annonce, [
            UploadedFile::fake()->createWithContent('a.jpg', self::jpegGeolocalise()),
            UploadedFile::fake()->image('b.png', 20, 20),
        ])->assertCreated()
            ->assertJsonCount(2, 'data.reserve_photos')
            ->assertJsonPath('data.reserve_photos.0.id', $annonce->getMedia('radar_photos')->first()->id);

        $medias = $annonce->fresh()->getMedia('radar_photos');
        $this->assertCount(2, $medias);
        $this->assertSame('uploaded', $medias[0]->getCustomProperty('origin'));
        $this->assertNull($medias[0]->getCustomProperty('source_url'));
        $stocke = (string) stream_get_contents($medias[0]->stream());
        $this->assertStringNotContainsString("Exif\x00\x00", $stocke);
        $this->assertArrayNotHasKey('GPSLatitudeRef', self::exif($stocke));

        $ligne = Activity::query()->where('event', 'radar_listing_photos')->sole();
        $this->assertSame($this->operateur->id, $ligne->causer_id);
        $this->assertSame($annonce->id, $ligne->subject_id);
        $this->assertSame('upload', $ligne->properties['action']);
        $this->assertSame($medias->pluck('id')->all(), $ligne->properties['media_ids']);
    }

    public function test_une_image_illisible_refuse_tout_l_envoi_sans_rien_ecrire(): void
    {
        $annonce = $this->annonce();

        $this->deposer($annonce, [
            UploadedFile::fake()->image('a.png', 20, 20),
            UploadedFile::fake()->createWithContent('b.jpg', "\xFF\xD8\xFF\xE0 tronquée"),
        ])->assertStatus(422);

        $this->assertSame(0, $annonce->media()->count());
        $this->assertSame([], Storage::disk(config('media-library.disk_name'))->allFiles());
    }

    public function test_une_image_demesuree_est_refusee_avant_decodage(): void
    {
        $annonce = $this->annonce();
        config(['radar.photos.max_pixels' => 100]);

        $this->deposer($annonce, [UploadedFile::fake()->image('a.png', 40, 40)])
            ->assertStatus(422)
            ->assertJsonPath('code', 'radar.photo.too_large');

        $this->assertSame(0, $annonce->media()->count());
    }

    public function test_la_reserve_pleine_refuse_le_depot(): void
    {
        config(['radar.photos.reserve_max' => 2]);
        $annonce = $this->annonce();
        $this->deposer($annonce, [UploadedFile::fake()->image('a.png', 20, 20)])->assertCreated();

        $this->deposer($annonce, [UploadedFile::fake()->image('b.png', 20, 20), UploadedFile::fake()->image('c.png', 20, 20)])
            ->assertStatus(422)
            ->assertJsonPath('code', 'radar.photo.reserve_full');

        $this->assertSame(1, $annonce->media()->count());
        $this->deposer($annonce, [UploadedFile::fake()->image('b.png', 20, 20)])->assertCreated();
    }

    public function test_un_depot_sans_fichier_ou_trop_de_fichiers_rend_422(): void
    {
        $annonce = $this->annonce();

        $this->postJson("/api/admin/radar/listings/{$annonce->id}/photos", [])->assertStatus(422);
        $onze = array_map(fn (int $i) => UploadedFile::fake()->image("p{$i}.png", 10, 10), range(1, 11));
        $this->deposer($annonce, $onze)->assertStatus(422);
        $this->deposer($annonce, [UploadedFile::fake()->create('a.pdf', 10, 'application/pdf')])->assertStatus(422);
    }

    public function test_une_annonce_qui_n_est_pas_consented_refuse_depot_et_relance(): void
    {
        $annonce = $this->annonce(['stage' => RadarListingStage::Reviewed]);

        $this->deposer($annonce, [UploadedFile::fake()->image('a.png', 20, 20)])
            ->assertStatus(409)->assertJsonPath('code', 'radar.listing.stage_conflict');
        $this->postJson("/api/admin/radar/listings/{$annonce->id}/photos/fetch")
            ->assertStatus(409)->assertJsonPath('code', 'radar.listing.stage_conflict');
        $this->assertSame(0, $annonce->media()->count());
    }

    public function test_sans_prise_en_charge_de_l_annonceur_409(): void
    {
        $annonce = $this->annonce();
        $this->deleteJson("/api/admin/radar/advertisers/{$this->annonceur->id}/claim")->assertNoContent();

        $this->deposer($annonce, [UploadedFile::fake()->image('a.png', 20, 20)])
            ->assertStatus(409)->assertJsonPath('code', 'radar.advertiser.claim_required');
        $this->postJson("/api/admin/radar/listings/{$annonce->id}/photos/fetch")
            ->assertStatus(409)->assertJsonPath('code', 'radar.advertiser.claim_required');
        $this->assertSame(0, $annonce->media()->count());
    }

    public function test_le_viewer_ne_prepare_rien(): void
    {
        $annonce = $this->annonce();
        $media = $annonce->addMediaFromString(self::gif())->usingFileName('p.gif')->toMediaCollection('radar_photos');
        $this->actingAsWithStepUp($this->operateur(PlatformProfileLevel::Viewer));

        $this->deposer($annonce, [UploadedFile::fake()->image('a.png', 20, 20)])->assertForbidden();
        $this->postJson("/api/admin/radar/listings/{$annonce->id}/photos/fetch")->assertForbidden();
        $this->deleteJson("/api/admin/radar/listings/{$annonce->id}/photos/{$media->id}")->assertForbidden();
        $this->assertNotNull($media->fresh());
    }

    // --- Le retrait ----------------------------------------------------------------------------------

    public function test_le_retrait_supprime_le_media_et_le_fichier(): void
    {
        $annonce = $this->annonce();
        $this->deposer($annonce, [UploadedFile::fake()->image('a.png', 20, 20)])->assertCreated();
        $media = $annonce->fresh()->getFirstMedia('radar_photos');
        $chemin = $media->getPathRelativeToRoot();
        $this->assertTrue(Storage::disk($media->disk)->exists($chemin));

        $this->deleteJson("/api/admin/radar/listings/{$annonce->id}/photos/{$media->id}")->assertNoContent();

        $this->assertSame(0, $annonce->media()->count());
        $this->assertFalse(Storage::disk($media->disk)->exists($chemin));
        $ligne = Activity::query()->where('event', 'radar_listing_photos')->latest('id')->firstOrFail();
        $this->assertSame('delete', $ligne->properties['action']);
        $this->assertSame([$media->id], $ligne->properties['media_ids']);
    }

    public function test_le_retrait_sans_prise_en_charge_409(): void
    {
        $annonce = $this->annonce();
        $media = $annonce->addMediaFromString(self::gif())->usingFileName('p.gif')->toMediaCollection('radar_photos');
        $this->deleteJson("/api/admin/radar/advertisers/{$this->annonceur->id}/claim")->assertNoContent();

        $this->deleteJson("/api/admin/radar/listings/{$annonce->id}/photos/{$media->id}")
            ->assertStatus(409)->assertJsonPath('code', 'radar.advertiser.claim_required');

        $this->assertNotNull($media->fresh());
    }

    /** Le journal échoue : la transaction se défait, la ligne du média revient — avec son fichier. */
    public function test_un_retrait_defait_ne_laisse_pas_une_ligne_sans_son_fichier(): void
    {
        $annonce = $this->annonce();
        $this->deposer($annonce, [UploadedFile::fake()->image('a.png', 20, 20)])->assertCreated();
        $media = $annonce->fresh()->getFirstMedia('radar_photos');
        $chemin = $media->getPathRelativeToRoot();
        \App\Models\Activity::creating(fn () => throw new \RuntimeException('journal indisponible'));

        $this->withoutExceptionHandling();
        try {
            $this->deleteJson("/api/admin/radar/listings/{$annonce->id}/photos/{$media->id}");
            $this->fail('Le journal aurait dû échouer.');
        } catch (\RuntimeException $e) {
            $this->assertSame('journal indisponible', $e->getMessage());
        }

        $this->assertNotNull($media->fresh());
        $this->assertTrue(Storage::disk($media->disk)->exists($chemin));
    }

    public function test_retirer_le_media_d_une_autre_annonce_ou_d_une_autre_collection_rend_404(): void
    {
        $annonce = $this->annonce();
        $autre = $this->annonce();
        $this->deposer($autre, [UploadedFile::fake()->image('a.png', 20, 20)])->assertCreated();
        $dAutrui = $autre->fresh()->getFirstMedia('radar_photos');
        $capture = $annonce->addMediaFromString(self::gif())->usingFileName('c.gif')->toMediaCollection('radar_captures');

        $this->deleteJson("/api/admin/radar/listings/{$annonce->id}/photos/{$dAutrui->id}")->assertNotFound();
        $this->deleteJson("/api/admin/radar/listings/{$annonce->id}/photos/{$capture->id}")->assertNotFound();

        $this->assertNotNull($dAutrui->fresh());
        $this->assertNotNull($capture->fresh());
    }

    // --- La relance ----------------------------------------------------------------------------------

    public function test_la_relance_garde_ce_qui_a_reussi_retire_les_erreurs_et_remet_le_job_en_file(): void
    {
        Queue::fake();
        $annonce = $this->annonce(['photo_preparation' => [
            ['url' => 'https://a.cdn.test/p/1.png', 'media_id' => 7],
            ['url' => 'https://b.cdn.test/p/2.png', 'media_id' => null, 'error' => 'radar.fetch.timeout'],
        ]]);

        $this->postJson("/api/admin/radar/listings/{$annonce->id}/photos/fetch")
            ->assertStatus(202)
            ->assertJsonPath('data.id', $annonce->id)
            ->assertJsonPath('data.photo_preparation.status', 'pending');

        $this->assertSame([['url' => 'https://a.cdn.test/p/1.png', 'media_id' => 7]], $annonce->fresh()->photo_preparation);
        Queue::assertPushed(PrepareRadarListingPhotos::class, fn (PrepareRadarListingPhotos $job) => $job->listingId === $annonce->id);
        $ligne = Activity::query()->where('event', 'radar_listing_photos')->sole();
        $this->assertSame('fetch', $ligne->properties['action']);
    }

    public function test_la_relance_d_une_annonce_sans_url_de_photo_rend_422(): void
    {
        Queue::fake();
        $texte = $this->annonce(['source_kind' => RadarSourceKind::Text, 'source_url' => null]);
        $sansUrl = $this->annonce(['photo_urls' => []]);

        foreach ([$texte, $sansUrl] as $annonce) {
            $this->postJson("/api/admin/radar/listings/{$annonce->id}/photos/fetch")
                ->assertStatus(422)->assertJsonPath('code', 'radar.listing.no_source_photos');
        }
        Queue::assertNothingPushed();
    }

    // --- L'état --------------------------------------------------------------------------------------

    public function test_l_etat_de_la_preparation_none_pending_done(): void
    {
        $urls = ['https://a.cdn.test/p/1.png', 'https://b.cdn.test/p/2.png'];

        // Rien à préparer : une annonce-texte, une annonce-URL sans photo.
        $this->assertSame(['status' => 'none', 'total' => 0, 'done' => 0], $this->annonce(['source_kind' => RadarSourceKind::Text])->photoPreparationStatus());
        $this->assertSame(['status' => 'none', 'total' => 0, 'done' => 0], $this->annonce(['photo_urls' => []])->photoPreparationStatus());
        // Avant l'accord, rien ne se prépare : pas `pending`.
        $this->assertSame('none', $this->annonce(['stage' => RadarListingStage::Reviewed])->photoPreparationStatus()['status']);

        $this->assertSame(['status' => 'pending', 'total' => 2, 'done' => 0], $this->annonce()->photoPreparationStatus());
        $this->assertSame(
            ['status' => 'pending', 'total' => 2, 'done' => 1],
            $this->annonce(['photo_preparation' => [['url' => $urls[0], 'media_id' => 1]]])->photoPreparationStatus(),
        );
        $this->assertSame(
            ['status' => 'done', 'total' => 2, 'done' => 2],
            $this->annonce(['photo_preparation' => [['url' => $urls[0], 'media_id' => 1], ['url' => $urls[1], 'media_id' => null, 'error' => 'radar.fetch.timeout']]])->photoPreparationStatus(),
        );
        // Un compte complet reste `done`, quelle que soit l'étape ultérieure.
        $this->assertSame('done', $this->annonce([
            'stage' => RadarListingStage::DoNotContact,
            'photo_preparation' => [['url' => $urls[0], 'media_id' => 1], ['url' => $urls[1], 'media_id' => 2]],
        ])->photoPreparationStatus()['status']);
    }

    public function test_photo_preparable_exige_une_annonce_url_consented(): void
    {
        $this->assertTrue($this->annonce()->photoPreparable());
        $this->assertFalse($this->annonce(['stage' => RadarListingStage::Reviewed])->photoPreparable());
        $this->assertFalse($this->annonce(['source_kind' => RadarSourceKind::Captures])->photoPreparable());
    }

    public function test_la_fiche_rend_l_etat_et_la_reserve_avec_une_url_signee(): void
    {
        $annonce = $this->annonce();
        $this->deposer($annonce, [UploadedFile::fake()->image('a.png', 20, 20)])->assertCreated();

        $reponse = $this->getJson("/api/admin/radar/listings/{$annonce->id}")->assertOk()
            ->assertJsonPath('data.photo_preparation.status', 'pending')
            ->assertJsonCount(1, 'data.reserve_photos');

        $this->assertStringContainsString('signature=', $reponse->json('data.reserve_photos.0.url'));
    }
}
