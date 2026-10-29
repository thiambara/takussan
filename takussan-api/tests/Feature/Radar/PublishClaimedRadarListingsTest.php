<?php

namespace Tests\Feature\Radar;

use App\Jobs\Radar\PublishClaimedRadarListings;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\GeoNeighborhood;
use App\Models\Property;
use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-2390 — la publication des annonces réclamées : elle attend la fin de la préparation des photos, publie ce qui est
 * prêt dans l'espace de l'annonceur (par lots sous le plafond de photos), laisse le reste `consented` à l'opérateur, et un
 * refus se journalise par son code sans rien publier.
 */
class PublishClaimedRadarListingsTest extends TestCase
{
    use RefreshDatabase;

    private User $compte;

    private Agency $espace;

    private RadarAdvertiser $annonceur;

    private RadarOutreach $message;

    private GeoNeighborhood $quartier;

    private RadarConsent $accordOtp;

    protected function setUp(): void
    {
        parent::setUp();
        config(['auth.phone_login.enabled' => true]);
        $this->compte = User::factory()->create(['phone' => '+221771234567', 'phone_verified_at' => now()]);
        $this->espace = Agency::factory()->create(['primary_admin_id' => $this->compte->id, 'kind' => 'individual']);
        $this->annonceur = RadarAdvertiser::factory()->create(['phone' => '+221771234567', 'user_id' => $this->compte->id]);
        $this->quartier = GeoNeighborhood::factory()->create();
        $this->message = RadarOutreach::factory()->sent()->create(['radar_advertiser_id' => $this->annonceur->id]);
        $this->accordOtp = RadarConsent::factory()->confirmed($this->compte)->create(['radar_outreach_id' => $this->message->id, 'proof' => 'otp']);
    }

    private function annonce(int $photos = 1, array $attributs = []): RadarListing
    {
        $annonce = RadarListing::factory()
            ->extracted(['neighborhood' => ['neighborhood_id' => $this->quartier->id]])
            ->create($attributs + ['radar_advertiser_id' => $this->annonceur->id, 'stage' => RadarListingStage::Consented]);
        for ($i = 0; $i < $photos; $i++) {
            $annonce->addMediaFromString(self::jpeg($i))->usingFileName("p{$i}.jpg")->toMediaCollection('radar_photos');
        }
        $this->message->listings()->attach($annonce->id);

        return $annonce->fresh();
    }

    private static function jpeg(int $i): string
    {
        $image = imagecreatetruecolor(8, 8);
        imagefill($image, 0, 0, (int) imagecolorallocate($image, 40 + $i * 10, 83, 50));
        ob_start();
        imagejpeg($image);

        return (string) ob_get_clean();
    }

    /** @param  list<int>  $ids */
    private function lancer(array $ids): PublishClaimedRadarListings
    {
        $job = (new PublishClaimedRadarListings($this->annonceur->id, $this->compte->id, $this->espace->id, $ids))->withFakeQueueInteractions();
        $this->app->call([$job, 'handle']);

        return $job;
    }

    public function test_le_job_attend_la_fin_de_la_preparation_des_photos(): void
    {
        $annonce = $this->annonce(photos: 0, attributs: [
            'source_kind' => RadarSourceKind::Url, 'source_url' => 'https://sn.coinafrique.com/annonce/9', 'photo_urls' => ['https://a.cdn.test/p/1.jpg'],
        ]);

        $this->lancer([$annonce->id])->assertReleased(PublishClaimedRadarListings::WAIT_SECONDS);
        $this->assertSame(RadarListingStage::Consented, $annonce->fresh()->stage);

        $media = $annonce->addMediaFromString(self::jpeg(1))->usingFileName('lue.jpg')->toMediaCollection('radar_photos');
        $annonce->forceFill(['photo_preparation' => [['url' => 'https://a.cdn.test/p/1.jpg', 'media_id' => $media->id]]])->save();

        $this->lancer([$annonce->id])->assertNotReleased();
        $this->assertSame(RadarListingStage::Published, $annonce->fresh()->stage);
        $this->assertSame($this->espace->id, Property::query()->findOrFail($annonce->fresh()->property_id)->agency_id);
        $journal = Activity::query()->where('event', 'radar_published')->sole();
        $this->assertSame($this->compte->id, $journal->causer_id);
        $this->assertTrue($journal->properties['claimed']);
    }

    public function test_ce_qui_n_est_pas_pret_reste_a_l_operateur(): void
    {
        $prete = $this->annonce();
        $sansPhoto = $this->annonce(photos: 0);

        $this->lancer([$prete->id, $sansPhoto->id]);

        $this->assertSame(RadarListingStage::Published, $prete->fresh()->stage);
        $this->assertSame(RadarListingStage::Consented, $sansPhoto->fresh()->stage);
        $this->assertNull($sansPhoto->fresh()->property_id);
    }

    public function test_les_lots_restent_sous_le_plafond_de_photos(): void
    {
        config(['radar.publish.max_photos' => 3]);
        $a = $this->annonce(photos: 2);
        $b = $this->annonce(photos: 2);

        $this->lancer([$a->id, $b->id]);

        $this->assertSame([RadarListingStage::Published, RadarListingStage::Published], [$a->fresh()->stage, $b->fresh()->stage]);
        $this->assertSame(2, Activity::query()->where('event', 'radar_published')->count());
    }

    public function test_un_refus_se_journalise_par_son_code_et_ne_publie_rien(): void
    {
        $annonce = $this->annonce();
        $this->espace->forceFill(['status' => AgencyStatus::Suspended])->save();
        Log::spy();

        $this->lancer([$annonce->id]);

        $this->assertSame(RadarListingStage::Consented, $annonce->fresh()->stage);
        $this->assertSame(0, Property::query()->count());
        Log::shouldHaveReceived('warning')->withArgs(fn (string $message, array $contexte) => $message === 'radar.claim.publish_refused'
            && $contexte['code'] === 'radar.advertiser.account_unavailable'
            && ! str_contains(json_encode($contexte), '771234567'));
    }

    public function test_un_compte_qui_n_est_plus_celui_de_l_annonceur_ne_recoit_rien(): void
    {
        $annonce = $this->annonce();
        $this->annonceur->forceFill(['user_id' => User::factory()->create()->id])->save();
        Log::spy();

        $this->lancer([$annonce->id]);

        $this->assertSame(RadarListingStage::Consented, $annonce->fresh()->stage);
        Log::shouldHaveReceived('warning')->withArgs(fn (string $message, array $contexte) => $contexte['code'] === 'radar.claim.account_changed');
    }

    /** Décision 2a : rejoué, le job ne publie rien deux fois. */
    public function test_rejoue_le_job_ne_publie_pas_deux_fois(): void
    {
        $annonce = $this->annonce();

        $this->lancer([$annonce->id]);
        $this->lancer([$annonce->id]);

        $this->assertSame(1, Property::query()->count());
        $this->assertSame(1, Activity::query()->where('event', 'radar_published')->count());
        $this->assertSame(RadarListingStage::Published, $annonce->fresh()->stage);
    }

    /**
     * Deux jobs pour la même annonce (une double confirmation, un rejeu de la file) qui la lisent `consented` tous deux : le
     * premier publie, le second s'arrête sous le verrou (`radar.listing.stage_conflict`) — un seul bien.
     */
    public function test_deux_jobs_concurrents_ne_publient_qu_un_bien(): void
    {
        $annonce = $this->annonce();
        $fait = false;
        DB::listen(function ($requete) use (&$fait, $annonce): void {
            // Le second job vient de lire l'annonce `consented`, hors verrou : le premier passe et publie à ce moment.
            if (! $fait && str_contains($requete->sql, '"radar_listings"') && ! str_contains($requete->sql, 'for update')
                && str_contains($requete->sql, '"stage"')) {
                $fait = true;
                $this->lancer([$annonce->id]);
            }
        });

        $this->lancer([$annonce->id]);

        $this->assertTrue($fait);
        $this->assertSame(1, Property::query()->count());
        $this->assertSame(1, Activity::query()->where('event', 'radar_published')->count());
        $this->assertSame(RadarListingStage::Published, $annonce->fresh()->stage);
    }

    /** Décision 2a : un STOP entre la réclamation et le job arrête tout — ni attente, ni publication. */
    public function test_un_stop_depuis_la_reclamation_arrete_tout(): void
    {
        $annonce = $this->annonce();
        $attente = $this->annonce(photos: 0, attributs: [
            'source_kind' => RadarSourceKind::Url, 'source_url' => 'https://sn.coinafrique.com/annonce/10', 'photo_urls' => ['https://a.cdn.test/p/2.jpg'],
        ]);
        $this->annonceur->forceFill(['do_not_contact_at' => now()])->save();

        $this->lancer([$annonce->id, $attente->id])->assertNotReleased();

        $this->assertSame(0, Property::query()->count());
        $this->assertSame(RadarListingStage::Consented, $annonce->fresh()->stage);
    }

    /** Décision 2a : sans l'accord `otp` valide de l'annonceur, rien ne se publie, même couvert par un autre accord. */
    public function test_sans_accord_otp_valide_rien_ne_se_publie_meme_couvert_par_une_capture(): void
    {
        $annonce = $this->annonce();
        // L'annonce reste couverte par un accord confirmé par un opérateur (capture), sans aucune révocation — mais l'accord de
        // l'annonceur n'est plus un `otp` confirmé par lui : la garde est celle de la publication, pas celle du lien.
        RadarConsent::factory()->confirmed(User::factory()->create())->create(['radar_outreach_id' => $this->message->id]);
        $this->accordOtp->forceFill(['proof' => 'screenshot'])->save();
        Log::spy();

        $this->lancer([$annonce->id]);

        $this->assertSame(RadarListingStage::Consented, $annonce->fresh()->stage);
        $this->assertSame(0, Property::query()->count());
        Log::shouldHaveReceived('warning')->withArgs(fn (string $message, array $contexte) => $contexte['code'] === 'radar.publish.not_covered');
    }
}
