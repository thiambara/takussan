<?php

namespace Tests\Feature\Radar;

use App\Domain\Features\Flag;
use App\Models\Agency;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RadarListingStage;
use App\Models\FeatureFlag;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Property;
use App\Models\PropertyContact;
use App\Models\PropertyContactLead;
use App\Models\RadarAdvertiser;
use App\Models\User;
use App\Services\Admin\PlatformSettingService;
use App\Services\Billing\QuotaResolver;
use App\Services\Radar\RadarMandate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\FixturesDePublicationRadar;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2394 (ADR-0079, proposé ; AC2, AC2b) — la publication sous mandat Takussan : rien ne se publie sous mandat tant que le
 * drapeau `radar_mandate` est éteint ; allumé, les annonces couvertes par l'accord deviennent des biens de l'espace des
 * mandats, sans compte créé, le numéro de l'annonceur en contact, sous les gardes de « publier pour lui ».
 */
class RadarMandateTest extends TestCase
{
    use FixturesDePublicationRadar;
    use OperateursPlateforme;
    use RefreshDatabase;

    private Agency $espace;

    private User $gerant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerLaPublication();
        $this->gerant = User::factory()->create(['first_name' => 'Équipe', 'last_name' => 'Takussan']);
        $this->espace = Agency::factory()->create(['name' => 'Takussan — diffusion', 'primary_admin_id' => $this->gerant->id]);
        $this->designer($this->espace->id);
    }

    private function designer(int $id): void
    {
        app(PlatformSettingService::class)->bulkUpdate(['radar.mandate_agency_id' => $id], $this->operateur);
    }

    private function allumer(): void
    {
        FeatureFlag::query()->create(['key' => Flag::RadarMandate->value, 'label' => Flag::RadarMandate->value, 'enabled' => true, 'segments_json' => []]);
    }

    private function sousMandat(array $ids): TestResponse
    {
        return $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publish-mandate", ['listing_ids' => $ids]);
    }

    private function apercu(): TestResponse
    {
        return $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publication-preview");
    }

    /** @return array<string, int> */
    private function compte(): array
    {
        return [
            'users' => User::query()->count(), 'agencies' => Agency::query()->count(),
            'properties' => Property::query()->count(), 'contacts' => PropertyContact::query()->count(),
            'mandats' => RadarAdvertiser::query()->whereNotNull('mandate_at')->count(),
            'journal' => Activity::query()->where('event', 'radar_published')->count(),
        ];
    }

    // --- AC2 : aucune publication sous mandat avant l'acceptation de l'ADR ---------------------------------------------

    public function test_ac2_le_drapeau_est_eteint_par_defaut_aucune_migration_ne_l_allume(): void
    {
        $this->assertFalse(FeatureFlag::query()->where('key', Flag::RadarMandate->value)->exists());
        $this->assertFalse(app(RadarMandate::class)->enabled());
        $this->assertFalse(Flag::RadarMandate->clientVisible());
    }

    public function test_ac2_drapeau_eteint_publish_mandate_refuse_sans_rien_ecrire_et_l_apercu_ne_propose_rien(): void
    {
        $annonce = $this->annonceConsentie();
        $avant = $this->compte();

        $this->sousMandat([$annonce->id])->assertStatus(422)->assertJsonPath('code', 'radar.mandate.disabled');

        $this->assertSame($avant, $this->compte());
        $this->assertSame(RadarListingStage::Consented, $annonce->fresh()->stage);
        $this->apercu()->assertOk()
            ->assertJsonPath('data.mandate.enabled', false)
            ->assertJsonPath('data.mandate.space', null)
            ->assertJsonPath('data.mandate.blocking', []);
    }

    public function test_ac2_un_drapeau_segmente_vaut_eteint(): void
    {
        FeatureFlag::query()->create(['key' => Flag::RadarMandate->value, 'label' => Flag::RadarMandate->value, 'enabled' => true, 'segments_json' => ['roles' => ['super_admin']]]);
        $annonce = $this->annonceConsentie();

        $this->sousMandat([$annonce->id])->assertStatus(422)->assertJsonPath('code', 'radar.mandate.disabled');
    }

    // --- AC2b : drapeau allumé -------------------------------------------------------------------------------------------

    public function test_ac2b_sous_mandat_aucun_compte_n_est_cree_et_les_biens_naissent_dans_l_espace_des_mandats(): void
    {
        $this->allumer();
        $a = $this->annonceConsentie();
        $b = $this->annonceConsentie();
        $utilisateurs = User::query()->count();

        $this->apercu()->assertOk()
            ->assertJsonPath('data.mandate.enabled', true)
            ->assertJsonPath('data.mandate.space.id', $this->espace->id)
            ->assertJsonPath('data.mandate.blocking', []);

        $reponse = $this->sousMandat([$a->id, $b->id])->assertCreated()
            ->assertJsonPath('data.mandate', true)
            ->assertJsonPath('data.user', null)
            ->assertJsonPath('data.created_account', false)
            ->assertJsonPath('data.agency.id', $this->espace->id)
            ->assertJsonCount(2, 'data.properties');

        $this->assertSame($utilisateurs, User::query()->count());
        $annonceur = $this->annonceur->fresh();
        $this->assertNull($annonceur->user_id);
        $this->assertNotNull($annonceur->mandate_at);
        $this->assertSame($this->operateur->id, $annonceur->mandate_by_id);

        foreach (Property::query()->whereIn('id', array_column($reponse->json('data.properties'), 'id'))->get() as $bien) {
            $this->assertSame($this->espace->id, $bien->agency_id);
            $this->assertSame($this->gerant->id, $bien->user_id);
            $this->assertSame(PropertyVisibility::Public, $bien->visibility);
            $this->assertTrue($bien->metadata['radar_mandate']);
            $this->assertSame(self::NUMERO_ANNONCEUR, $bien->contacts()->sole()->phone);
        }
        foreach ([$a, $b] as $annonce) {
            $this->assertSame(RadarListingStage::Published, $annonce->fresh()->stage);
        }

        $ligne = Activity::query()->where('event', 'radar_published')->sole();
        $this->assertTrue($ligne->properties['mandate']);
        $this->assertFalse($ligne->properties['created_account']);
        $this->assertSame($this->espace->id, $ligne->properties['agency_id']);
    }

    public function test_ac2b_sous_mandat_un_accord_qui_ne_couvre_pas_refuse_sans_rien_ecrire(): void
    {
        $this->allumer();
        $annonce = $this->annonceConsentie(couverte: false);
        $avant = $this->compte();

        $this->sousMandat([$annonce->id])->assertStatus(422)->assertJsonPath('code', 'radar.publish.not_covered');

        $this->assertSame($avant, $this->compte());
    }

    public function test_ac2b_sous_mandat_un_annonceur_stop_refuse(): void
    {
        $this->allumer();
        $annonce = $this->annonceConsentie();
        $this->annonceur->forceFill(['do_not_contact_at' => now()])->save();
        $avant = $this->compte();

        $this->sousMandat([$annonce->id])->assertStatus(422)->assertJsonPath('code', 'radar.advertiser.do_not_contact');
        $this->assertSame($avant, $this->compte());
    }

    public function test_ac2b_sous_mandat_la_prise_en_charge_est_exigee(): void
    {
        $this->allumer();
        $annonce = $this->annonceConsentie();
        $this->deleteJson("/api/admin/radar/advertisers/{$this->annonceur->id}/claim")->assertNoContent();

        $this->sousMandat([$annonce->id])->assertStatus(409)->assertJsonPath('code', 'radar.advertiser.claim_required');
        $this->assertNull($this->annonceur->fresh()->mandate_at);
    }

    public function test_ac2b_le_support_ne_publie_pas_sous_mandat(): void
    {
        $this->allumer();
        $annonce = $this->annonceConsentie();
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $this->sousMandat([$annonce->id])->assertForbidden();
        $this->assertNull($this->annonceur->fresh()->mandate_at);
    }

    public function test_ac2b_sans_espace_designe_rien_ne_se_publie_sous_mandat(): void
    {
        $this->allumer();
        $this->designer(0);
        $annonce = $this->annonceConsentie();

        $this->apercu()->assertOk()->assertJsonPath('data.mandate.blocking', ['radar.mandate.space_missing']);
        $this->sousMandat([$annonce->id])->assertStatus(422)->assertJsonPath('code', 'radar.mandate.space_missing');
        $this->assertSame(0, Property::query()->count());
    }

    public function test_ac2b_un_annonceur_deja_rattache_a_un_compte_ne_se_publie_pas_sous_mandat(): void
    {
        $this->allumer();
        $premiere = $this->annonceConsentie();
        $seconde = $this->annonceConsentie();
        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publish", ['listing_ids' => [$premiere->id]])->assertCreated();

        $this->apercu()->assertOk()->assertJsonPath('data.mandate.blocking', ['radar.mandate.account_exists']);
        $this->sousMandat([$seconde->id])->assertStatus(422)->assertJsonPath('code', 'radar.mandate.account_exists');
        $this->assertSame(RadarListingStage::Consented, $seconde->fresh()->stage);
    }

    public function test_ac2b_un_annonceur_sous_mandat_ne_se_publie_plus_pour_lui(): void
    {
        $this->allumer();
        $premiere = $this->annonceConsentie();
        $seconde = $this->annonceConsentie();
        $this->sousMandat([$premiere->id])->assertCreated();

        $this->apercu()->assertOk()->assertJsonPath('data.blocking', ['radar.publish.under_mandate']);
        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publish", ['listing_ids' => [$seconde->id]])
            ->assertStatus(422)->assertJsonPath('code', 'radar.publish.under_mandate');
        $this->assertNull($this->annonceur->fresh()->user_id);

        // Une seconde publication sous mandat garde la première date.
        $premiereDate = $this->annonceur->fresh()->mandate_at;
        $this->travel(5)->minutes();
        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/claim")->assertOk();
        $this->sousMandat([$seconde->id])->assertCreated();
        $this->assertTrue($premiereDate->equalTo($this->annonceur->fresh()->mandate_at));
    }

    public function test_ac2b_un_numero_deja_inscrit_n_empeche_pas_le_mandat_aucun_compte_n_est_touche(): void
    {
        $this->allumer();
        $titulaire = User::factory()->create(['phone' => self::NUMERO_ANNONCEUR]);
        config(['auth.phone_login.enabled' => false]);
        $annonce = $this->annonceConsentie();

        $this->apercu()->assertOk()
            ->assertJsonPath('data.mandate.blocking', [])
            ->assertJsonFragment(['radar.advertiser.phone_registered']);
        $this->sousMandat([$annonce->id])->assertCreated();

        $this->assertSame(0, Property::query()->where('user_id', $titulaire->id)->count());
        $this->assertNull($this->annonceur->fresh()->user_id);
    }

    public function test_ac2b_la_revocation_retire_les_biens_sous_mandat_du_public(): void
    {
        $this->allumer();
        $annonce = $this->annonceConsentie();
        $bien = $this->sousMandat([$annonce->id])->assertCreated()->json('data.properties.0.id');

        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/revoke", ['reason' => 'STOP reçu par téléphone'])->assertOk();

        $this->assertSame(PropertyVisibility::Private, Property::query()->findOrFail($bien)->visibility);
        $this->assertSame(0, Property::query()->public()->count());
    }

    public function test_le_second_message_d_un_annonceur_sous_mandat_ne_promet_aucune_activation(): void
    {
        $this->allumer();
        $annonce = $this->annonceConsentie();
        $slug = $this->sousMandat([$annonce->id])->assertCreated()->json('data.properties.0.slug');
        config(['auth.phone_login.enabled' => false]);

        $message = $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/published-message")->assertOk()
            ->assertJsonPath('data.version', 'mandat.v1')
            ->json('data.text');

        $this->assertStringStartsWith('Bonjour Awa, comme convenu, Takussan diffuse vos annonces pour votre compte :', $message);
        $this->assertStringContainsString("/fr/properties/{$slug}", $message);
        $this->assertStringNotContainsString('/claim/', $message);
        $this->assertStringNotContainsString('Activez', $message);
        // ADR-0079 § 5 : le numéro affiché est le sien ; le formulaire arrive à Takussan, qui transmet.
        $this->assertStringContainsString('Les demandes laissées par le formulaire du site arrivent à Takussan, qui vous les transmet.', $message);
    }

    // --- AC2b : les gardes de « publier pour lui », une à une sous mandat (vérification adverse I2) -------------------

    public function test_ac2b_sous_mandat_le_plafond_de_photos_refuse_sans_rien_ecrire(): void
    {
        $this->allumer();
        config(['radar.publish.max_photos' => 3]);
        $a = $this->annonceConsentie();
        $b = $this->annonceConsentie();
        $avant = $this->compte();

        $this->sousMandat([$a->id, $b->id])->assertStatus(422)->assertJsonPath('code', 'radar.publish.too_many_photos');
        $this->assertSame($avant, $this->compte());
    }

    /** Le quota se juge sur l'ESPACE DES MANDATS : c'est lui qui porte tous les biens sous mandat. */
    public function test_ac2b_sous_mandat_le_quota_de_l_espace_des_mandats_refuse_sans_rien_ecrire(): void
    {
        $this->allumer();
        $annonce = $this->annonceConsentie();
        $espaces = [];
        $this->partialMock(QuotaResolver::class, function ($mock) use (&$espaces) {
            $mock->shouldReceive('assertCanCreateActiveListing')->andReturnUsing(function (int $agencyId) use (&$espaces) {
                $espaces[] = $agencyId;
                abort_code(422, 'quota.listings_exceeded');
            });
        });
        $avant = $this->compte();

        $this->sousMandat([$annonce->id])->assertStatus(422)->assertJsonPath('code', 'quota.listings_exceeded');
        $this->assertSame([$this->espace->id], $espaces);
        $this->assertSame($avant, $this->compte());
    }

    public function test_ac2b_sous_mandat_une_annonce_sans_photo_ou_incomplete_refuse(): void
    {
        $this->allumer();
        $sansPhoto = $this->annonceConsentie(photos: 0);
        $incomplete = $this->annonceConsentie();
        $incomplete->forceFill(['extracted' => array_replace((array) $incomplete->extracted, ['price' => ['value' => null]])])->save();
        $avant = $this->compte();

        $this->sousMandat([$sansPhoto->id])->assertStatus(422)->assertJsonPath('code', 'radar.publish.no_photo');
        $this->sousMandat([$incomplete->id])->assertStatus(422)->assertJsonPath('code', 'radar.publish.missing_field');
        $this->assertSame($avant, $this->compte());
    }

    public function test_ac2b_sous_mandat_une_annonce_qui_n_est_pas_consentie_refuse(): void
    {
        $this->allumer();
        $annonce = $this->annonceConsentie();
        $annonce->forceFill(['stage' => RadarListingStage::Contacted])->save();
        $avant = $this->compte();

        $this->sousMandat([$annonce->id])->assertStatus(409)->assertJsonPath('code', 'radar.listing.stage_conflict');
        $this->assertSame($avant, $this->compte());
    }

    // --- Le destinataire réel des demandes par formulaire (vérification adverse I3) -----------------------------------

    /**
     * ADR-0079 § 5 — sous mandat, le téléphone et le WhatsApp affichés sont ceux de l'annonceur ; une demande laissée par
     * FORMULAIRE va à l'administrateur de l'espace des mandats, qui la transmet. Sans profil d'administrateur, le formulaire
     * refuse (409) : l'espace des mandats doit en avoir un.
     */
    public function test_sous_mandat_la_demande_par_formulaire_va_a_l_administrateur_de_l_espace_des_mandats(): void
    {
        $this->allumer();
        $annonce = $this->annonceConsentie();
        $slug = $this->sousMandat([$annonce->id])->assertCreated()->json('data.properties.0.slug');
        $demande = ['name' => 'Visiteur', 'phone' => '+221741112233', 'message' => 'Bonjour, toujours disponible ?'];
        $this->app['auth']->forgetGuards();

        $this->postJson("/api/public/properties/{$slug}/contact-lead", $demande)->assertStatus(409)->assertJsonPath('code', 'lead.contact_unavailable');

        AgencyAdminProfile::factory()->create(['user_id' => $this->gerant->id, 'agency_id' => $this->espace->id]);
        $this->postJson("/api/public/properties/{$slug}/contact-lead", $demande)->assertCreated();

        $piste = PropertyContactLead::query()->sole();
        $this->assertSame([$this->espace->id, $this->gerant->id], [(int) $piste->agency_id, (int) $piste->recipient_user_id]);
        // Le contact affiché, lui, est le numéro de l'annonceur.
        $this->assertSame('+221771234567', PropertyContact::query()->where('property_id', $piste->property_id)->value('phone'));
    }
}
