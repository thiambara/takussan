<?php

namespace Tests\Feature\Radar;

use App\Jobs\Radar\PurgeRadarAdvertiser;
use App\Models\Agency;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\UserStatus;
use App\Models\Property;
use App\Models\RadarConsent;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Models\User;
use App\Support\RadarPhone;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\FixturesDePublicationRadar;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2391 (ADR-0077 §8, AC1) — la révocation retire du public sur-le-champ : les biens publiés par le Radar quittent les routes
 * publiques, les accords sont retirés, l'annonceur ne se contacte plus et son empreinte garde le refus. Son compte reste.
 */
class AdvertiserRevocationTest extends TestCase
{
    use FixturesDePublicationRadar;
    use OperateursPlateforme;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerLaPublication();
        // La purge de l'annonceur part en file après le commit : ici on éprouve la révocation, `RadarPurgeTest` la purge.
        Queue::fake();
    }

    /** @return list<Property> les biens publiés par le geste de l'opérateur, comme en production */
    private function publier(int $annonces = 2): array
    {
        $ids = [];
        for ($i = 0; $i < $annonces; $i++) {
            $ids[] = $this->annonceConsentie()->id;
        }
        $reponse = $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publish", ['listing_ids' => $ids])->assertCreated();

        return Property::query()->whereIn('id', array_column($reponse->json('data.properties'), 'id'))->orderBy('id')->get()->all();
    }

    private function revoquer(?string $motif = 'Demande de l\'annonceur par WhatsApp'): TestResponse
    {
        return $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/revoke", $motif === null ? [] : ['reason' => $motif]);
    }

    public function test_ac1_apres_la_revocation_les_biens_ne_sont_plus_servis_par_les_routes_publiques(): void
    {
        [$a, $b] = $this->publier();
        $this->getJson("/api/public/properties/{$a->slug}")->assertOk();
        $this->getJson("/api/public/properties/{$b->slug}")->assertOk();
        $this->assertSame(2, Property::query()->public()->count());

        $reponse = $this->revoquer()->assertOk()
            ->assertJsonPath('data.advertiser_id', $this->annonceur->id)
            ->assertJsonPath('data.retired_property_ids', [$a->id, $b->id])
            ->assertJsonPath('data.account_user_id', $this->annonceur->fresh()->user_id);
        $this->assertNotNull($reponse->json('data.do_not_contact_at'));

        $this->getJson("/api/public/properties/{$a->slug}")->assertNotFound();
        $this->getJson("/api/public/properties/{$b->slug}")->assertNotFound();
        $this->assertSame(0, Property::query()->public()->count());
        $this->assertSame([], $this->getJson('/api/public/properties')->json('data'));

        foreach ([$a, $b] as $bien) {
            $bien->refresh();
            $this->assertSame(PropertyStatus::Archived, $bien->status);
            $this->assertSame(PropertyVisibility::Private, $bien->visibility);
            $this->assertNull($bien->published_at);
            $this->assertNotNull($bien->archived_at);
        }
    }

    public function test_la_revocation_retire_les_accords_garde_l_empreinte_et_laisse_le_compte(): void
    {
        $this->publier(1);
        $compte = User::query()->where('phone', self::NUMERO_ANNONCEUR)->sole();
        $agences = Agency::query()->count();
        $accord = RadarConsent::query()->valid()->sole();

        $this->revoquer()->assertOk()->assertJsonPath('data.revoked_consent_ids', [$accord->id]);

        $annonceur = $this->annonceur->fresh();
        $this->assertNotNull($annonceur->do_not_contact_at);
        $this->assertSame(RadarPhone::hmac(self::NUMERO_ANNONCEUR), $annonceur->phone_hmac);
        $this->assertNotNull($accord->fresh()->revoked_at);
        $this->assertSame(0, RadarConsent::query()->valid()->count());
        // Le compte reste, ouvert : le supprimer est un geste à part, le bloquer est interdit.
        $this->assertSame($compte->id, $annonceur->user_id);
        $apres = User::query()->findOrFail($compte->id);
        $this->assertSame($compte->status, $apres->status);
        $this->assertNotSame(UserStatus::Blocked, $apres->status);
        $this->assertNull($apres->deleted_at);
        $this->assertTrue($apres->canOpenSession());
        $this->assertSame($agences, Agency::query()->count());
    }

    public function test_une_annonce_publiee_reste_publiee_et_les_annonces_ouvertes_se_ferment(): void
    {
        [$bien] = $this->publier(1);
        $revue = RadarListing::factory()->reviewed()->create(['radar_advertiser_id' => $this->annonceur->id, 'stage' => RadarListingStage::Reviewed]);
        $ecartee = RadarListing::factory()->extracted()->create(['radar_advertiser_id' => $this->annonceur->id, 'stage' => RadarListingStage::Discarded]);

        $this->revoquer()->assertOk()->assertJsonPath('data.closed_listing_ids', [$revue->id]);

        $this->assertSame(RadarListingStage::DoNotContact, $revue->fresh()->stage);
        $this->assertSame(RadarListingStage::Discarded, $ecartee->fresh()->stage);
        $publiee = RadarListing::query()->where('property_id', $bien->id)->sole();
        $this->assertSame(RadarListingStage::Published, $publiee->stage);
    }

    public function test_le_journal_nomme_les_gestes_jamais_un_numero(): void
    {
        [$bien] = $this->publier(1);
        $this->revoquer('Retrait demandé par le titulaire')->assertOk();

        $ligne = Activity::query()->where('event', 'radar_advertiser_revoked')->sole();
        $this->assertSame($this->operateur->id, $ligne->causer_id);
        $this->assertSame($this->annonceur->id, $ligne->subject_id);
        $this->assertSame('Retrait demandé par le titulaire', $ligne->properties['reason']);
        $this->assertSame([$bien->id], $ligne->properties['property_ids']);
        $this->assertStringNotContainsString('771234567', $ligne->toJson());
    }

    public function test_la_revocation_met_la_purge_de_l_annonceur_en_file_apres_le_commit(): void
    {
        $this->publier(1);

        $this->revoquer()->assertOk();

        Queue::assertPushed(PurgeRadarAdvertiser::class, fn (PurgeRadarAdvertiser $job) => $job->advertiserId === $this->annonceur->id);
    }

    public function test_rejouee_elle_garde_la_premiere_date_et_ne_retire_que_ce_qui_est_encore_public(): void
    {
        [$a, $b] = $this->publier();
        $premiere = $this->revoquer()->assertOk()->json('data.do_not_contact_at');
        $this->travel(2)->days();
        // L'annonceur, propriétaire de son compte, republie un bien : la révocation rejouée le retire de nouveau, pas l'autre.
        $a->refresh()->forceFill(['status' => PropertyStatus::Available, 'visibility' => PropertyVisibility::Public, 'published_at' => now(), 'archived_at' => null])->save();
        $archiveLe = $b->fresh()->archived_at;

        $this->revoquer()->assertOk()
            ->assertJsonPath('data.do_not_contact_at', $premiere)
            ->assertJsonPath('data.retired_property_ids', [$a->id])
            ->assertJsonPath('data.closed_listing_ids', [])
            ->assertJsonPath('data.revoked_consent_ids', []);

        $this->assertSame(PropertyStatus::Archived, $a->fresh()->status);
        $this->assertTrue($archiveLe->equalTo($b->fresh()->archived_at));
    }

    public function test_un_bien_deja_sorti_du_public_n_est_pas_touche_et_un_bien_vendu_ferme_seulement_sa_vitrine(): void
    {
        [$archive, $vendu] = $this->publier();
        $archive->forceFill(['status' => PropertyStatus::Archived, 'visibility' => PropertyVisibility::Private, 'published_at' => null, 'archived_at' => now()->subDays(5)])->save();
        $vendu->forceFill(['status' => PropertyStatus::Sold])->save();
        $archiveLe = $archive->fresh()->archived_at;

        $this->revoquer()->assertOk()->assertJsonPath('data.retired_property_ids', [$vendu->id]);

        $this->assertTrue($archiveLe->equalTo($archive->fresh()->archived_at));
        $vendu->refresh();
        $this->assertSame(PropertyStatus::Sold, $vendu->status);
        $this->assertSame(PropertyVisibility::Private, $vendu->visibility);
        $this->assertNull($vendu->published_at);
    }

    public function test_le_motif_est_exige(): void
    {
        $this->publier(1);

        $this->revoquer(null)->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->revoquer('  ')->assertStatus(422)->assertJsonValidationErrors('reason');

        $this->assertNull($this->annonceur->fresh()->do_not_contact_at);
        $this->assertSame(1, Property::query()->public()->count());
    }

    public function test_seul_le_super_admin_revoque(): void
    {
        $this->publier(1);
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $this->revoquer()->assertForbidden();

        $this->assertNull($this->annonceur->fresh()->do_not_contact_at);
        $this->assertSame(1, Property::query()->public()->count());
    }

    public function test_un_stop_enregistre_apres_la_publication_retire_aussi_les_biens(): void
    {
        [$bien] = $this->publier(1);
        // Une annonce lue depuis, démarchée : le STOP vient de ce message-là.
        $nouvelle = RadarListing::factory()->reviewed()->create(['radar_advertiser_id' => $this->annonceur->id, 'stage' => RadarListingStage::Contacted]);
        $message = RadarOutreach::factory()->withListings($nouvelle)->sent()->create([
            'radar_advertiser_id' => $this->annonceur->id, 'created_by_id' => $this->operateur->id, 'sent_by_id' => $this->operateur->id,
        ]);
        $this->assertSame(1, Property::query()->public()->count());

        $this->postJson("/api/admin/radar/outreaches/{$message->id}/outcome", ['outcome' => 'stop'])->assertOk();

        $this->assertSame(0, Property::query()->public()->count());
        $this->assertSame(PropertyStatus::Archived, $bien->fresh()->status);
        $this->getJson("/api/public/properties/{$bien->slug}")->assertNotFound();
        $this->assertNotNull($this->annonceur->fresh()->do_not_contact_at);
        $ligne = Activity::query()->where('event', 'radar_outreach_outcome')->sole();
        $this->assertSame([$bien->id], $ligne->properties['property_ids']);
    }
}
