<?php

namespace Tests\Feature\Radar;

use App\Models\Agency;
use App\Models\CreditWelcomeGrant;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\ReferentialStatus;
use App\Models\GeoNeighborhood;
use App\Models\Property;
use App\Models\PropertyContact;
use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Testing\TestResponse;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\FakeSmsRouter;
use Tests\Support\FixturesDePublicationRadar;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2389 (ADR-0077 §6, AC2 à AC4) — « Publier pour lui » : sur l'accord confirmé, l'annonce devient un bien public dans
 * l'espace d'un compte créé pour l'annonceur, dont le numéro est le contact sur place. Rien n'est écrit si une garde
 * refuse : l'écran n'est pas la garde.
 */
class RadarPublishTest extends TestCase
{
    use FixturesDePublicationRadar;
    use OperateursPlateforme;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerLaPublication();
    }

    private function publier(array $ids, array $entetes = []): TestResponse
    {
        return $this->withHeaders($entetes)->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publish", ['listing_ids' => $ids]);
    }

    /** @return array<string, int> */
    private function compte(): array
    {
        return [
            'users' => User::query()->count(), 'agencies' => Agency::query()->count(),
            'properties' => Property::query()->count(), 'contacts' => PropertyContact::query()->count(),
            'annonceurs_lies' => (int) RadarAdvertiser::query()->whereNotNull('user_id')->count(),
        ];
    }

    private function assertRienDeCree(array $avant): void
    {
        $this->assertSame($avant, $this->compte());
        $this->assertSame(0, Activity::query()->where('event', 'radar_published')->count());
    }

    // --- AC2 : le nominal ----------------------------------------------------------------------------

    public function test_ac2_la_publication_cree_le_compte_l_espace_et_un_bien_public_par_annonce(): void
    {
        $a = $this->annonceConsentie();
        $b = $this->annonceConsentie(extracted: ['title' => ['value' => 'Studio à Ouakam'], 'price' => ['value' => 150000]]);

        $reponse = $this->publier([$a->id, $b->id])->assertCreated()
            ->assertJsonPath('data.created_account', true)
            ->assertJsonPath('data.agency.name', 'Espace de Awa')
            ->assertJsonPath('data.user.first_name', 'Awa')
            ->assertJsonPath('data.user.phone', self::NUMERO_ANNONCEUR)
            ->assertJsonCount(2, 'data.properties');

        $utilisateur = User::query()->where('phone', self::NUMERO_ANNONCEUR)->sole();
        $this->assertNull($utilisateur->password_set_at);
        $this->assertNull($utilisateur->phone_verified_at);
        $this->assertNull($utilisateur->email);
        $this->assertSame($utilisateur->id, $this->annonceur->fresh()->user_id);
        $espace = Agency::query()->where('primary_admin_id', $utilisateur->id)->sole();
        $this->assertSame(AgencyKind::Individual, $espace->kind);

        $biens = Property::query()->whereIn('id', array_column($reponse->json('data.properties'), 'id'))->orderBy('id')->get();
        $this->assertCount(2, $biens);
        foreach ($biens as $bien) {
            $this->assertSame($utilisateur->id, $bien->user_id);
            $this->assertSame($espace->id, $bien->agency_id);
            $this->assertSame(PropertyStatus::Available, $bien->status);
            $this->assertSame(PropertyVisibility::Public, $bien->visibility);
            $this->assertNotNull($bien->published_at);
            $this->assertSame(Currency::XOF, $bien->currency);
            $this->assertSame(PropertyType::Apartment, $bien->type);
            $this->assertSame(ContractType::Rent, $bien->contract_type);
            $this->assertSame('monthly', $bien->rent_period->value);
            $this->assertSame(120, (int) $bien->area);
            $this->assertSame([3, 2], [(int) $bien->bedrooms, (int) $bien->bathrooms]);
            $this->assertFalse($bien->furnished);
            $this->assertContains($bien->metadata['radar_listing_id'], [$a->id, $b->id]);

            $adresse = $bien->address()->first();
            $this->assertSame($this->quartier->id, $adresse->geo_neighborhood_id);
            $this->assertSame('SN', $adresse->country);

            $contact = $bien->contacts()->sole();
            $this->assertSame(self::NUMERO_ANNONCEUR, $contact->phone);
            $this->assertTrue($contact->has_whatsapp);
            $this->assertNull($contact->label);
            $this->assertSame(0, $contact->position);
        }
        $this->assertSame(150000, (int) $biens->firstWhere('title', 'Studio à Ouakam')->price);

        foreach ([$a, $b] as $annonce) {
            $annonce->refresh();
            $this->assertSame(RadarListingStage::Published, $annonce->stage);
            $this->assertNull($annonce->stage_reason);
            $this->assertSame($annonce->id, $biens->firstWhere('id', $annonce->property_id)->metadata['radar_listing_id']);
        }

        $reponse->assertJsonPath('data.properties.0.radar_listing_id', $a->id);
        $this->assertStringContainsString('/'.$biens[0]->slug, $reponse->json('data.properties.0.public_url'));

        $ligne = Activity::query()->where('event', 'radar_published')->sole();
        $this->assertSame($this->operateur->id, $ligne->causer_id);
        $this->assertSame($this->annonceur->id, $ligne->subject_id);
        $this->assertSame($utilisateur->id, $ligne->properties['user_id']);
        $this->assertSame($espace->id, $ligne->properties['agency_id']);
        $this->assertTrue($ligne->properties['created_account']);
        $this->assertEquals([$a->id, $b->id], $ligne->properties['listing_ids']);
        $this->assertCount(2, $ligne->properties['property_ids']);
    }

    public function test_le_public_voit_le_bien_et_le_numero_de_l_annonceur(): void
    {
        $annonce = $this->annonceConsentie();
        $reponse = $this->publier([$annonce->id])->assertCreated();
        $slug = $reponse->json('data.properties.0.slug');

        $this->app['auth']->forgetGuards();
        $this->withHeader('Authorization', '')->getJson("/api/public/properties/{$slug}")->assertOk()
            ->assertJsonPath('data.primary_contact.has_whatsapp', true)
            ->assertJsonPath('data.primary_contact.has_phone', true);
        $this->getJson("/api/public/properties/{$slug}/contact")->assertOk()->assertExactJson(['data' => [
            ['phone' => self::NUMERO_ANNONCEUR, 'whatsapp' => true, 'label' => null, 'kind' => 'on_site'],
        ]]);
    }

    // --- AC3 : le crédit de bienvenue vient avec le code ----------------------------------------------

    public function test_ac3_aucun_credit_a_la_publication_puis_l_offre_a_la_connexion_par_code(): void
    {
        $annonce = $this->annonceConsentie();
        $this->publier([$annonce->id])->assertCreated();
        $this->assertSame(0, CreditWelcomeGrant::query()->count());

        config(['auth.phone_login.enabled' => true]);
        $this->withoutMiddleware(ThrottleRequests::class);
        $sms = FakeSmsRouter::install();
        $this->app['auth']->forgetGuards();
        $comptes = User::query()->count();

        $this->postJson('/api/auth/phone/request-code', ['phone' => self::NUMERO_ANNONCEUR])->assertStatus(202);
        $this->postJson('/api/auth/phone/verify-code', ['phone' => self::NUMERO_ANNONCEUR, 'code' => $sms->lastCodeFor(self::NUMERO_ANNONCEUR)])
            ->assertOk()->assertJsonPath('is_new_account', false);

        $this->assertSame($comptes, User::query()->count());
        $utilisateur = User::query()->where('phone', self::NUMERO_ANNONCEUR)->sole();
        $this->assertNotNull($utilisateur->phone_verified_at);
        $this->assertSame(1, CreditWelcomeGrant::query()->where('user_id', $utilisateur->id)->count());
    }

    // --- AC4 : une seule publication -----------------------------------------------------------------

    public function test_ac4_deux_envois_sous_la_meme_cle_ne_publient_qu_une_fois(): void
    {
        $annonce = $this->annonceConsentie();
        $cle = ['Idempotency-Key' => 'publication-awa-0001'];

        $premier = $this->publier([$annonce->id], $cle)->assertCreated();
        $apres = $this->compte();
        $second = $this->publier([$annonce->id], $cle)->assertCreated()->assertHeader('Idempotent-Replayed', 'true');

        $this->assertSame($premier->getContent(), $second->getContent());
        $this->assertSame($apres, $this->compte());
        $this->assertSame(1, Property::query()->count());
    }

    public function test_ac4_sans_cle_le_second_envoi_des_memes_annonces_rend_409_et_ne_cree_rien(): void
    {
        $annonce = $this->annonceConsentie();
        $this->publier([$annonce->id])->assertCreated();
        $apres = $this->compte();

        $this->publier([$annonce->id])->assertStatus(409)->assertJsonPath('code', 'radar.listing.stage_conflict');

        $this->assertSame($apres, $this->compte());
        $this->assertSame(1, Activity::query()->where('event', 'radar_published')->count());
    }

    public function test_une_seconde_publication_d_une_autre_annonce_reutilise_le_compte_et_l_espace(): void
    {
        $a = $this->annonceConsentie();
        $b = $this->annonceConsentie();
        $premier = $this->publier([$a->id])->assertCreated()->assertJsonPath('data.created_account', true);

        $second = $this->publier([$b->id])->assertCreated()->assertJsonPath('data.created_account', false);

        $this->assertSame($premier->json('data.user.id'), $second->json('data.user.id'));
        $this->assertSame($premier->json('data.agency.id'), $second->json('data.agency.id'));
        $this->assertSame(1, Agency::query()->where('primary_admin_id', $premier->json('data.user.id'))->count());
        $this->assertSame(2, Property::query()->where('agency_id', $premier->json('data.agency.id'))->count());
    }

    public function test_une_annonce_envoyee_deux_fois_dans_la_meme_requete_est_dedoublonnee(): void
    {
        $annonce = $this->annonceConsentie();

        $this->publier([$annonce->id, $annonce->id, (string) $annonce->id])->assertCreated()->assertJsonCount(1, 'data.properties');

        $this->assertSame(1, Property::query()->count());
        $this->assertSame(1, PropertyContact::query()->count());
        $ligne = Activity::query()->where('event', 'radar_published')->sole();
        $this->assertEquals([$annonce->id], $ligne->properties['listing_ids'], 'le journal ne répète pas l\'annonce');
    }

    // --- Les gardes : rien n'est écrit ---------------------------------------------------------------

    public function test_sans_accord_422_et_rien_de_cree(): void
    {
        $annonce = $this->annonceConsentie(couverte: false);
        $avant = $this->compte();

        $this->publier([$annonce->id])->assertStatus(422)
            ->assertJsonPath('code', 'radar.publish.not_covered')
            ->assertJsonPath('params.listing_ids', [$annonce->id]);

        $this->assertRienDeCree($avant);
        $this->assertSame(RadarListingStage::Consented, $annonce->fresh()->stage);
    }

    public function test_un_accord_revoque_ne_couvre_plus(): void
    {
        $annonce = $this->annonceConsentie();
        RadarConsent::query()->update(['revoked_at' => now()]);
        $avant = $this->compte();

        $this->publier([$annonce->id])->assertStatus(422)->assertJsonPath('code', 'radar.publish.not_covered');

        $this->assertRienDeCree($avant);
    }

    public function test_une_annonce_hors_du_message_n_est_pas_couverte_meme_avec_une_autre_qui_l_est(): void
    {
        $couverte = $this->annonceConsentie();
        $horsMessage = $this->annonceConsentie(couverte: false);
        $avant = $this->compte();

        $this->publier([$couverte->id, $horsMessage->id])->assertStatus(422)
            ->assertJsonPath('code', 'radar.publish.not_covered')
            ->assertJsonPath('params.listing_ids', [$horsMessage->id]);

        $this->assertRienDeCree($avant);
        $this->assertSame(RadarListingStage::Consented, $couverte->fresh()->stage);
    }

    public function test_l_annonce_d_un_autre_annonceur_est_refusee(): void
    {
        $autre = RadarAdvertiser::factory()->create();
        $annonce = $this->annonceConsentie(['radar_advertiser_id' => $autre->id]);
        $avant = $this->compte();

        $this->publier([$annonce->id])->assertStatus(422)->assertJsonPath('code', 'radar.publish.listing_foreign');

        $this->assertRienDeCree($avant);
    }

    public function test_une_annonce_inconnue_est_refusee(): void
    {
        $avant = $this->compte();

        $this->publier([987654])->assertStatus(422)->assertJsonPath('code', 'radar.publish.listing_foreign');

        $this->assertRienDeCree($avant);
    }

    public function test_un_numero_deja_inscrit_refuse_la_publication_et_laisse_le_compte_intact(): void
    {
        $annonce = $this->annonceConsentie();
        $existant = User::factory()->create(['phone' => self::NUMERO_ANNONCEUR, 'phone_verified_at' => now()]);
        $empreinte = $existant->fresh()->updated_at->toIso8601String();
        $avant = $this->compte();

        $this->publier([$annonce->id])->assertStatus(422)->assertJsonPath('code', 'radar.advertiser.phone_registered');

        $this->assertRienDeCree($avant);
        $this->assertSame($empreinte, $existant->fresh()->updated_at->toIso8601String());
        $this->assertSame(RadarListingStage::Consented, $annonce->fresh()->stage);
    }

    public function test_un_stop_ferme_la_publication(): void
    {
        $annonce = $this->annonceConsentie();
        $this->annonceur->forceFill(['do_not_contact_at' => now()])->save();
        $avant = $this->compte();

        $this->publier([$annonce->id])->assertStatus(422)->assertJsonPath('code', 'radar.advertiser.do_not_contact');

        $this->assertRienDeCree($avant);
    }

    public function test_une_annonce_qui_n_est_plus_consented_rend_409(): void
    {
        $annonce = $this->annonceConsentie(['stage' => RadarListingStage::Contacted]);
        $avant = $this->compte();

        $this->publier([$annonce->id])->assertStatus(409)->assertJsonPath('code', 'radar.listing.stage_conflict');

        $this->assertRienDeCree($avant);
    }

    public function test_un_champ_requis_manquant_refuse_la_publication(): void
    {
        $annonce = $this->annonceConsentie(extracted: ['price' => ['value' => null]]);
        $avant = $this->compte();

        $this->publier([$annonce->id])->assertStatus(422)->assertJsonPath('code', 'radar.publish.missing_field');

        $this->assertRienDeCree($avant);
    }

    public function test_une_seule_annonce_refusee_n_en_publie_aucune(): void
    {
        $bonne = $this->annonceConsentie();
        $sansPhoto = $this->annonceConsentie(photos: 0);
        $avant = $this->compte();

        $this->publier([$bonne->id, $sansPhoto->id])->assertStatus(422)->assertJsonPath('code', 'radar.publish.no_photo');

        $this->assertRienDeCree($avant);
        $this->assertSame(RadarListingStage::Consented, $bonne->fresh()->stage);
    }

    public function test_sans_prise_en_charge_409(): void
    {
        $annonce = $this->annonceConsentie();
        $this->deleteJson("/api/admin/radar/advertisers/{$this->annonceur->id}/claim")->assertNoContent();
        $avant = $this->compte();

        $this->publier([$annonce->id])->assertStatus(409)->assertJsonPath('code', 'radar.advertiser.claim_required');

        $this->assertRienDeCree($avant);
    }

    public function test_le_support_et_le_viewer_ne_publient_pas(): void
    {
        $annonce = $this->annonceConsentie();
        $avant = $this->compte();

        foreach ([PlatformProfileLevel::Support, PlatformProfileLevel::Viewer] as $niveau) {
            $this->actingAsWithStepUp($this->operateur($niveau));
            $this->publier([$annonce->id])->assertForbidden();
            $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publication-preview")->assertForbidden();
            $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/published-message")->assertForbidden();
        }

        $this->assertSame($avant['properties'], $this->compte()['properties']);
        $this->assertSame(RadarListingStage::Consented, $annonce->fresh()->stage);
    }

    public function test_un_corps_sans_liste_d_annonces_rend_422(): void
    {
        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publish", [])->assertStatus(422);
        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publish", ['listing_ids' => []])->assertStatus(422);
    }

    // --- L'aperçu et le second message ----------------------------------------------------------------

    public function test_l_apercu_dit_ce_qui_bloque(): void
    {
        $prete = $this->annonceConsentie();
        $sansPhoto = $this->annonceConsentie(photos: 0);
        $enAttente = $this->annonceConsentie(['photo_urls' => ['https://a.cdn.test/p/x.jpg'], 'photo_preparation' => null], photos: 0);
        $sansPrix = $this->annonceConsentie(extracted: ['price' => ['value' => null]]);
        $horsAccord = $this->annonceConsentie(couverte: false);

        $apercu = $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publication-preview")->assertOk()
            ->assertJsonPath('data.account.exists', false)
            ->assertJsonPath('data.account.first_name', 'Awa')
            ->assertJsonPath('data.account.last_name', 'Diop')
            ->assertJsonPath('data.account.phone', self::NUMERO_ANNONCEUR)
            ->assertJsonPath('data.account.space_name', 'Espace de Awa')
            ->assertJsonPath('data.blocking', [])
            ->json('data.listings');

        $par = collect($apercu)->keyBy('id');
        $this->assertSame([], $par[$prete->id]['blocking']);
        $this->assertCount(2, $par[$prete->id]['photos']);
        $this->assertSame(['status' => 'done', 'total' => 2, 'done' => 2], $par[$prete->id]['photo_preparation']);
        $this->assertSame(['radar.publish.no_photo'], $par[$sansPhoto->id]['blocking']);
        $this->assertContains('radar.publish.photos_pending', $par[$enAttente->id]['blocking']);
        $this->assertSame(['radar.publish.missing_field'], $par[$sansPrix->id]['blocking']);
        $this->assertArrayNotHasKey($horsAccord->id, $par->all(), 'une annonce sans accord ne se présente pas à la publication');
        $this->assertSame($this->quartier->id, $par[$prete->id]['neighborhood_id']);
        $this->assertSame($this->quartier->name, $par[$prete->id]['neighborhood']);
        $this->assertSame(450000, $par[$prete->id]['price']);
    }

    public function test_un_compte_rattache_supprime_bloque_l_apercu_et_la_publication(): void
    {
        $a = $this->annonceConsentie();
        $b = $this->annonceConsentie();
        $premier = $this->publier([$a->id])->assertCreated();
        User::query()->findOrFail($premier->json('data.user.id'))->delete();
        $avant = $this->compte();

        $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publication-preview")->assertOk()
            ->assertJsonPath('data.blocking', ['radar.advertiser.account_unavailable']);
        $this->publier([$b->id])->assertStatus(422)->assertJsonPath('code', 'radar.advertiser.account_unavailable');

        $this->assertSame($avant['properties'], $this->compte()['properties']);
        $this->assertSame(RadarListingStage::Consented, $b->fresh()->stage);
    }

    public function test_un_espace_suspendu_ne_recoit_pas_les_biens_du_radar(): void
    {
        $a = $this->annonceConsentie();
        $b = $this->annonceConsentie();
        $premier = $this->publier([$a->id])->assertCreated();
        Agency::query()->findOrFail($premier->json('data.agency.id'))->forceFill(['status' => AgencyStatus::Suspended])->save();
        $avant = $this->compte();

        $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publication-preview")->assertOk()
            ->assertJsonPath('data.blocking', ['radar.advertiser.account_unavailable']);
        $this->publier([$b->id])->assertStatus(422)->assertJsonPath('code', 'radar.advertiser.account_unavailable');

        $this->assertSame($avant, $this->compte());
        $this->assertSame(RadarListingStage::Consented, $b->fresh()->stage);
    }

    public function test_l_apercu_signale_un_numero_inscrit_et_l_absence_d_accord(): void
    {
        User::factory()->create(['phone' => '77 123 45 67']);

        $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publication-preview")->assertOk()
            ->assertJsonPath('data.blocking', ['radar.advertiser.phone_registered', 'radar.publish.nothing_covered']);
        $this->assertSame(0, Property::query()->count());
    }

    public function test_le_message_porte_chaque_lien_public_et_le_lien_d_activation(): void
    {
        config(['app.frontend_url' => 'https://front.exemple.test']);
        $a = $this->annonceConsentie();
        $b = $this->annonceConsentie();
        $slugs = collect($this->publier([$a->id, $b->id])->assertCreated()->json('data.properties'))->pluck('slug');

        $message = $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/published-message?locale=fr")->assertOk()
            ->assertJsonPath('data.version', 'publie.v1');
        $texte = $message->json('data.text');

        $this->assertStringStartsWith('Bonjour Awa, vos annonces sont en ligne sur Takussan :', $texte);
        foreach ($slugs as $slug) {
            $this->assertStringContainsString("https://front.exemple.test/fr/properties/{$slug}", $texte);
        }
        $this->assertStringContainsString('https://front.exemple.test/auth/login', $texte);
        $this->assertStringContainsString('Répondez STOP', $texte);
        $this->assertStringNotContainsString('{', $texte);
        $this->assertSame('https://wa.me/221771234567?text='.rawurlencode($texte), $message->json('data.wa_me'));

        $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/published-message?locale=en")->assertOk()
            ->assertJsonPath('data.text', fn (string $t) => str_starts_with($t, 'Hello Awa,'));
        $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/published-message?locale=wo")->assertStatus(422);
    }

    public function test_le_message_sans_bien_publie_rend_422(): void
    {
        $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/published-message")->assertStatus(422)
            ->assertJsonPath('code', 'radar.publish.nothing_published');
    }

    public function test_une_publication_pendant_la_preparation_des_photos_est_refusee(): void
    {
        $annonce = $this->annonceConsentie(photos: 1);
        // Une seconde URL de la source n'est pas encore rangée : la préparation n'est pas finie.
        $annonce->forceFill(['photo_urls' => [...$annonce->photo_urls, 'https://a.cdn.test/p/pas-encore.jpg']])->save();
        $avant = $this->compte();

        $this->publier([$annonce->id])->assertStatus(422)->assertJsonPath('code', 'radar.publish.photos_pending');

        $this->assertRienDeCree($avant);
    }

    public function test_un_quartier_qui_ne_resout_plus_refuse_la_publication(): void
    {
        $annonce = $this->annonceConsentie();
        $this->quartier->forceFill(['status' => ReferentialStatus::Rejected])->save();
        $avant = $this->compte();

        $apercu = $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publication-preview")->assertOk()->json('data.listings.0.blocking');
        $this->assertContains('radar.publish.missing_field', $apercu);

        $this->publier([$annonce->id])->assertStatus(422)->assertJsonPath('code', 'radar.publish.missing_field')
            ->assertJsonPath('params.listing_id', $annonce->id)->assertJsonPath('params.fields', ['neighborhood_id']);
        $this->assertRienDeCree($avant);
    }

    /** Un quartier fusionné depuis la relecture n'est pas un quartier perdu : l'adresse suit la fusion jusqu'à la cible. */
    public function test_un_quartier_fusionne_apres_la_relecture_se_publie_sur_sa_cible(): void
    {
        $annonce = $this->annonceConsentie();
        $cible = GeoNeighborhood::factory()->create();
        $this->quartier->forceFill(['merged_into_id' => $cible->id])->save();

        $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publication-preview")->assertOk()
            ->assertJsonPath('data.blocking', [])
            ->assertJsonPath('data.listings.0.blocking', []);

        $id = $this->publier([$annonce->id])->assertCreated()->json('data.properties.0.id');

        $adresse = Property::query()->findOrFail($id)->address;
        $this->assertSame($cible->id, $adresse->geo_neighborhood_id, 'l\'adresse porte le quartier canonique');
        $this->assertSame($cible->geo_city_id, $adresse->geo_city_id);
    }

    /** Le quartier annoncé est celui où le bien sera publié : la ligne canonique, pas celle que la relecture a stockée. */
    public function test_l_apercu_nomme_le_quartier_canonique_d_un_quartier_fusionne(): void
    {
        $this->annonceConsentie();
        $cible = GeoNeighborhood::factory()->create();
        $this->quartier->forceFill(['merged_into_id' => $cible->id])->save();

        $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publication-preview")->assertOk()
            ->assertJsonPath('data.listings.0.neighborhood_id', $this->quartier->id)
            ->assertJsonPath('data.listings.0.neighborhood', $cible->name);
    }

    /** Le second message ne dépend pas de la réponse de `publish` : l'aperçu dit ce qui est déjà en ligne, pour qu'un écran le propose. */
    public function test_l_apercu_rend_les_biens_deja_publies_pour_composer_le_second_message(): void
    {
        $a = $this->annonceConsentie();
        $b = $this->annonceConsentie();
        $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publication-preview")->assertOk()
            ->assertJsonPath('data.published', []);

        $bien = $this->publier([$a->id])->assertCreated()->json('data.properties.0');

        $apercu = $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publication-preview")->assertOk();
        $apercu->assertJsonCount(1, 'data.published')
            ->assertJsonPath('data.published.0', [
                'id' => $bien['id'],
                'slug' => $bien['slug'],
                'title' => $bien['title'],
                'radar_listing_id' => $a->id,
                'public_url' => $bien['public_url'],
            ]);
        $this->assertSame([$b->id], array_column($apercu->json('data.listings'), 'id'), 'l\'annonce publiée sort des annonces à publier');
    }

    public function test_les_biens_publies_d_un_autre_annonceur_ne_figurent_pas_a_l_apercu(): void
    {
        $this->publier([$this->annonceConsentie()->id])->assertCreated();
        $autre = RadarAdvertiser::factory()->create();

        $this->getJson("/api/admin/radar/advertisers/{$autre->id}/publication-preview")->assertOk()
            ->assertJsonPath('data.published', []);
    }

    // --- Revue finale, I2 : le travail de la copie est borné avant la transaction -----------------------------

    public function test_l_apercu_annonce_le_plafond_de_photos_d_une_publication(): void
    {
        config(['radar.publish.max_photos' => 7]);

        $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publication-preview")->assertOk()
            ->assertJsonPath('data.max_photos', 7);
    }

    public function test_au_dessus_du_plafond_de_photos_la_publication_rend_422_et_ne_cree_rien(): void
    {
        config(['radar.publish.max_photos' => 3]);
        $a = $this->annonceConsentie(photos: 2);
        $b = $this->annonceConsentie(photos: 2);
        $avant = $this->compte();

        $this->publier([$a->id, $b->id])->assertStatus(422)
            ->assertJsonPath('code', 'radar.publish.too_many_photos')
            ->assertJsonPath('params', ['count' => 4, 'max' => 3]);

        $this->assertRienDeCree($avant);
        $this->assertSame(RadarListingStage::Consented, $a->fresh()->stage);
        $this->assertSame(RadarListingStage::Consented, $b->fresh()->stage);
    }

    public function test_au_plafond_de_photos_la_publication_passe_et_la_somme_se_fait_sur_les_annonces_demandees(): void
    {
        config(['radar.publish.max_photos' => 4]);
        $a = $this->annonceConsentie(photos: 2);
        $b = $this->annonceConsentie(photos: 2);
        $this->annonceConsentie(photos: 5); // hors de la requête : ne compte pas

        $this->publier([$a->id, $b->id])->assertCreated();
    }

    // --- Revue finale, I3a : sans connexion par téléphone, le compte créé ne s'ouvrirait pas -----------------

    public function test_sans_connexion_par_telephone_l_apercu_ferme_la_publication(): void
    {
        $this->annonceConsentie();
        config(['auth.phone_login.enabled' => false]);

        $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publication-preview")->assertOk()
            ->assertJsonPath('data.blocking', ['radar.publish.activation_unavailable']);
    }

    public function test_sans_connexion_par_telephone_la_publication_rend_422_et_ne_cree_rien(): void
    {
        $annonce = $this->annonceConsentie();
        $avant = $this->compte();
        config(['auth.phone_login.enabled' => false]);

        $this->publier([$annonce->id])->assertStatus(422)->assertJsonPath('code', 'radar.publish.activation_unavailable');

        $this->assertRienDeCree($avant);
        $this->assertSame(RadarListingStage::Consented, $annonce->fresh()->stage);
    }

    public function test_sans_connexion_par_telephone_le_second_message_n_est_pas_compose(): void
    {
        $this->publier([$this->annonceConsentie()->id])->assertCreated();
        config(['auth.phone_login.enabled' => false]);

        $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/published-message?locale=fr")
            ->assertStatus(422)->assertJsonPath('code', 'radar.publish.activation_unavailable');
    }

    // --- Revue finale, I3b : l'aperçu des codes OTP ouvrirait le compte du Radar à qui connaît le numéro ----------

    private function apercuDesCodes(string $environnement, bool $actif): void
    {
        app()->detectEnvironment(fn () => $environnement);
        config(['auth.otp_preview.enabled' => $actif]);
    }

    public function test_en_staging_avec_l_apercu_des_codes_actif_la_publication_est_fermee(): void
    {
        $annonce = $this->annonceConsentie();
        $avant = $this->compte();
        $this->apercuDesCodes('staging', true);

        $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publication-preview")->assertOk()
            ->assertJsonPath('data.blocking', ['radar.publish.otp_preview_active']);
        $this->publier([$annonce->id])->assertStatus(422)->assertJsonPath('code', 'radar.publish.otp_preview_active');
        $this->assertRienDeCree($avant);
        $this->assertSame(RadarListingStage::Consented, $annonce->fresh()->stage);
    }

    public function test_en_staging_avec_l_apercu_des_codes_actif_le_second_message_n_est_pas_compose(): void
    {
        $this->publier([$this->annonceConsentie()->id])->assertCreated();
        $this->apercuDesCodes('staging', true);

        $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/published-message?locale=fr")
            ->assertStatus(422)->assertJsonPath('code', 'radar.publish.otp_preview_active');
    }

    public function test_en_local_avec_l_apercu_des_codes_actif_la_publication_est_permise(): void
    {
        $annonce = $this->annonceConsentie();
        $this->apercuDesCodes('local', true);

        $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publication-preview")->assertOk()
            ->assertJsonPath('data.blocking', []);
        $this->publier([$annonce->id])->assertCreated();
    }

    public function test_en_staging_avec_l_apercu_des_codes_inactif_la_publication_est_permise(): void
    {
        $annonce = $this->annonceConsentie();
        $this->apercuDesCodes('staging', false);

        $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publication-preview")->assertOk()
            ->assertJsonPath('data.blocking', []);
        $this->publier([$annonce->id])->assertCreated();
    }

    // --- Décision 5 : le titre manquant se construit -------------------------------------------------------

    public function test_une_annonce_sans_titre_se_publie_sous_un_titre_construit_que_l_apercu_montre(): void
    {
        $sansTitre = $this->annonceConsentie(extracted: ['title' => ['value' => null], 'bedrooms' => ['value' => 3]]);
        $avecTitre = $this->annonceConsentie(extracted: ['title' => ['value' => 'Studio à Ouakam']]);
        $attendu = "Appartement 3 chambres à louer — {$this->quartier->name}";

        $apercu = collect($this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publication-preview")->assertOk()
            ->assertJsonPath('data.blocking', [])->json('data.listings'))->keyBy('id');
        $this->assertSame([], $apercu[$sansTitre->id]['blocking'], 'le titre n\'est plus un champ requis');
        $this->assertSame($attendu, $apercu[$sansTitre->id]['title']);
        $this->assertTrue($apercu[$sansTitre->id]['title_built']);
        $this->assertSame('Studio à Ouakam', $apercu[$avecTitre->id]['title'], 'le titre extrait reste prioritaire');
        $this->assertFalse($apercu[$avecTitre->id]['title_built']);

        $biens = collect($this->publier([$sansTitre->id, $avecTitre->id])->assertCreated()->json('data.properties'));

        $this->assertSame($attendu, $biens->firstWhere('radar_listing_id', $sansTitre->id)['title']);
        $this->assertSame($attendu, Property::query()->findOrFail($biens->firstWhere('radar_listing_id', $sansTitre->id)['id'])->title);
        $this->assertSame('Studio à Ouakam', $biens->firstWhere('radar_listing_id', $avecTitre->id)['title']);
    }

    public function test_le_titre_construit_dit_le_quartier_canonique_d_un_quartier_fusionne(): void
    {
        $annonce = $this->annonceConsentie(extracted: ['title' => ['value' => null]]);
        $cible = GeoNeighborhood::factory()->create();
        $this->quartier->forceFill(['merged_into_id' => $cible->id])->save();
        $attendu = "Appartement 3 chambres à louer — {$cible->name}";

        $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publication-preview")->assertOk()
            ->assertJsonPath('data.listings.0.title', $attendu);

        $this->publier([$annonce->id])->assertCreated()->assertJsonPath('data.properties.0.title', $attendu);
    }

    public function test_le_titre_construit_n_ecrit_pas_de_chambres_pour_un_terrain(): void
    {
        $this->annonceConsentie(extracted: ['title' => ['value' => null], 'property_type' => ['value' => 'land'], 'bedrooms' => ['value' => 3]]);

        $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publication-preview")->assertOk()
            ->assertJsonPath('data.listings.0.title', "Terrain à louer — {$this->quartier->name}");
    }

    public function test_le_message_d_un_annonceur_qui_a_dit_stop_n_est_pas_compose(): void
    {
        $this->publier([$this->annonceConsentie()->id])->assertCreated();
        $this->annonceur->forceFill(['do_not_contact_at' => now()])->save();

        $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/published-message")->assertStatus(422)
            ->assertJsonPath('code', 'radar.advertiser.do_not_contact');
    }
}
