<?php

namespace Tests\Feature\Radar;

use App\Models\Enums\RadarAdvertiserNature;
use App\Models\Enums\RadarConfidence;
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
            ['captured', 'extracted', 'reviewed', 'contacted', 'consented', 'published', 'extraction_failed', 'duplicate', 'refused', 'do_not_contact', 'purged'],
            array_map(fn ($c) => $c->value, RadarListingStage::cases()),
        );
        $this->assertSame(['url', 'text', 'captures'], array_map(fn ($c) => $c->value, RadarSourceKind::cases()));
        $this->assertSame(['probable_owner', 'probable_intermediary', 'agency', 'unknown'], array_map(fn ($c) => $c->value, RadarAdvertiserNature::cases()));
        $this->assertSame(['high', 'medium', 'low'], array_map(fn ($c) => $c->value, RadarConfidence::cases()));
        $this->assertSame(RadarConfidence::Low, RadarConfidence::lowest());
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
