<?php

namespace Tests\Feature\Radar;

use App\Models\Enums\RadarListingStage;
use App\Models\Property;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Services\Radar\RadarPurger;
use App\Support\RadarPhone;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\Support\FixturesDePublicationRadar;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2391 (ADR-0077 §9, « dès un STOP ») — de bout en bout, file synchrone : un STOP ou une révocation efface AUSSITÔT la matière des
 * annonces jamais publiées, sans attendre `radar:purge`. Ce qui a été publié n'est pas purgé (ADR-0077 §9) : seuls ses biens sortent du public.
 */
class RadarStopPurgeTest extends TestCase
{
    use FixturesDePublicationRadar;
    use OperateursPlateforme;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake((string) config('media-library.disk_name'));
        $this->installerLaPublication();
    }

    public function test_un_stop_efface_aussitot_les_annonces_jamais_publiees_et_garde_l_empreinte(): void
    {
        $ouverte = $this->annonceConsentie(couverte: false);
        $ouverte->forceFill(['stage' => RadarListingStage::Contacted, 'raw_text' => 'Awa 77 123 45 67'])->save();
        $message = RadarOutreach::factory()->withListings($ouverte)->sent()->create([
            'radar_advertiser_id' => $this->annonceur->id, 'created_by_id' => $this->operateur->id, 'sent_by_id' => $this->operateur->id,
        ]);
        $this->assertGreaterThan(0, $ouverte->media()->count());

        $this->postJson("/api/admin/radar/outreaches/{$message->id}/outcome", ['outcome' => 'stop'])->assertOk();

        $purgee = $ouverte->fresh();
        $this->assertSame(RadarListingStage::Purged, $purgee->stage);
        $this->assertNull($purgee->raw_text);
        $this->assertNull($purgee->extracted);
        $this->assertSame(0, $purgee->media()->count());
        $this->assertSame([], Storage::disk((string) config('media-library.disk_name'))->allFiles());
        $annonceur = $this->annonceur->fresh();
        $this->assertNull($annonceur->phone);
        $this->assertNull($annonceur->display_name);
        $this->assertSame(RadarPhone::hmac(self::NUMERO_ANNONCEUR), $annonceur->phone_hmac);
        $this->assertNotNull($annonceur->do_not_contact_at);
        $this->assertSame('', $message->fresh()->message);
    }

    public function test_la_revocation_purge_les_annonces_jamais_publiees_et_laisse_celles_qui_l_ont_ete(): void
    {
        $publiee = $this->annonceConsentie();
        $reponse = $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publish", ['listing_ids' => [$publiee->id]])->assertCreated();
        $bien = Property::query()->findOrFail($reponse->json('data.properties.0.id'));
        $ouverte = RadarListing::factory()->reviewed()->create(['radar_advertiser_id' => $this->annonceur->id, 'stage' => RadarListingStage::Reviewed, 'raw_text' => 'Villa 77 123 45 67']);

        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/revoke", ['reason' => 'Demande de l\'annonceur'])->assertOk();

        $this->assertSame(RadarListingStage::Purged, $ouverte->fresh()->stage);
        $this->assertNull($ouverte->fresh()->raw_text);
        // L'annonce publiée garde sa matière (ADR-0077 §9 : « jamais publiée ») ; son bien, lui, a quitté le public.
        $apres = $publiee->fresh();
        $this->assertSame(RadarListingStage::Published, $apres->stage);
        $this->assertNotNull($apres->extracted);
        $this->assertSame(0, Property::query()->public()->whereKey($bien->id)->count());
        $this->assertSame(RadarPhone::hmac(self::NUMERO_ANNONCEUR), $this->annonceur->fresh()->phone_hmac);
        // Il lui reste une annonce : son numéro en clair reste aussi.
        $this->assertSame(self::NUMERO_ANNONCEUR, $this->annonceur->fresh()->phone);
    }

    // --- Une annonce qui arrive APRÈS le STOP : elle ne garde pas sa matière jusqu'au passage quotidien -------------

    /** L'annonceur qui a dit STOP, sans plus aucune annonce (celui d'une purge déjà faite). */
    private function refus(): void
    {
        $this->annonceur->forceFill(['do_not_contact_at' => now()])->save();
        RadarOutreach::factory()->create(['radar_advertiser_id' => $this->annonceur->id, 'salutation' => '', 'summary' => '', 'message' => '']);
        $this->assertSame(0, app(RadarPurger::class)->run($this->annonceur->id)['listings']);
    }

    public function test_une_annonce_saisie_en_texte_apres_un_stop_est_purgee_aussitot(): void
    {
        $this->refus();

        $this->postJson('/api/admin/radar/listings', ['text' => "Villa à vendre à Almadies, 85 000 000 FCFA, 4 chambres. Contact : 77 123 45 67\nVisite sur rendez-vous."])
            ->assertCreated();

        $annonce = RadarListing::query()->sole();
        $this->assertSame(RadarListingStage::Purged, $annonce->stage);
        $this->assertNull($annonce->raw_text);
        $this->assertSame($this->annonceur->id, $annonce->radar_advertiser_id);
        $this->assertNull($this->annonceur->fresh()->phone);
    }

    public function test_un_numero_rattache_a_la_main_apres_un_stop_purge_l_annonce_aussitot(): void
    {
        $this->refus();
        $annonce = RadarListing::factory()->extracted(['phones' => ['+221789998877'], 'phones_dropped' => [self::NUMERO_ANNONCEUR]])
            ->create(['raw_text' => 'Appartement à louer, contact 77 123 45 67', 'stage' => RadarListingStage::Extracted, 'radar_advertiser_id' => null]);

        $this->putJson("/api/admin/radar/listings/{$annonce->id}/advertiser", ['phone' => self::NUMERO_ANNONCEUR])->assertOk();

        $apres = $annonce->fresh();
        $this->assertSame(RadarListingStage::Purged, $apres->stage);
        $this->assertNull($apres->raw_text);
        $this->assertNull($apres->extracted);
    }
}
