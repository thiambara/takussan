<?php

namespace Tests\Feature\Radar;

use App\Ai\Agents\RadarExtraction;
use App\Models\Enums\RadarAdvertiserNature;
use App\Models\Enums\RadarConfidence;
use App\Models\Enums\RadarDiscardReason;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\Enums\RadarSourceSite;
use App\Models\Property;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** TCK-2386 (ADR-0077 §1, §7, §9) — les tables du Radar, leurs enums et leur purge à 90 jours. */
class RadarModelsTest extends TestCase
{
    use RefreshDatabase;

    public function test_l_empreinte_de_contenu_est_unique(): void
    {
        RadarListing::factory()->create(['content_fingerprint' => str_repeat('a', 64)]);

        $this->expectException(QueryException::class);
        RadarListing::factory()->create(['content_fingerprint' => str_repeat('a', 64)]);
    }

    public function test_purge_at_est_pose_a_la_creation_a_plus_90_jours(): void
    {
        $this->travelTo(now()->startOfSecond());

        $listing = RadarListing::factory()->create();

        $this->assertTrue($listing->fresh()->purge_at->equalTo(now()->addDays(90)));
    }

    public function test_un_purge_at_explicite_est_respecte(): void
    {
        $this->travelTo(now()->startOfSecond());
        $date = now()->addDays(5);

        $listing = RadarListing::factory()->create(['purge_at' => $date]);

        $this->assertTrue($listing->fresh()->purge_at->equalTo($date));
    }

    public function test_les_captures_vont_sur_le_disque_prive(): void
    {
        $private = config('media-library.disk_name');
        $public = config('media-library.public_disk_name');
        Storage::fake($private);
        Storage::fake($public);

        $media = RadarListing::factory()->create()
            ->addMedia(UploadedFile::fake()->image('capture.jpg'))
            ->toMediaCollection('radar_captures');

        $this->assertNotSame($public, $private);
        $this->assertSame($private, $media->disk);
        Storage::disk($private)->assertExists($media->getPathRelativeToRoot());
        Storage::disk($public)->assertMissing($media->getPathRelativeToRoot());
    }

    public function test_from_host_reconnait_les_sites_sources(): void
    {
        $this->assertSame(RadarSourceSite::Coinafrique, RadarSourceSite::fromHost('coinafrique.com'));
        $this->assertSame(RadarSourceSite::Coinafrique, RadarSourceSite::fromHost('sn.coinafrique.com'));
        $this->assertSame(RadarSourceSite::ExpatDakar, RadarSourceSite::fromHost('expat-dakar.com'));
        $this->assertSame(RadarSourceSite::ExpatDakar, RadarSourceSite::fromHost('www.expat-dakar.com'));
        $this->assertSame(RadarSourceSite::Facebook, RadarSourceSite::fromHost('facebook.com'));
        $this->assertSame(RadarSourceSite::Facebook, RadarSourceSite::fromHost('m.facebook.com'));
        $this->assertSame(RadarSourceSite::Facebook, RadarSourceSite::fromHost('fb.com'));
        $this->assertSame(RadarSourceSite::Whatsapp, RadarSourceSite::fromHost('wa.me'));
        $this->assertSame(RadarSourceSite::Whatsapp, RadarSourceSite::fromHost('whatsapp.com'));
        $this->assertSame(RadarSourceSite::Other, RadarSourceSite::fromHost('example.org'));
        $this->assertSame(RadarSourceSite::Other, RadarSourceSite::fromHost('notcoinafrique.com'));
        $this->assertSame(RadarSourceSite::Other, RadarSourceSite::fromHost('coinafrique.com.evil.test'));
        $this->assertSame(RadarSourceSite::Coinafrique, RadarSourceSite::fromHost('SN.CoinAfrique.COM'));
    }

    public function test_les_enums_portent_leurs_valeurs(): void
    {
        $this->assertSame(
            ['captured', 'extracted', 'reviewed', 'contacted', 'consented', 'published', 'extraction_failed', 'duplicate', 'discarded', 'refused', 'do_not_contact', 'purged'],
            array_map(fn ($c) => $c->value, RadarListingStage::cases()),
        );
        $this->assertSame(['url', 'text', 'captures'], array_map(fn ($c) => $c->value, RadarSourceKind::cases()));
        $this->assertSame(['probable_owner', 'probable_intermediary', 'agency', 'unknown'], array_map(fn ($c) => $c->value, RadarAdvertiserNature::cases()));
        $this->assertSame(['high', 'medium', 'low'], array_map(fn ($c) => $c->value, RadarConfidence::cases()));
        $this->assertSame(RadarConfidence::Low, RadarConfidence::lowest());
        $this->assertSame(
            ['not_real_estate', 'out_of_scope', 'no_longer_available', 'unusable_source', 'other'],
            array_map(fn ($c) => $c->value, RadarDiscardReason::cases()),
        );
        $this->assertSame('radar.discard.out_of_scope', RadarDiscardReason::OutOfScope->code());
    }

    public function test_les_gestes_de_l_operateur_se_lisent_sur_l_etape(): void
    {
        $etapes = fn (string $geste) => array_values(array_map(
            fn (RadarListingStage $s) => $s->value,
            array_filter(RadarListingStage::cases(), fn (RadarListingStage $s) => $s->{$geste}()),
        ));

        $this->assertSame(['extracted'], $etapes('allowsCorrection'));
        $this->assertSame(['extracted'], $etapes('allowsReview'));
        $this->assertSame(['captured', 'extracted', 'reviewed', 'extraction_failed'], $etapes('allowsClosing'));
        $this->assertSame(['extracted', 'reviewed'], $etapes('allowsAdvertiserChange'));
    }

    public function test_la_contrainte_refuse_un_doublon_de_deux_natures_a_la_fois(): void
    {
        $original = RadarListing::factory()->create();
        $bien = Property::factory()->create();

        $seul = RadarListing::factory()->create(['duplicate_of_listing_id' => $original->id]);
        $this->assertTrue($seul->fresh()->duplicateOfListing->is($original));
        $autre = RadarListing::factory()->create(['duplicate_of_property_id' => $bien->id]);
        $this->assertTrue($autre->fresh()->duplicateOfProperty->is($bien));

        // La contrainte CHECK vit en base : une transaction abandonnée ne se poursuit pas, on s'arrête là.
        $this->expectException(QueryException::class);
        $this->expectExceptionMessage('radar_listings_dup_one_chk');
        RadarListing::factory()->create(['duplicate_of_listing_id' => $original->id, 'duplicate_of_property_id' => $bien->id]);
    }

    public function test_les_cles_de_doublon_se_vident_avec_leur_cible(): void
    {
        $original = RadarListing::factory()->create();
        $bien = Property::factory()->create();
        $a = RadarListing::factory()->create(['duplicate_of_listing_id' => $original->id]);
        $b = RadarListing::factory()->create(['duplicate_of_property_id' => $bien->id]);

        $original->delete();
        $bien->forceDelete();

        $this->assertNull($a->fresh()->duplicate_of_listing_id);
        $this->assertNull($b->fresh()->duplicate_of_property_id);
    }

    public function test_les_empreintes_gardent_un_entier_64_bits_signe_exact(): void
    {
        $hashes = [
            ['url' => 'https://exemple.test/a.jpg', 'hash' => PHP_INT_MIN + 1, 'b0' => 1, 'b1' => 2, 'b2' => 3, 'b3' => 4],
            ['url' => 'https://exemple.test/b.jpg', 'hash' => -1, 'b0' => 65535, 'b1' => 65535, 'b2' => 65535, 'b3' => 65535],
            ['url' => 'https://exemple.test/c.jpg', 'hash' => 0, 'b0' => 0, 'b1' => 0, 'b2' => 0, 'b3' => 0],
            ['url' => 'https://exemple.test/d.jpg', 'hash' => PHP_INT_MAX, 'b0' => 65535, 'b1' => 0, 'b2' => 65535, 'b3' => 0],
            ['url' => 'https://exemple.test/e.jpg', 'hash' => null, 'error' => 'radar.photo.too_large'],
        ];

        $listing = RadarListing::factory()->withPhotoHashes($hashes)->create();

        // jsonb ne garde pas l'ordre des clés : on compare chaque élément à clés triées, types stricts.
        $trier = function (array $liste): array {
            return array_map(function (array $e): array {
                ksort($e);

                return $e;
            }, $liste);
        };
        $relu = $listing->fresh()->source_photo_hashes;
        $this->assertSame($trier($hashes), $trier($relu));
        $this->assertIsInt($relu[0]['hash']);
        $this->assertSame(PHP_INT_MAX, $relu[3]['hash']);
    }

    public function test_les_empreintes_se_distinguent_de_jamais_calcule_a_calcule_sans_photo(): void
    {
        $this->assertNull(RadarListing::factory()->create()->fresh()->source_photo_hashes);
        $this->assertSame([], RadarListing::factory()->withPhotoHashes([])->create()->fresh()->source_photo_hashes);
    }

    public function test_l_index_gin_des_empreintes_existe_et_sert_la_recherche_par_bande(): void
    {
        $this->assertSame(1, DB::table('pg_indexes')
            ->where('tablename', 'radar_listings')->where('indexname', 'radar_listings_photo_hashes_gin')
            ->where('indexdef', 'like', '%USING gin (source_photo_hashes jsonb_path_ops)%')->count());

        RadarListing::factory()->withPhotoHashes([['url' => 'u', 'hash' => 5, 'b0' => 7, 'b1' => 8, 'b2' => 9, 'b3' => 10]])->create();
        RadarListing::factory()->withPhotoHashes([['url' => 'v', 'hash' => 6, 'b0' => 70, 'b1' => 8, 'b2' => 9, 'b3' => 10]])->create();

        $trouvees = RadarListing::query()->whereRaw('source_photo_hashes @> ?::jsonb', ['[{"b0": 7}]'])->count();
        $this->assertSame(1, $trouvees);
    }

    public function test_photo_fingerprint_status_dit_none_pending_ou_done(): void
    {
        $urls = ['https://exemple.test/1.jpg', 'https://exemple.test/2.jpg', 'https://exemple.test/3.jpg'];
        $url = fn (array $extra) => RadarListing::factory()->make($extra + ['source_kind' => RadarSourceKind::Url, 'photo_urls' => $urls]);

        // Pas d'URL de photo, ou une source qui n'est pas une URL : rien à calculer.
        $this->assertSame(['status' => 'none', 'total' => 0, 'done' => 0], RadarListing::factory()->make()->photoFingerprintStatus());
        $this->assertSame(['status' => 'none', 'total' => 0, 'done' => 0], $url(['photo_urls' => []])->photoFingerprintStatus());
        $this->assertSame(['status' => 'none', 'total' => 0, 'done' => 0], $url(['source_kind' => RadarSourceKind::Text])->photoFingerprintStatus());

        // Jamais calculé, puis à moitié, puis fini.
        $this->assertSame(['status' => 'pending', 'total' => 3, 'done' => 0], $url([])->photoFingerprintStatus());
        $deux = [['url' => $urls[0], 'hash' => 1, 'b0' => 0, 'b1' => 0, 'b2' => 0, 'b3' => 0], ['url' => $urls[1], 'hash' => null, 'error' => 'radar.photo.timeout']];
        $this->assertSame(['status' => 'pending', 'total' => 3, 'done' => 2], $url(['source_photo_hashes' => $deux])->photoFingerprintStatus());
        $trois = [...$deux, ['url' => $urls[2], 'hash' => 2, 'b0' => 0, 'b1' => 0, 'b2' => 0, 'b3' => 0]];
        $this->assertSame(['status' => 'done', 'total' => 3, 'done' => 3], $url(['source_photo_hashes' => $trois])->photoFingerprintStatus());
    }

    public function test_photo_fingerprint_status_borne_le_total_a_max_per_listing(): void
    {
        config(['radar.photos.max_per_listing' => 2]);
        $urls = ['https://exemple.test/1.jpg', 'https://exemple.test/2.jpg', 'https://exemple.test/3.jpg'];
        $listing = RadarListing::factory()->make(['source_kind' => RadarSourceKind::Url, 'photo_urls' => $urls]);

        $this->assertSame(['status' => 'pending', 'total' => 2, 'done' => 0], $listing->photoFingerprintStatus());

        $listing->source_photo_hashes = array_map(fn ($u) => ['url' => $u, 'hash' => 1, 'b0' => 0, 'b1' => 0, 'b2' => 0, 'b3' => 0], $urls);
        $this->assertSame(['status' => 'done', 'total' => 2, 'done' => 2], $listing->photoFingerprintStatus());
    }

    public function test_la_factory_extracted_rend_une_sortie_normalisee_complete(): void
    {
        $listing = RadarListing::factory()->extracted()->create()->fresh();

        $this->assertSame(RadarListingStage::Extracted, $listing->stage);
        $this->assertNotNull($listing->extracted_at);
        foreach ([...RadarExtraction::PROPERTY_FIELDS, ...RadarExtraction::ADVERTISER_FIELDS] as $champ) {
            // jsonb ne garde pas l'ordre des clés : on vérifie leur présence.
            foreach (['value', 'confidence', 'evidence', 'flags'] as $cle) {
                $this->assertArrayHasKey($cle, $listing->extracted[$champ], "$champ.$cle");
            }
        }
        $this->assertSame([], $listing->extracted['phones_dropped']);
        $this->assertIsArray($listing->extracted['phones']);
        $this->assertSame(
            450000,
            RadarListing::factory()->extracted(['price' => ['value' => 450000]])->make()->extracted['price']['value'],
        );
    }

    public function test_une_annonce_lit_ses_relations_et_ses_casts(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create();
        $advertiser = RadarAdvertiser::factory()->create();

        $listing = RadarListing::factory()->create([
            'radar_advertiser_id' => $advertiser->id,
            'captured_by' => $user->id,
            'property_id' => $property->id,
            'extracted' => ['price' => 450000],
            'photo_urls' => ['https://exemple.test/a.jpg'],
            'matches' => [['listing_id' => 3]],
        ])->fresh();

        $this->assertSame(RadarListingStage::Captured, $listing->stage);
        $this->assertSame(['price' => 450000], $listing->extracted);
        $this->assertSame(['https://exemple.test/a.jpg'], $listing->photo_urls);
        $this->assertSame([['listing_id' => 3]], $listing->matches);
        $this->assertTrue($listing->advertiser->is($advertiser));
        $this->assertTrue($listing->capturer->is($user));
        $this->assertTrue($listing->property->is($property));
        $this->assertTrue($advertiser->listings->first()->is($listing));
    }

    public function test_les_cles_etrangeres_se_vident_sans_supprimer_l_annonce(): void
    {
        $advertiser = RadarAdvertiser::factory()->create();
        $listing = RadarListing::factory()->create(['radar_advertiser_id' => $advertiser->id]);

        $advertiser->delete();

        $this->assertNull($listing->fresh()->radar_advertiser_id);
    }

    public function test_un_annonceur_a_un_telephone_et_une_empreinte_uniques_et_peut_perdre_son_telephone(): void
    {
        $a = RadarAdvertiser::factory()->create(['phone' => '+221771234567']);

        $this->assertSame(RadarAdvertiserNature::Unknown, $a->fresh()->nature);
        $this->assertSame([], $a->fresh()->nature_signals);
        $this->assertSame(64, strlen($a->phone_hmac));

        $a->update(['phone' => null]);
        RadarAdvertiser::factory()->create(['phone' => null]);
        $this->assertSame(2, RadarAdvertiser::query()->whereNull('phone')->count());

        $this->expectException(QueryException::class);
        RadarAdvertiser::factory()->create(['phone_hmac' => $a->phone_hmac]);
    }

    public function test_le_modele_declare_ses_filtres_et_tris_de_lecture(): void
    {
        $this->assertSame(['stage', 'source_site', 'radar_advertiser_id'], $this->prop(RadarListing::class, 'requestFilterable'));
        $this->assertSame(['created_at', 'stage'], $this->prop(RadarListing::class, 'requestSortable'));
        $this->assertContains('raw_text', RadarListing::getOwnQueryFields());
    }

    private function prop(string $class, string $name): array
    {
        return (new \ReflectionClass($class))->getStaticPropertyValue($name);
    }
}
