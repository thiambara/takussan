<?php

namespace Tests\Feature\Radar;

use App\Models\CreditWelcomeGrant;
use App\Models\Enums\ContactLeadChannel;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Models\RadarConsent;
use App\Models\User;
use App\Services\Radar\ClaimLinks;
use App\Support\PhoneFingerprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\FixturesDePublicationRadar;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2394 (ADR-0077, lot 4 ; AC1, AC1b) — la relance d'activation cite les chiffres RÉELS de sa période : les vues au-delà de
 * la ligne de base, les demandes datées de la période, les crédits que l'activation offrira encore ; et rien ne part pour un
 * annonceur STOP, révoqué, déjà activé, sans bien en ligne, ou dont la période n'a pas une semaine.
 */
class RadarActivationReminderTest extends TestCase
{
    use FixturesDePublicationRadar;
    use OperateursPlateforme;
    use RefreshDatabase;

    private const T0 = '2026-10-01 09:00:00';

    /** @var list<Property> */
    private array $biens = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse(self::T0));
        $this->installerLaPublication();
        $a = $this->annonceConsentie();
        $b = $this->annonceConsentie();
        $ids = array_column($this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publish", ['listing_ids' => [$a->id, $b->id]])
            ->assertCreated()->json('data.properties'), 'id');
        $this->biens = Property::query()->whereIn('id', $ids)->orderBy('id')->get()->all();
    }

    private function relance(string $locale = 'fr'): TestResponse
    {
        return $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/activation-reminder?locale={$locale}");
    }

    /** La prise en charge dure 10 minutes : après un saut dans le temps, l'opérateur la reprend avant d'envoyer. */
    private function envoyer(string $locale = 'fr', bool $reprendre = true): TestResponse
    {
        if ($reprendre) {
            $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/claim")->assertOk();
        }

        return $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/activation-reminder/sent", ['locale' => $locale]);
    }

    private function vues(Property $bien, int $vues): void
    {
        Property::query()->whereKey($bien->id)->toBase()->update(['views_count' => $vues]);
    }

    private function piste(Property $bien, string $quand, ContactLeadChannel $canal = ContactLeadChannel::Form): void
    {
        $piste = PropertyContactLead::factory()->create(['property_id' => $bien->id, 'channel' => $canal]);
        $piste->forceFill(['created_at' => Carbon::parse($quand)])->save();
    }

    private function visite(Property $bien, string $quand): void
    {
        $visite = PropertyVisit::factory()->create(['property_id' => $bien->id]);
        $visite->forceFill(['created_at' => Carbon::parse($quand)])->save();
    }

    private function compte(): User
    {
        return User::query()->findOrFail($this->annonceur->fresh()->user_id);
    }

    private function assertRienEnvoye(): void
    {
        $annonceur = $this->annonceur->fresh();
        $this->assertNull($annonceur->activation_reminded_at);
        $this->assertSame(0, $annonceur->activation_reminder_count);
        $this->assertNull($annonceur->activation_baseline);
        $this->assertSame(0, Activity::query()->where('event', 'radar_activation_reminder_sent')->count());
    }

    // --- AC1 : les chiffres réels de la période --------------------------------------------------------------------------

    public function test_ac1_la_relance_cite_les_vues_les_demandes_et_les_credits_de_la_periode(): void
    {
        [$b1, $b2] = $this->biens;
        $this->travelTo(Carbon::parse(self::T0)->addDays(8));
        $this->vues($b1, 14);
        $this->vues($b2, 3);
        $this->piste($b1, '2026-10-03 10:00:00');
        $this->piste($b1, '2026-10-05 10:00:00', ContactLeadChannel::Whatsapp);
        $this->piste($b2, '2026-10-06 10:00:00', ContactLeadChannel::Call);
        // Avant la mise en ligne : hors période, elle ne compte pas.
        $this->piste($b2, '2026-09-30 10:00:00');
        $this->visite($b2, '2026-10-04 10:00:00');

        $reponse = $this->relance()->assertOk()
            ->assertJsonPath('data.state', 'activation')
            ->assertJsonPath('data.blocking', [])
            ->assertJsonPath('data.figures.since', '2026-10-01T09:00:00+00:00')
            ->assertJsonPath('data.figures.views', 17)
            ->assertJsonPath('data.figures.contact_requests', 3)
            ->assertJsonPath('data.figures.visit_requests', 1)
            ->assertJsonPath('data.figures.welcome_credits', 500)
            ->assertJsonPath('data.figures.properties.0.id', $b1->id)
            ->assertJsonPath('data.figures.properties.0.views', 14)
            ->assertJsonPath('data.figures.properties.0.contact_requests', 2)
            ->assertJsonPath('data.figures.properties.1.visit_requests', 1)
            ->assertJsonPath('data.version', 'activation.v1');

        $lien = app(ClaimLinks::class)->url($this->annonceur->fresh(), now(), 'fr');
        $attendu = "Bonjour Awa, voici ce que vos annonces sur Takussan ont reçu depuis le 1 octobre :\n"
            ."- vues : 17\n"
            ."- demandes de contact : 3\n"
            ."- demandes de visite : 1\n"
            ."À l'activation de votre compte, 500 crédits vous sont offerts pour mettre vos annonces en avant.\n"
            ."\n"
            ."Activez votre compte avec un code reçu par SMS à ce numéro pour répondre à ces demandes et gérer vos annonces : {$lien}\n"
            ."\n"
            .'Répondez STOP pour les retirer et ne plus être contacté.';
        $this->assertSame($attendu, $reponse->json('data.text'));
        $this->assertStringStartsWith('https://wa.me/221771234567?text=', $reponse->json('data.wa_me'));
        $this->assertSame($attendu, urldecode(substr($reponse->json('data.wa_me'), strlen('https://wa.me/221771234567?text='))));
    }

    public function test_ac1_la_relance_en_anglais_porte_les_memes_chiffres(): void
    {
        $this->travelTo(Carbon::parse(self::T0)->addDays(7));
        $this->vues($this->biens[0], 1200);

        $texte = $this->relance('en')->assertOk()->json('data.text');

        $this->assertStringContainsString('since 1 October:', $texte);
        $this->assertStringContainsString("- views: 1,200\n- contact requests: 0\n- visit requests: 0\n", $texte);
        $this->assertStringContainsString('you get 500 free credits', $texte);
    }

    public function test_ac1_apres_un_envoi_la_periode_suivante_part_de_la_ligne_de_base(): void
    {
        [$b1, $b2] = $this->biens;
        $this->travelTo(Carbon::parse(self::T0)->addDays(8));
        $this->vues($b1, 14);
        $this->piste($b1, '2026-10-03 10:00:00');
        $this->envoyer()->assertOk();

        $this->travelTo(Carbon::parse(self::T0)->addDays(15));
        $this->vues($b1, 20);
        $this->vues($b2, 2);
        $this->piste($b2, '2026-10-12 10:00:00');

        $this->relance()->assertOk()
            ->assertJsonPath('data.blocking', [])
            ->assertJsonPath('data.figures.since', '2026-10-09T09:00:00+00:00')
            ->assertJsonPath('data.figures.views', 8)
            ->assertJsonPath('data.figures.properties.0.views', 6)
            ->assertJsonPath('data.figures.contact_requests', 1)
            ->assertJsonPath('data.reminders.count', 1)
            ->assertJsonPath('data.reminders.last_at', '2026-10-09T09:00:00+00:00');
    }

    public function test_ac1_sans_credits_a_offrir_la_ligne_des_credits_sort_du_texte(): void
    {
        $this->travelTo(Carbon::parse(self::T0)->addDays(7));
        CreditWelcomeGrant::query()->create([
            'phone_hash' => PhoneFingerprint::of(self::NUMERO_ANNONCEUR), 'agency_id' => null, 'user_id' => null, 'granted_at' => now(),
        ]);

        $reponse = $this->relance()->assertOk()->assertJsonPath('data.figures.welcome_credits', 0);

        $this->assertStringNotContainsString('crédits', $reponse->json('data.text'));
        $this->assertStringContainsString("- demandes de visite : 0\n\nActivez votre compte", $reponse->json('data.text'));
    }

    public function test_l_envoi_pose_la_ligne_de_base_et_journalise_les_chiffres_cites(): void
    {
        [$b1, $b2] = $this->biens;
        $this->travelTo(Carbon::parse(self::T0)->addDays(7));
        $this->vues($b1, 5);
        $this->piste($b2, '2026-10-02 10:00:00');

        $this->envoyer('en')->assertOk()
            ->assertJsonPath('data.reminders.count', 1)
            ->assertJsonPath('data.blocking', ['radar.activation.too_soon'])
            ->assertJsonPath('data.text', null);

        $annonceur = $this->annonceur->fresh();
        $this->assertSame(1, $annonceur->activation_reminder_count);
        $this->assertTrue(now()->equalTo($annonceur->activation_reminded_at));
        $this->assertSame([(string) $b1->id => 5, (string) $b2->id => 0], $annonceur->activation_baseline);

        $ligne = Activity::query()->where('event', 'radar_activation_reminder_sent')->sole();
        $this->assertSame($this->operateur->id, $ligne->causer_id);
        $this->assertSame($this->annonceur->id, $ligne->subject_id);
        $this->assertSame('en', $ligne->properties['locale']);
        $this->assertSame('activation.v1', $ligne->properties['version']);
        $this->assertSame(1, $ligne->properties['rank']);
        $this->assertSame(5, $ligne->properties['figures']['views']);
        $this->assertSame(1, $ligne->properties['figures']['contact_requests']);
        $this->assertSame(500, $ligne->properties['figures']['welcome_credits']);
    }

    // --- AC1b : les gardes -----------------------------------------------------------------------------------------------

    public function test_ac1b_une_periode_de_moins_d_une_semaine_ne_se_relance_pas(): void
    {
        $this->travelTo(Carbon::parse(self::T0)->addDays(6)->addHours(23));

        $this->relance()->assertOk()
            ->assertJsonPath('data.blocking', ['radar.activation.too_soon'])
            ->assertJsonPath('data.available_at', '2026-10-08T09:00:00+00:00')
            ->assertJsonPath('data.figures.views', 0)
            ->assertJsonPath('data.text', null)
            ->assertJsonPath('data.wa_me', null);
        $this->envoyer()->assertStatus(422)->assertJsonPath('code', 'radar.activation.too_soon');
        $this->assertRienEnvoye();
    }

    public function test_ac1b_la_periode_se_regle_par_la_configuration(): void
    {
        config(['radar.activation.min_interval_days' => 0]);

        $this->relance()->assertOk()->assertJsonPath('data.blocking', []);
    }

    public function test_ac1b_un_annonceur_stop_ne_se_relance_pas(): void
    {
        $this->travelTo(Carbon::parse(self::T0)->addDays(8));
        $this->annonceur->forceFill(['do_not_contact_at' => now()])->save();

        $this->relance()->assertOk()
            ->assertJsonPath('data.blocking.0', 'radar.advertiser.do_not_contact')
            ->assertJsonPath('data.text', null)
            ->assertJsonPath('data.wa_me', null);
        $this->envoyer()->assertStatus(422)->assertJsonPath('code', 'radar.advertiser.do_not_contact');
        $this->assertRienEnvoye();
    }

    public function test_ac1b_un_accord_revoque_ne_se_relance_pas(): void
    {
        $this->travelTo(Carbon::parse(self::T0)->addDays(8));
        RadarConsent::query()->where('radar_advertiser_id', $this->annonceur->id)->update(['revoked_at' => now()]);

        $this->relance()->assertOk()->assertJsonPath('data.blocking', ['radar.activation.revoked'])->assertJsonPath('data.text', null);
        $this->envoyer()->assertStatus(422)->assertJsonPath('code', 'radar.activation.revoked');
        $this->assertRienEnvoye();
    }

    /** Un numéro purgé (ADR-0077 §9) : personne à qui écrire, le lien d'activation rendrait 410. */
    public function test_ac1b_un_numero_purge_ne_se_relance_pas(): void
    {
        $this->travelTo(Carbon::parse(self::T0)->addDays(8));
        $this->annonceur->forceFill(['phone' => null])->save();

        $this->relance()->assertOk()
            ->assertJsonPath('data.blocking', ['radar.activation.revoked'])
            ->assertJsonPath('data.text', null)
            ->assertJsonPath('data.wa_me', null);
        $this->envoyer()->assertStatus(422)->assertJsonPath('code', 'radar.activation.revoked');
        $this->assertRienEnvoye();
    }

    public function test_ac1b_un_compte_deja_active_ne_se_relance_pas(): void
    {
        $this->travelTo(Carbon::parse(self::T0)->addDays(8));
        $this->compte()->forceFill(['phone_verified_at' => now()])->save();

        $this->relance()->assertOk()->assertJsonPath('data.blocking', ['radar.activation.already_active'])->assertJsonPath('data.text', null);
        $this->envoyer()->assertStatus(422)->assertJsonPath('code', 'radar.activation.already_active');
        $this->assertRienEnvoye();
    }

    public function test_ac1b_un_compte_supprime_ne_se_relance_pas(): void
    {
        $this->travelTo(Carbon::parse(self::T0)->addDays(8));
        $this->compte()->delete();

        $this->relance()->assertOk()->assertJsonPath('data.blocking', ['radar.advertiser.account_unavailable'])->assertJsonPath('data.text', null);
        $this->envoyer()->assertStatus(422);
        $this->assertRienEnvoye();
    }

    /** ADR-0079 — un annonceur publié sous mandat ET rattaché depuis à un compte (reprise, TCK-2421) : ses biens n'y sont pas. */
    public function test_ac1b_un_annonceur_sous_mandat_ne_se_relance_pas(): void
    {
        $this->travelTo(Carbon::parse(self::T0)->addDays(8));
        $this->annonceur->forceFill(['mandate_at' => now()])->save();

        $this->relance()->assertOk()->assertJsonPath('data.blocking', ['radar.activation.under_mandate'])->assertJsonPath('data.text', null);
        $this->envoyer()->assertStatus(422)->assertJsonPath('code', 'radar.activation.under_mandate');
        $this->assertRienEnvoye();
    }

    public function test_ac1b_sans_bien_en_ligne_rien_ne_se_relance(): void
    {
        $this->travelTo(Carbon::parse(self::T0)->addDays(8));
        foreach ($this->biens as $bien) {
            Property::query()->whereKey($bien->id)->update(['visibility' => PropertyVisibility::Private]);
        }

        $this->relance()->assertOk()
            ->assertJsonPath('data.blocking', ['radar.activation.nothing_published'])
            ->assertJsonPath('data.figures', null)
            ->assertJsonPath('data.text', null);
        $this->envoyer()->assertStatus(422)->assertJsonPath('code', 'radar.activation.nothing_published');
        $this->assertRienEnvoye();
    }

    public function test_ac1b_connexion_par_telephone_eteinte_rien_ne_se_relance(): void
    {
        $this->travelTo(Carbon::parse(self::T0)->addDays(8));
        config(['auth.phone_login.enabled' => false]);

        $this->relance()->assertOk()->assertJsonPath('data.blocking', ['radar.publish.activation_unavailable'])->assertJsonPath('data.text', null);
        $this->envoyer()->assertStatus(422);
        $this->assertRienEnvoye();
    }

    public function test_l_envoi_exige_la_prise_en_charge(): void
    {
        $this->travelTo(Carbon::parse(self::T0)->addDays(8));
        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/claim")->assertOk();
        $this->deleteJson("/api/admin/radar/advertisers/{$this->annonceur->id}/claim")->assertNoContent();

        $this->envoyer(reprendre: false)->assertStatus(409)->assertJsonPath('code', 'radar.advertiser.claim_required');
        $this->assertRienEnvoye();
    }

    public function test_sans_compte_cree_par_le_radar_il_n_y_a_rien_a_relancer(): void
    {
        DB::table('radar_advertisers')->where('id', $this->annonceur->id)->update(['user_id' => null]);

        $this->relance()->assertOk()
            ->assertJsonPath('data.state', 'none')
            ->assertJsonPath('data.blocking', [])
            ->assertJsonPath('data.figures', null)
            ->assertJsonPath('data.text', null);
    }

    public function test_le_support_lit_et_envoie_la_relance(): void
    {
        $this->travelTo(Carbon::parse(self::T0)->addDays(8));
        // La prise du `super_admin` a expiré (10 minutes) : le support la prend à son tour.
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $this->relance()->assertOk()->assertJsonPath('data.blocking', []);
        $this->envoyer()->assertOk()->assertJsonPath('data.reminders.count', 1);
    }
}
