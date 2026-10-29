<?php

namespace Tests\Feature\Radar;

use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\MediaFingerprint;
use App\Models\Property;
use App\Models\RadarConsent;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Services\Billing\QuotaResolver;
use App\Services\Radar\HostResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
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

    /**
     * Le chemin entier, sans rien écrire à la main dans la réserve : l'accord confirmé met la lecture des photos en file
     * (file synchrone : le job tourne), la réserve se remplit, la publication copie ce que le job a rangé. Chaque pièce a son
     * test ; celui-ci tient que les trois se recollent (revue finale, m3).
     */
    public function test_de_l_accord_confirme_a_la_publication_les_photos_lues_deviennent_celles_du_bien(): void
    {
        Http::preventStrayRequests();
        $this->app->instance(HostResolver::class, new class implements HostResolver
        {
            public function resolve(string $host): array
            {
                return str_ends_with($host, '.cdn.test') ? ['93.184.216.34'] : [];
            }
        });
        Http::fake([
            '*/robots.txt' => Http::response('', 404),
            'https://a.cdn.test/p/1.jpg' => Http::response(self::jpeg(100), 200, ['Content-Type' => 'image/jpeg']),
            'https://b.cdn.test/p/2.jpg' => Http::response(self::jpeg(140), 200, ['Content-Type' => 'image/jpeg']),
        ]);
        $annonce = RadarListing::factory()
            ->extracted(['neighborhood' => ['neighborhood_id' => $this->quartier->id]])
            ->create([
                'radar_advertiser_id' => $this->annonceur->id,
                'stage' => RadarListingStage::Contacted,
                'source_kind' => RadarSourceKind::Url,
                'source_url' => 'https://sn.coinafrique.com/annonce/4242',
                'photo_urls' => ['https://a.cdn.test/p/1.jpg', 'https://b.cdn.test/p/2.jpg'],
            ]);
        $message = RadarOutreach::factory()->withListings($annonce)->sent()->create([
            'radar_advertiser_id' => $this->annonceur->id, 'created_by_id' => $this->operateur->id, 'sent_by_id' => $this->operateur->id,
        ]);
        RadarConsent::factory()->verified([
            'classification' => 'consent', 'confidence' => 'high', 'transcript' => 'Annonceur : OUI', 'reply_text' => 'OUI',
            'counterpart_phone' => self::NUMERO_ANNONCEUR, 'counterpart_name' => 'Awa Diop', 'number_matches' => true,
            'number_checked_by' => 'code', 'name_matches' => true, 'clauses_found' => [1, 2, 3, 4], 'clauses_complete' => true,
        ])->create(['radar_outreach_id' => $message->id]);
        $this->assertNull($annonce->photo_preparation);

        $this->postJson("/api/admin/radar/outreaches/{$message->id}/outcome", ['outcome' => 'consented'])->assertOk();

        $annonce->refresh();
        $this->assertSame(RadarListingStage::Consented, $annonce->stage);
        $this->assertSame(['status' => 'done', 'total' => 2, 'done' => 2], $annonce->photoPreparationStatus(), 'le job a rempli la réserve');

        $id = $this->publier([$annonce->id])->assertCreated()->json('data.properties.0.id');

        $photos = Property::query()->findOrFail($id)->getMedia('photos');
        $this->assertCount(2, $photos);
        $this->assertSame(
            $annonce->getMedia('radar_photos')->pluck('file_name')->all(),
            $photos->pluck('file_name')->all(),
        );
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

    /**
     * La couverture suit l'annonce source : les photos lues passent dans l'ordre des éléments de `photo_preparation` (celui de
     * `photo_urls`), même si l'une d'elles a été retentée après coup et rangée en dernier ; les photos déposées suivent.
     */
    public function test_les_photos_lues_passent_dans_l_ordre_des_elements_puis_les_deposees(): void
    {
        $annonce = $this->annonceConsentie(photos: 3);
        [$m0, $m1, $m2] = $annonce->getMedia('radar_photos')->all();
        // Rangées dans l'ordre m0, m1 ; mais la première URL de la source est celle de m1 (retentée après coup). m2 est déposée.
        $annonce->forceFill(['photo_preparation' => [
            ['url' => 'https://a.cdn.test/p/premiere.jpg', 'media_id' => $m1->id],
            ['url' => 'https://a.cdn.test/p/seconde.jpg', 'media_id' => $m0->id],
        ], 'photo_urls' => ['https://a.cdn.test/p/premiere.jpg', 'https://a.cdn.test/p/seconde.jpg']])->save();

        $apercu = $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publication-preview")->assertOk()->json('data.listings.0.photos');
        $this->assertSame([$m1->id, $m0->id, $m2->id], array_column($apercu, 'id'));

        $id = $this->publier([$annonce->id])->assertCreated()->json('data.properties.0.id');

        $this->assertSame(
            [$m1->file_name, $m0->file_name, $m2->file_name],
            Property::query()->findOrFail($id)->getMedia('photos')->pluck('file_name')->all(),
        );
    }

    /** @return array{prive: list<string>, public: list<string>} tous les fichiers des deux disques de médias */
    private function fichiers(): array
    {
        return [
            'prive' => Storage::disk(config('media-library.disk_name'))->allFiles(),
            'public' => Storage::disk(config('media-library.public_disk_name'))->allFiles(),
        ];
    }

    /**
     * Une publication défaite ne laisse AUCUN fichier : ni l'original, ni la vignette synchrone (disque public) des photos déjà
     * copiées. La transaction rend les lignes, jamais les fichiers.
     */
    public function test_une_copie_qui_echoue_au_milieu_ne_laisse_aucun_fichier_ni_ligne(): void
    {
        $annonce = $this->annonceConsentie(photos: 2);
        [, $seconde] = $annonce->getMedia('radar_photos')->all();
        Storage::disk($seconde->disk)->delete($seconde->getPathRelativeToRoot());
        $avant = $this->fichiers();
        $biens = Property::query()->count();
        $medias = Media::query()->where('collection_name', 'photos')->count();

        // Le fichier de la réserve a disparu du disque : la seconde copie lève, la transaction se défait.
        $reponse = $this->publier([$annonce->id]);
        $this->assertGreaterThanOrEqual(400, $reponse->getStatusCode(), $reponse->getContent());

        $this->assertSame($avant, $this->fichiers(), 'ni original, ni vignette, sur aucun des deux disques');
        $this->assertSame($biens, Property::query()->count());
        $this->assertSame($medias, Media::query()->where('collection_name', 'photos')->count());
        $this->assertSame(RadarListingStage::Consented, $annonce->fresh()->stage);
    }

    /** Le quota se juge avant chaque bien : la seconde annonce refusée défait la première, vignette comprise. */
    public function test_le_quota_de_la_seconde_annonce_defait_la_premiere_et_ses_fichiers(): void
    {
        $a = $this->annonceConsentie();
        $b = $this->annonceConsentie();
        $appels = 0;
        $this->partialMock(QuotaResolver::class, function ($mock) use (&$appels) {
            $mock->shouldReceive('assertCanCreateActiveListing')->andReturnUsing(function () use (&$appels) {
                if (++$appels > 1) {
                    abort_code(422, 'quota.listings_exceeded');
                }
            });
        });
        $avant = $this->fichiers();
        $biens = Property::query()->count();

        $this->publier([$a->id, $b->id])->assertStatus(422)->assertJsonPath('code', 'quota.listings_exceeded');

        $this->assertSame(2, $appels, 'le quota est lu avant chaque bien');
        $this->assertSame($avant, $this->fichiers());
        $this->assertSame($biens, Property::query()->count());
        $this->assertSame(RadarListingStage::Consented, $a->fresh()->stage);
    }

    /** Les propriétés de la réserve (URL du site tiers, origine, empreinte) ne passent pas sur la photo publique (ADR-0077 §9). */
    public function test_les_proprietes_de_la_reserve_ne_passent_pas_sur_la_photo_publique(): void
    {
        $annonce = $this->annonceConsentie(photos: 1);
        $annonce->getMedia('radar_photos')->first()
            ->setCustomProperty('source_url', 'https://sn.coinafrique.com/x')->setCustomProperty('origin', 'fetched')->setCustomProperty('sha256', 'abc')->save();

        $id = $this->publier([$annonce->id])->assertCreated()->json('data.properties.0.id');

        $photo = Property::query()->findOrFail($id)->getMedia('photos')->first();
        foreach (['source_url', 'origin', 'sha256'] as $cle) {
            $this->assertFalse($photo->hasCustomProperty($cle), "{$cle} reste dans la réserve");
        }
    }
}
