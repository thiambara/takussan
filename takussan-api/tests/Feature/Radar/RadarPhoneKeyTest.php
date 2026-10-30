<?php

namespace Tests\Feature\Radar;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarListingStage;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Services\Radar\RadarAdvertiserDirectory;
use App\Services\Radar\RadarMatcher;
use App\Support\RadarPhone;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2414 (ADR-0077 §9) — l'empreinte d'un refus survit au changement de sa clé : pose d'une clé dédiée sur un
 * parc écrit sous le repli `app.key`, rotation de la clé dédiée, rotation d'`APP_KEY` sans clé dédiée. Le numéro en
 * clair d'un annonceur qui a dit STOP est purgé : seule une empreinte reconnue sous l'ancienne clé le retrouve.
 */
class RadarPhoneKeyTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    // Le numéro des épreuves voisines : le Radar ne lit pas le préfixe 74 (`PhoneMasker::PREFIX`), fictif ailleurs.
    private const NUMERO = '+221771234567';

    private const APP_KEY = 'base64:YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=';

    protected function setUp(): void
    {
        parent::setUp();
        Queue::fake();
        config(['app.key' => self::APP_KEY, 'app.previous_keys' => [], 'radar.phone_hmac_key' => null, 'radar.phone_hmac_previous_keys' => []]);
    }

    /** Un annonceur qui a dit STOP, numéro purgé, empreinte écrite sous la clé de CE moment. */
    private function refus(): RadarAdvertiser
    {
        return RadarAdvertiser::factory()->doNotContact()->create(['phone_hmac' => RadarPhone::hmac(self::NUMERO)]);
    }

    private function directory(): RadarAdvertiserDirectory
    {
        return app(RadarAdvertiserDirectory::class);
    }

    private function assertRefusReconnu(RadarAdvertiser $refus): void
    {
        $this->assertSame($refus->id, $this->directory()->refusedAmong([self::NUMERO])?->id);

        $retrouve = $this->directory()->findOrCreate(self::NUMERO);

        $this->assertSame($refus->id, $retrouve->id);
        $this->assertSame(1, RadarAdvertiser::query()->count(), 'aucun annonceur neuf, sans refus, pour ce numéro');
        $this->assertNull($retrouve->fresh()->phone, 'le numéro ne revient jamais en clair chez celui qui a refusé');
    }

    public function test_ac2_poser_une_cle_dediee_garde_les_refus_ecrits_sous_le_repli_app_key(): void
    {
        $refus = $this->refus();

        config(['radar.phone_hmac_key' => 'cle-dediee-radar']);

        $this->assertNotSame($refus->phone_hmac, RadarPhone::hmac(self::NUMERO));
        $this->assertRefusReconnu($refus);

        // De bout en bout : la saisie du même numéro naît `do_not_contact`.
        $this->actingAsWithStepUp($this->operateur(PlatformProfileLevel::SuperAdmin));
        $this->postJson('/api/admin/radar/listings', ['text' => 'Appartement F4 à louer aux Almadies, 450.000f/mois. Contact 77 123 45 67'])
            ->assertCreated()->assertJsonPath('data.0.stage', 'do_not_contact');
        $this->assertSame(1, RadarAdvertiser::query()->count());
    }

    public function test_un_refus_retrouve_sous_une_ancienne_cle_est_reecrit_sous_la_cle_courante(): void
    {
        $refus = $this->refus();
        config(['radar.phone_hmac_key' => 'cle-dediee-radar']);

        $this->directory()->findOrCreate(self::NUMERO);

        $this->assertSame(RadarPhone::hmac(self::NUMERO), $refus->fresh()->phone_hmac);
    }

    public function test_ac3_une_rotation_de_la_cle_dediee_garde_les_refus_si_l_ancienne_est_listee(): void
    {
        config(['radar.phone_hmac_key' => 'cle-une']);
        $refus = $this->refus();

        config(['radar.phone_hmac_key' => 'cle-deux', 'radar.phone_hmac_previous_keys' => ['cle-une']]);

        $this->assertRefusReconnu($refus);
    }

    public function test_sans_l_ancienne_cle_listee_le_refus_purge_est_meconnaissable(): void
    {
        // Le défaut que l'option RADAR_PHONE_HMAC_PREVIOUS_KEYS ferme : sans elle, un annonceur neuf naît, sans refus.
        config(['radar.phone_hmac_key' => 'cle-une']);
        $this->refus();

        config(['radar.phone_hmac_key' => 'cle-deux']);

        $this->assertNull($this->directory()->refusedAmong([self::NUMERO]));
    }

    public function test_une_rotation_d_app_key_sans_cle_dediee_garde_les_refus_par_app_previous_keys(): void
    {
        $refus = $this->refus();

        config(['app.key' => 'base64:YmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmI=', 'app.previous_keys' => [self::APP_KEY]]);

        $this->assertRefusReconnu($refus);
    }

    public function test_un_annonceur_purge_sans_refus_retrouve_son_numero_apres_la_pose_de_la_cle(): void
    {
        $annonceur = RadarAdvertiser::factory()->create(['phone' => null, 'phone_hmac' => RadarPhone::hmac(self::NUMERO)]);
        config(['radar.phone_hmac_key' => 'cle-dediee-radar']);

        $retrouve = $this->directory()->findOrCreate(self::NUMERO);

        $this->assertSame($annonceur->id, $retrouve->id);
        $this->assertSame(self::NUMERO, $retrouve->fresh()->phone);
        $this->assertSame(RadarPhone::hmac(self::NUMERO), $retrouve->fresh()->phone_hmac);
    }

    public function test_le_rapprochement_par_telephone_retrouve_un_refus_sous_l_ancienne_cle(): void
    {
        $refus = $this->refus();
        $autre = RadarListing::factory()->create(['radar_advertiser_id' => $refus->id, 'stage' => RadarListingStage::DoNotContact]);
        config(['radar.phone_hmac_key' => 'cle-dediee-radar']);
        $listing = RadarListing::factory()->extracted(['phones' => [self::NUMERO]])->create();

        $ids = array_map(fn (array $m) => $m['kind'].':'.$m['id'], app(RadarMatcher::class)->matchesFor($listing->fresh()));

        $this->assertContains('listing:'.$autre->id, $ids);
    }
}
