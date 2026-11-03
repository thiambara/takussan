<?php

namespace Tests\Feature\Radar;

use App\Exceptions\ApiError;
use App\Jobs\Radar\PurgeRadarAdvertiser;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarListingStage;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Services\Radar\RadarListingReview;
use App\Services\Radar\RadarPurger;
use App\Support\RadarPhone;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2387 (ADR-0077 §9, AC6) — rattacher une annonce à un numéro qu'elle a lu sans le retenir. Le numéro doit
 * être connu de l'annonce ; un STOP l'emporte, y compris celui dit entre la lecture du refus et le verrou de
 * l'annonceur (l'annonce passe `do_not_contact`, réponse 200) ; le journal ne porte jamais le numéro.
 */
class RadarListingAdvertiserTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    private const RETENU = '+221771234567';

    private const ECARTE = '+221789998877';

    private const DU_TEXTE = '+221761112233';

    protected function setUp(): void
    {
        parent::setUp();
        $this->agirEnOperateur(PlatformProfileLevel::Support);
        // TCK-2391 : un STOP tardif lance la purge de l'annonceur ; elle s'éprouve dans RadarStopPurgeTest.
        Bus::fake([PurgeRadarAdvertiser::class]);
    }

    /** @param  array<string, mixed>  $attributes */
    private function fiche(array $attributes = []): RadarListing
    {
        return RadarListing::factory()->extracted([
            'phones' => [self::RETENU],
            'phones_dropped' => [self::ECARTE],
        ])->create($attributes + ['raw_text' => 'Appartement à louer, contact 76 111 22 33']);
    }

    private function promouvoir(RadarListing $listing, string $numero): TestResponse
    {
        return $this->putJson("/api/admin/radar/listings/{$listing->id}/advertiser", ['phone' => $numero]);
    }

    private function stop(string $e164): RadarAdvertiser
    {
        return RadarAdvertiser::factory()->doNotContact()->create(['phone_hmac' => RadarPhone::hmac($e164)]);
    }

    public function test_ac6_un_numero_ecarte_devient_l_annonceur(): void
    {
        $listing = $this->fiche();

        $this->promouvoir($listing, '78 999 88 77')
            ->assertOk()
            ->assertJsonPath('data.stage', 'extracted')
            ->assertJsonPath('data.radar_advertiser_id', RadarAdvertiser::query()->sole()->id)
            ->assertJsonPath('data.advertiser.phone', self::ECARTE);

        $annonceur = RadarAdvertiser::query()->sole();
        $this->assertSame(self::ECARTE, $annonceur->phone);
        $this->assertSame(RadarPhone::hmac(self::ECARTE), $annonceur->phone_hmac);
        $this->assertSame($annonceur->id, $listing->fresh()->radar_advertiser_id);
        // Chemin nominal : aucun STOP, donc aucune purge (TCK-2391).
        Bus::assertNotDispatched(PurgeRadarAdvertiser::class);

        $journal = Activity::query()->where('event', 'radar_listing_advertiser_set')->sole();
        $this->assertSame($annonceur->id, $journal->properties['advertiser_id']);
        $this->assertTrue($journal->properties['from_dropped']);
        $this->assertFalse($journal->properties['do_not_contact']);
    }

    public function test_extracted_n_est_pas_reecrit_et_le_journal_ne_porte_jamais_le_numero(): void
    {
        $listing = $this->fiche();
        $avant = $listing->extracted;

        $this->promouvoir($listing, self::ECARTE)->assertOk();

        $this->assertEquals($avant, $listing->fresh()->extracted);
        foreach (Activity::query()->get() as $entree) {
            $this->assertStringNotContainsString('789998877', json_encode($entree->properties));
            $this->assertStringNotContainsString('789998877', (string) $entree->description);
        }
    }

    public function test_un_numero_retenu_ou_lu_dans_le_texte_se_promeut_aussi(): void
    {
        $retenu = $this->fiche();
        $this->promouvoir($retenu, self::RETENU)->assertOk();
        $this->assertFalse(Activity::query()->where('event', 'radar_listing_advertiser_set')->latest('id')->first()->properties['from_dropped']);

        $texte = $this->fiche();
        $this->promouvoir($texte, '+221 76 111 22 33')->assertOk()->assertJsonPath('data.advertiser.phone', self::DU_TEXTE);
    }

    public function test_ac6_un_numero_ecarte_qui_a_dit_stop_rend_l_annonce_do_not_contact(): void
    {
        $stop = $this->stop(self::ECARTE);
        $listing = $this->fiche();

        $this->promouvoir($listing, self::ECARTE)
            ->assertOk()
            ->assertJsonPath('data.stage', 'do_not_contact')
            ->assertJsonPath('data.radar_advertiser_id', $stop->id);

        $this->assertSame(RadarListingStage::DoNotContact, $listing->fresh()->stage);

        Bus::assertDispatched(PurgeRadarAdvertiser::class, fn (PurgeRadarAdvertiser $job) => $job->advertiserId === RadarListing::query()->sole()->radar_advertiser_id);
        $this->assertSame(1, RadarAdvertiser::query()->count());
        $this->assertTrue(Activity::query()->where('event', 'radar_listing_advertiser_set')->sole()->properties['do_not_contact']);
    }

    public function test_une_purge_entre_la_recherche_et_le_verrou_de_l_annonceur_ne_lui_prend_pas_son_numero(): void
    {
        // Un annonceur déjà purgé sans refus : numéro parti, un message gardé.
        $annonceur = RadarAdvertiser::factory()->create(['phone' => null, 'phone_hmac' => RadarPhone::hmac(self::ECARTE)]);
        RadarOutreach::factory()->create(['radar_advertiser_id' => $annonceur->id, 'salutation' => '', 'summary' => '', 'message' => '']);
        $listing = $this->fiche();
        // `findOrCreate()` lui rend son numéro, puis une purge passe avant le verrou : elle ne voit pas encore l'annonce rattachée.
        $faite = false;
        RadarAdvertiser::updated(function (RadarAdvertiser $a) use (&$faite): void {
            if (! $faite) {
                $faite = true;
                app(RadarPurger::class)->run($a->id);
            }
        });

        $this->promouvoir($listing, self::ECARTE)->assertOk();

        $this->assertTrue($faite, 'La purge devait passer entre la recherche et le verrou.');
        $this->assertSame($annonceur->id, $listing->fresh()->radar_advertiser_id);
        $this->assertSame(self::ECARTE, $annonceur->fresh()->phone);
    }

    public function test_un_stop_dit_entre_la_lecture_et_le_verrou_de_l_annonceur_l_emporte(): void
    {
        $annonceur = RadarAdvertiser::factory()->create(['phone' => self::ECARTE]);
        $listing = $this->fiche();

        // Le refus est lu (aucun STOP), puis l'annonceur est retrouvé : c'est ENTRE les deux que le STOP tombe.
        $dit = false;
        DB::listen(function ($requete) use (&$dit, $annonceur): void {
            if (! $dit && str_contains($requete->sql, 'from "radar_advertisers" where "phone_hmac" = ?')) {
                $dit = true;
                DB::table('radar_advertisers')->where('id', $annonceur->id)->update(['do_not_contact_at' => now(), 'phone' => null]);
            }
        });

        $this->promouvoir($listing, self::ECARTE)->assertOk()->assertJsonPath('data.stage', 'do_not_contact');

        $this->assertTrue($dit, 'le STOP tardif a bien été simulé');
        $apres = $listing->fresh();
        $this->assertSame(RadarListingStage::DoNotContact, $apres->stage);
        Bus::assertDispatched(PurgeRadarAdvertiser::class, fn (PurgeRadarAdvertiser $job) => $job->advertiserId === RadarListing::query()->sole()->radar_advertiser_id);
        $this->assertSame($annonceur->id, $apres->radar_advertiser_id);
    }

    public function test_un_numero_inconnu_de_l_annonce_ou_invalide_rend_422(): void
    {
        $listing = $this->fiche();

        $this->promouvoir($listing, '+221 70 555 44 33')->assertStatus(422)->assertJsonPath('code', 'radar.advertiser.phone_unknown');
        foreach (['pas un numero', '12', '+33 6 12 34 56 78'] as $invalide) {
            $this->promouvoir($listing, $invalide)->assertStatus(422)->assertJsonPath('code', 'radar.advertiser.phone_invalid');
        }
        $this->putJson("/api/admin/radar/listings/{$listing->id}/advertiser", [])->assertStatus(422);

        $this->assertSame(0, RadarAdvertiser::query()->count());
        $this->assertNull($listing->fresh()->radar_advertiser_id);
    }

    public function test_depuis_une_etape_qui_ne_le_permet_pas_rend_409(): void
    {
        foreach ([RadarListingStage::Contacted, RadarListingStage::Captured, RadarListingStage::Duplicate, RadarListingStage::Discarded] as $etape) {
            $listing = $this->fiche(['stage' => $etape]);

            $this->promouvoir($listing, self::ECARTE)->assertStatus(409)->assertJsonPath('params.stage', $etape->value);
        }
        $this->assertSame(0, RadarAdvertiser::query()->count());
    }

    public function test_deux_promotions_du_meme_numero_ne_font_qu_un_annonceur(): void
    {
        $premiere = $this->fiche();
        $seconde = $this->fiche();

        $this->promouvoir($premiere, self::ECARTE)->assertOk();
        $this->promouvoir($seconde, self::ECARTE)->assertOk();

        $this->assertSame(1, RadarAdvertiser::query()->count());
        $this->assertSame($premiere->fresh()->radar_advertiser_id, $seconde->fresh()->radar_advertiser_id);
    }

    public function test_un_annonceur_cree_entre_la_lecture_et_l_insertion_est_relu_sans_erreur(): void
    {
        $listing = $this->fiche();

        // Une autre requête crée l'annonceur après que la première a constaté son absence : `insertOrIgnore`
        // s'efface, la relecture le retrouve — jamais une violation d'unicité dans la transaction.
        $cree = false;
        DB::listen(function ($requete) use (&$cree): void {
            if (! $cree && str_contains($requete->sql, 'from "radar_advertisers" where "phone_hmac" = ?')) {
                $cree = true;
                DB::table('radar_advertisers')->insert([
                    'phone' => self::ECARTE, 'phone_hmac' => RadarPhone::hmac(self::ECARTE), 'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        });

        $this->promouvoir($listing, self::ECARTE)->assertOk();

        $this->assertTrue($cree);
        $this->assertSame(1, RadarAdvertiser::query()->count());
        $this->assertSame(RadarAdvertiser::query()->sole()->id, $listing->fresh()->radar_advertiser_id);
    }

    public function test_un_viewer_est_refuse(): void
    {
        $listing = $this->fiche();
        $this->agirEnOperateur(PlatformProfileLevel::Viewer);

        $this->promouvoir($listing, self::ECARTE)->assertForbidden()->assertJsonPath('code', 'platform.ability_missing');
        $this->putJson("/api/admin/radar/listings/{$listing->id}/advertiser", [])->assertForbidden();
        $this->assertNull($listing->fresh()->radar_advertiser_id);
    }

    public function test_le_service_relit_l_etape_sous_verrou(): void
    {
        $listing = $this->fiche();
        $perimee = RadarListing::query()->findOrFail($listing->id);
        $listing->forceFill(['stage' => RadarListingStage::Contacted])->save();

        $this->expectExceptionObject(new ApiError(409, 'radar.listing.stage_conflict', ['stage' => 'contacted']));
        $this->app->make(RadarListingReview::class)->setAdvertiser($perimee, self::ECARTE, $this->operateur(PlatformProfileLevel::Support));
    }
}
