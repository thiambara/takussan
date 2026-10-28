<?php

namespace Tests\Feature\Radar;

use App\Ai\Agents\RadarExtraction;
use App\Models\Enums\RadarAdvertiserNature;
use App\Models\Enums\RadarConfidence;
use App\Models\Enums\RadarConsentProof;
use App\Models\Enums\RadarDiscardReason;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarOutreachChannel;
use App\Models\Enums\RadarOutreachOutcome;
use App\Models\Enums\RadarSourceKind;
use App\Models\Enums\RadarSourceSite;
use App\Models\Enums\RadarVerificationStatus;
use App\Models\Property;
use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
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

    public function test_photo_fingerprint_status_ne_promet_rien_que_personne_n_achevera(): void
    {
        $urls = ['https://exemple.test/1.jpg', 'https://exemple.test/2.jpg'];
        $statut = fn (RadarListingStage $etape, ?array $hashes = null) => RadarListing::factory()
            ->make(['source_kind' => RadarSourceKind::Url, 'photo_urls' => $urls, 'stage' => $etape, 'source_photo_hashes' => $hashes])
            ->photoFingerprintStatus();
        $un = [['url' => $urls[0], 'hash' => 1, 'b0' => 0, 'b1' => 0, 'b2' => 0, 'b3' => 0]];
        $deux = [...$un, ['url' => $urls[1], 'hash' => null, 'error' => 'radar.photo.timeout']];

        // Là où le travail se fait ou va se faire : pending.
        foreach ([RadarListingStage::Captured, RadarListingStage::Extracted, RadarListingStage::Reviewed] as $etape) {
            $this->assertSame(['status' => 'pending', 'total' => 2, 'done' => 1], $statut($etape, $un), $etape->value);
        }

        // Partout ailleurs, un compte incomplet (jamais commencé, ou coupé à moitié) ne l'est plus.
        foreach ([
            RadarListingStage::ExtractionFailed, RadarListingStage::DoNotContact, RadarListingStage::Discarded,
            RadarListingStage::Duplicate, RadarListingStage::Contacted, RadarListingStage::Refused,
        ] as $etape) {
            $this->assertSame(['status' => 'none', 'total' => 0, 'done' => 0], $statut($etape), $etape->value);
            $this->assertSame(['status' => 'none', 'total' => 0, 'done' => 0], $statut($etape, $un), $etape->value);
            // Un compte complet reste complet, quelle que soit l'étape.
            $this->assertSame(['status' => 'done', 'total' => 2, 'done' => 2], $statut($etape, $deux), $etape->value);
        }
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

    // ---- TCK-2388 : le démarchage et la preuve d'accord ----

    public function test_les_enums_du_demarchage_portent_leurs_valeurs(): void
    {
        $valeurs = fn (string $enum) => array_map(fn ($c) => $c->value, $enum::cases());

        $this->assertSame(['consented', 'refused', 'stop', 'question', 'no_answer'], $valeurs(RadarOutreachOutcome::class));
        $this->assertSame(['screenshot', 'provider_message', 'otp'], $valeurs(RadarConsentProof::class));
        $this->assertSame(['whatsapp_manual'], $valeurs(RadarOutreachChannel::class));
        $this->assertSame(['pending', 'done', 'failed'], $valeurs(RadarVerificationStatus::class));
    }

    public function test_une_issue_est_finale_pour_accord_refus_et_stop_seulement(): void
    {
        $this->assertTrue(RadarOutreachOutcome::Consented->isFinal());
        $this->assertTrue(RadarOutreachOutcome::Refused->isFinal());
        $this->assertTrue(RadarOutreachOutcome::Stop->isFinal());
        $this->assertFalse(RadarOutreachOutcome::Question->isFinal());
        $this->assertFalse(RadarOutreachOutcome::NoAnswer->isFinal());
    }

    public function test_la_config_des_relances(): void
    {
        $this->assertSame(['after_days' => 3, 'max' => 2], config('radar.follow_ups'));
    }

    public function test_la_prise_en_charge_vit_sur_la_ligne_de_l_annonceur(): void
    {
        $user = User::factory()->create();
        $advertiser = RadarAdvertiser::factory()->create();
        $this->assertNull($advertiser->fresh()->claimed_by_id);

        $advertiser->forceFill(['claimed_by_id' => $user->id, 'claimed_at' => now(), 'claim_expires_at' => now()->addMinutes(10)])->save();
        $relu = $advertiser->fresh();

        $this->assertTrue($relu->claimer->is($user));
        $this->assertInstanceOf(CarbonInterface::class, $relu->claimed_at);
        $this->assertInstanceOf(CarbonInterface::class, $relu->claim_expires_at);
        $this->assertNotContains('claimed_by_id', (new RadarAdvertiser)->getFillable());
        $this->assertNotContains('claim_expires_at', RadarAdvertiser::getOwnQueryFields());

        $user->forceDelete();
        $this->assertNull($advertiser->fresh()->claimed_by_id);
    }

    public function test_un_message_lit_ses_relations_et_ses_casts(): void
    {
        $user = User::factory()->create();
        $a = RadarListing::factory()->reviewed()->create();
        $b = RadarListing::factory()->reviewed()->create();

        $outreach = RadarOutreach::factory()->withListings($a, $b)->sent()->create(['created_by_id' => $user->id, 'sent_by_id' => $user->id])->fresh();

        $this->assertSame(RadarOutreachChannel::WhatsappManual, $outreach->channel);
        $this->assertNull($outreach->outcome);
        $this->assertSame(0, $outreach->follow_up_rank);
        $this->assertTrue($outreach->isSent());
        $this->assertTrue($outreach->advertiser->is(RadarAdvertiser::query()->findOrFail($outreach->radar_advertiser_id)));
        $this->assertEqualsCanonicalizing([$a->id, $b->id], $outreach->listings->pluck('id')->all());
        $this->assertTrue($a->outreaches->first()->is($outreach));
        $this->assertTrue($outreach->creator->is($user));
        $this->assertTrue($outreach->sender->is($user));
        $this->assertFalse(RadarOutreach::factory()->create()->isSent());
    }

    public function test_une_relance_est_unique_par_message(): void
    {
        $premier = RadarOutreach::factory()->sent()->create();
        $relance = RadarOutreach::factory()->followUpOf($premier)->create();

        $this->assertTrue($premier->fresh()->followUp->is($relance));
        $this->assertTrue($relance->fresh()->followUpOf->is($premier));
        $this->assertSame(1, $relance->follow_up_rank);

        $this->expectException(QueryException::class);
        $this->expectExceptionMessage('radar_outreaches_follow_up_unique');
        RadarOutreach::factory()->followUpOf($premier)->create();
    }

    public function test_supprimer_un_annonceur_qui_a_un_message_est_refuse(): void
    {
        $outreach = RadarOutreach::factory()->create();

        try {
            $outreach->advertiser->delete();
            $this->fail('La suppression aurait dû être refusée.');
        } catch (QueryException $e) {
            $this->assertStringContainsString('radar_outreaches_advertiser_fk', $e->getMessage());
        }
    }

    public function test_supprimer_un_message_efface_ses_lignes_de_liaison_pas_ses_annonces(): void
    {
        $listing = RadarListing::factory()->reviewed()->create();
        $outreach = RadarOutreach::factory()->withListings($listing)->create();
        $this->assertSame(1, DB::table('radar_outreach_listing')->where('radar_outreach_id', $outreach->id)->count());

        $outreach->delete();

        $this->assertSame(0, DB::table('radar_outreach_listing')->where('radar_listing_id', $listing->id)->count());
        $this->assertNotNull(RadarListing::query()->find($listing->id));
    }

    public function test_une_annonce_couverte_par_un_message_ne_se_supprime_pas(): void
    {
        $listing = RadarListing::factory()->reviewed()->create();
        RadarOutreach::factory()->withListings($listing)->create();

        $this->expectException(QueryException::class);
        $this->expectExceptionMessage('radar_outreach_listing_listing_fk');
        $listing->delete();
    }

    public function test_une_annonce_ne_figure_qu_une_fois_dans_un_message(): void
    {
        $listing = RadarListing::factory()->reviewed()->create();
        $outreach = RadarOutreach::factory()->withListings($listing)->create();

        $this->expectException(QueryException::class);
        $this->expectExceptionMessage('radar_outreach_listing_pk');
        $outreach->listings()->attach($listing->id);
    }

    public function test_une_reponse_deposee_garde_son_message_et_son_annonceur(): void
    {
        $consent = RadarConsent::factory()->create()->fresh();

        $this->assertSame(RadarConsentProof::Screenshot, $consent->proof);
        $this->assertSame(RadarVerificationStatus::Pending, $consent->verification_status);
        $this->assertCount(1, $consent->capture_hashes);
        $this->assertSame(64, strlen($consent->capture_hashes[0]));
        $this->assertTrue($consent->outreach->advertiser->is($consent->advertiser));
        $this->assertTrue($consent->outreach->consents->first()->is($consent));
        $this->assertTrue($consent->advertiser->consents->first()->is($consent));
        $this->assertTrue($consent->advertiser->outreaches->first()->is($consent->outreach));

        try {
            $consent->outreach->delete();
            $this->fail('La suppression aurait dû être refusée.');
        } catch (QueryException $e) {
            $this->assertStringContainsString('radar_consents_outreach_fk', $e->getMessage());
        }
    }

    public function test_les_etats_verified_et_confirmed_de_la_factory(): void
    {
        $user = User::factory()->create();
        $verdict = ['number_matches' => true, 'clauses_visible' => true, 'reply' => 'consented'];

        $consent = RadarConsent::factory()->verified($verdict)->confirmed($user)->create()->fresh();

        $this->assertSame(RadarVerificationStatus::Done, $consent->verification_status);
        $this->assertEquals($verdict, $consent->ai_verdict);
        $this->assertTrue($consent->confirmer->is($user));
        $this->assertNotNull($consent->confirmed_at);
    }

    public function test_un_accord_valide_est_confirme_et_non_revoque(): void
    {
        $user = User::factory()->create();
        $pas_confirme = RadarConsent::factory()->create();
        $confirme = RadarConsent::factory()->confirmed($user)->create();
        $revoque = RadarConsent::factory()->confirmed($user)->create(['revoked_at' => now()]);

        $ids = RadarConsent::query()->valid()->pluck('id')->all();

        $this->assertSame([$confirme->id], $ids);
        $this->assertNotContains($pas_confirme->id, $ids);
        $this->assertNotContains($revoque->id, $ids);
    }

    public function test_les_captures_d_une_reponse_vont_sur_le_disque_prive(): void
    {
        $private = config('media-library.disk_name');
        $public = config('media-library.public_disk_name');
        Storage::fake($private);
        Storage::fake($public);

        $media = RadarConsent::factory()->create()
            ->addMedia(UploadedFile::fake()->image('reponse.jpg'))
            ->toMediaCollection('radar_consent_captures');

        $this->assertSame($private, $media->disk);
        Storage::disk($private)->assertExists($media->getPathRelativeToRoot());
        Storage::disk($public)->assertMissing($media->getPathRelativeToRoot());
    }

    public function test_la_factory_reviewed_pose_l_etape_lue(): void
    {
        $listing = RadarListing::factory()->reviewed()->create()->fresh();

        $this->assertSame(RadarListingStage::Reviewed, $listing->stage);
        $this->assertNotNull($listing->extracted);
    }

    public function test_les_migrations_du_demarchage_posent_leurs_objets(): void
    {
        $tables = ['radar_outreaches', 'radar_outreach_listing', 'radar_consents'];
        foreach ($tables as $table) {
            $this->assertTrue(Schema::hasTable($table), $table);
        }
        $this->assertTrue(Schema::hasColumns('radar_advertisers', ['claimed_by_id', 'claimed_at', 'claim_expires_at']));
        $this->assertSame(1, DB::table('pg_indexes')->where('indexname', 'radar_outreaches_awaiting_idx')
            ->where('indexdef', 'like', '%WHERE%outcome IS NULL%sent_at IS NOT NULL%')->count());
    }

    private function prop(string $class, string $name): array
    {
        return (new \ReflectionClass($class))->getStaticPropertyValue($name);
    }
}
