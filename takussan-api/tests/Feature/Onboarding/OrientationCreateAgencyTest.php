<?php

namespace Tests\Feature\Onboarding;

use App\Events\Onboarding\SpaceCreated;
use App\Exceptions\ApiError;
use App\Models\Address;
use App\Models\Agency;
use App\Models\AgencySubscription;
use App\Models\AgencyUpgradeRequest;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyUpgradeRequestStatus;
use App\Models\Enums\Currency;
use App\Models\Enums\KycDossierStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\GeoCity;
use App\Models\KycDossier;
use App\Models\PlatformPayout;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-2937 (ADR-0125) — « Créer mon espace pro » : `POST /api/me/agencies` ouvre une agence
 * `standard` tout de suite, vérifiée ensuite. D'ici là elle travaille en interne (inviter), mais ne
 * met aucun bien en ligne, n'a pas de fiche publique et n'est pas reversée.
 */
class OrientationCreateAgencyTest extends TestCase
{
    use RefreshDatabase;

    private const ROUTE = '/api/me/agencies';

    private function pro(array $attributs = []): User
    {
        $user = User::factory()->create($attributs + ['phone' => '+221770002937', 'phone_verified_at' => now()]);
        Sanctum::actingAs($user);

        return $user;
    }

    private function ouvrir(array $corps = []): TestResponse
    {
        return $this->postJson(self::ROUTE, $corps + ['name' => 'Keur Immo']);
    }

    private function ouverte(): Agency
    {
        return Agency::query()->where('name', 'Keur Immo')->sole();
    }

    /** AC1 — agence `standard` non vérifiée, admin principal actif, dossier ouvert ; aucun espace individuel. */
    public function test_l_agence_s_ouvre_standard_non_verifiee_avec_son_admin_et_son_dossier(): void
    {
        Event::fake([SpaceCreated::class]);
        $ville = GeoCity::factory()->create(['name' => 'Thiès']);
        $user = $this->pro();

        $reponse = $this->ouvrir(['geo_city_id' => $ville->id])->assertCreated();

        $agence = $this->ouverte();
        $this->assertSame(AgencyKind::Standard, $agence->kind);
        // TCK-3018 — l'agence ouverte en libre-service tient sa devise du code, en XOF : la factory pose
        // `currency`, et ce chemin était le seul des trois (console, hôte, libre-service) sans garde.
        $this->assertSame(Currency::XOF, $agence->currency);
        $this->assertFalse($agence->is_verified);
        $this->assertNotNull($agence->self_opened_at);
        $this->assertTrue($agence->awaitsFirstVerification());
        $this->assertSame($user->id, (int) $agence->primary_admin_id);
        $this->assertSame('+221770002937', $agence->phone, 'le téléphone du compte, à défaut d\'un autre');

        $profil = AgencyAdminProfile::query()->where('user_id', $user->id)->sole();
        $this->assertSame($agence->id, (int) $profil->agency_id);
        $this->assertSame(AgencyAdminProfileStatus::Active, $profil->status);

        $dossier = KycDossier::query()->where('subject_type', Agency::class)->where('subject_id', $agence->id)->sole();
        $this->assertSame(KycDossierStatus::Pending, $dossier->status);

        $this->assertSame(1, Agency::query()->count(), 'aucun espace individuel');
        $this->assertSame(0, OwnerProfile::query()->where('user_id', $user->id)->count());
        $this->assertSame(0, AgencyUpgradeRequest::query()->count());

        $siege = Address::query()->where('addressable_type', Agency::class)->where('addressable_id', $agence->id)->sole();
        $this->assertSame($ville->id, (int) $siege->geo_city_id);
        $this->assertSame('Thiès', $siege->city);

        $reponse->assertJsonPath('data.agency.id', $agence->id)
            ->assertJsonPath('data.agency.kind', 'standard')
            ->assertJsonPath('data.agency.is_verified', false)
            ->assertJsonPath('data.kyc_dossier.status', 'pending')
            ->assertCookie('active_profile_id', $reponse->json('data.active_profile_id'), false);

        // § 5 — pas de crédits de bienvenue avant la vérification.
        Event::assertNotDispatched(SpaceCreated::class);
        $this->assertTrue(Activity::query()->where('event', 'agency_self_opened')->where('subject_id', $agence->id)->exists());
    }

    public function test_le_telephone_saisi_l_emporte_et_se_normalise(): void
    {
        $this->pro();

        $this->ouvrir(['phone' => '77 123 45 67'])->assertCreated();

        $this->assertSame('+221771234567', $this->ouverte()->phone);
    }

    public function test_le_nom_est_exige_et_la_ville_doit_exister(): void
    {
        $this->pro();

        $this->postJson(self::ROUTE, [])->assertUnprocessable()->assertJsonValidationErrors('name');
        $this->ouvrir(['geo_city_id' => 999999])->assertUnprocessable()->assertJsonValidationErrors('geo_city_id');
        $this->assertSame(0, Agency::query()->count());
    }

    /** AC3 — le NINEA d'une autre agence, même écrit autrement : 422 avec le code du doublon. */
    public function test_un_ninea_deja_porte_par_une_autre_agence_est_refuse(): void
    {
        Agency::factory()->create(['ninea' => '00123452G3']);
        $this->pro();

        $this->ouvrir(['ninea' => '0012345 2g3'])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'agency.ninea_taken');

        $this->assertSame(0, Agency::query()->where('name', 'Keur Immo')->count());
        $this->assertSame(0, KycDossier::query()->count());
    }

    /** AC3 — le NINEA d'une demande de passage en pro en attente compte aussi. */
    public function test_un_ninea_d_une_demande_de_passage_en_attente_est_refuse(): void
    {
        AgencyUpgradeRequest::factory()->create([
            'ninea' => 'SN-NINEA-2937',
            'status' => AgencyUpgradeRequestStatus::Pending->value,
        ]);
        $this->pro();

        $this->ouvrir(['ninea' => 'sn-ninea-2937'])->assertUnprocessable()->assertJsonPath('code', 'agency.ninea_taken');
    }

    public function test_un_ninea_libre_est_pose_sur_l_agence(): void
    {
        Agency::factory()->create(['ninea' => '00123452G3']);
        $this->pro();

        $this->ouvrir(['ninea' => '00999999Z9'])->assertCreated();

        $this->assertSame('00999999Z9', $this->ouverte()->ninea);
    }

    /** AC3 — déjà admin principal d'une agence (un espace individuel compris) : 409. */
    public function test_l_admin_principal_d_un_espace_individuel_recoit_409(): void
    {
        $user = $this->pro();
        Agency::factory()->individual()->create(['primary_admin_id' => $user->id]);

        $this->ouvrir()->assertStatus(409)->assertJsonPath('code', 'agency.already_admin');

        $this->assertSame(0, Agency::query()->where('name', 'Keur Immo')->count());
    }

    public function test_l_admin_actif_d_une_autre_agence_recoit_409(): void
    {
        $user = $this->pro();
        AgencyAdminProfile::query()->create([
            'user_id' => $user->id,
            'agency_id' => Agency::factory()->create()->id,
            'status' => AgencyAdminProfileStatus::Active->value,
        ]);

        $this->ouvrir()->assertStatus(409)->assertJsonPath('code', 'agency.already_admin');
    }

    public function test_un_second_envoi_ne_cree_pas_une_seconde_agence(): void
    {
        $this->pro();

        $this->ouvrir()->assertCreated();
        $this->ouvrir()->assertStatus(409);

        $this->assertSame(1, Agency::query()->count());
    }

    /** AC2 — l'agence non vérifiée invite son équipe. */
    public function test_l_agence_non_verifiee_invite_un_agent(): void
    {
        Mail::fake();
        $user = $this->pro(['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET]);
        $reponse = $this->ouvrir()->assertCreated();
        $agence = $this->ouverte();

        $this->actingAsWithStepUp($user->fresh());
        $this->withUnencryptedCookie('active_profile_id', $reponse->json('data.active_profile_id'))
            ->postJson("/api/agencies/{$agence->id}/agents/invite", [
                'email' => 'awa.agent@example.com', 'role' => 'agent', 'first_name' => 'Awa', 'last_name' => 'Ndiaye',
            ])->assertCreated();
    }

    /** AC2 — ses reversements restent bloqués tant qu'elle n'est pas vérifiée. */
    public function test_les_reversements_de_l_agence_non_verifiee_sont_bloques(): void
    {
        $this->pro();
        $this->ouvrir()->assertCreated();
        $payout = PlatformPayout::factory()->create(['agency_id' => $this->ouverte()->id]);

        $this->actingAsRole('super_admin');
        $this->postJson("/api/admin/payouts/{$payout->id}/approve")
            ->assertStatus(422)
            ->assertJsonPath('code', 'platform_payout.agency_unverified');
    }

    /** ADR-0125 § 5 — aucun bien en ligne avant la vérification, par quelque sauvegarde que ce soit. */
    public function test_aucun_bien_ne_se_met_en_ligne_avant_la_verification(): void
    {
        $this->pro();
        $this->ouvrir()->assertCreated();
        $agence = $this->ouverte();

        // Un bien privé, ou un brouillon, se gère sans restriction.
        $bien = Property::factory()->draft()->create(['agency_id' => $agence->id, 'visibility' => PropertyVisibility::Private]);
        $bien->update(['status' => PropertyStatus::Available]);

        $this->assertMiseEnLigneRefusee(fn () => $bien->update(['visibility' => PropertyVisibility::Public, 'published_at' => now()]));
        $this->assertMiseEnLigneRefusee(fn () => Property::factory()->published()->create(['agency_id' => $agence->id]));
        $this->assertSame(0, Property::query()->public()->where('agency_id', $agence->id)->count());

        // Vérifiée, elle publie.
        $agence->update(['is_verified' => true, 'verified_at' => now()]);
        $bien->refresh()->update(['visibility' => PropertyVisibility::Public, 'published_at' => now()]);
        $this->assertTrue($bien->fresh()->isOnline());
    }

    /** ADR-0125 § 5 — l'approbation de la modération d'agence ne contourne pas la garde. */
    public function test_l_exemption_de_moderation_ne_met_pas_en_ligne(): void
    {
        $this->pro();
        $this->ouvrir()->assertCreated();
        $bien = Property::factory()->draft()->create(['agency_id' => $this->ouverte()->id, 'visibility' => PropertyVisibility::Public, 'published_at' => now()]);

        $this->assertMiseEnLigneRefusee(fn () => Property::withoutModerationGate(fn () => $bien->update(['status' => PropertyStatus::Available])));
    }

    /** ADR-0125 § 6 — une agence non vérifiée de la console (sans `self_opened_at`) publie comme avant. */
    public function test_une_agence_de_la_console_non_verifiee_publie_comme_avant(): void
    {
        $agence = Agency::factory()->create(['is_verified' => false]);

        $bien = Property::factory()->published()->create(['agency_id' => $agence->id]);

        $this->assertTrue($bien->isOnline());
    }

    /** ADR-0125 § 5 — ni fiche ni portefeuille publics avant la vérification. */
    public function test_pas_de_fiche_publique_avant_la_verification(): void
    {
        $this->pro();
        $this->ouvrir()->assertCreated();
        $agence = $this->ouverte();

        $this->getJson("/api/public/agencies/{$agence->slug}")->assertNotFound();
        $this->getJson("/api/public/agencies/{$agence->slug}/properties")->assertNotFound();

        $agence->update(['is_verified' => true, 'verified_at' => now()]);
        $this->getJson("/api/public/agencies/{$agence->slug}")->assertOk();
    }

    /** ADR-0125 § 2 — sans numéro vérifié, pas d'agence : elle invitera sous un nom que personne n'a revu. */
    public function test_un_compte_sans_numero_verifie_n_ouvre_pas_d_agence(): void
    {
        $this->pro(['phone_verified_at' => null]);

        $this->ouvrir()->assertUnprocessable()->assertJsonPath('code', 'agency.phone_unverified');
        $this->assertSame(0, Agency::query()->count());
    }

    /** ADR-0125 § 3 — une agence jamais vérifiée ne bloque pas le vrai titulaire d'un NINEA. */
    public function test_le_ninea_d_une_agence_ouverte_jamais_verifiee_ne_bloque_pas(): void
    {
        $squatteuse = Agency::factory()->create(['ninea' => '00123452G3', 'is_verified' => false, 'verified_at' => null]);
        $squatteuse->forceFill(['self_opened_at' => now()])->save();
        $this->pro();

        $this->ouvrir(['ninea' => '00123452G3'])->assertCreated();
    }

    /** ADR-0125 § 5 — le geste réel : `POST /properties/{id}/publish` rend le code au front. */
    public function test_la_route_de_publication_rend_le_code(): void
    {
        $user = $this->pro(['first_name' => 'Awa', 'two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET]);
        $reponse = $this->ouvrir()->assertCreated();
        $bien = Property::factory()->draft()->create(['agency_id' => $this->ouverte()->id, 'user_id' => $user->id]);

        $this->actingAsWithStepUp($user->fresh());
        $this->withUnencryptedCookie('active_profile_id', $reponse->json('data.active_profile_id'))
            ->postJson("/api/properties/{$bien->id}/publish", ['accept_terms' => true])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'agency.unverified_publication');
        $this->assertFalse($bien->fresh()->isOnline());
    }

    /** ADR-0125 § 5 — un bien en ligne déplacé vers l'agence se juge comme une mise en ligne. */
    public function test_un_bien_en_ligne_deplace_vers_l_agence_est_refuse(): void
    {
        $this->pro();
        $this->ouvrir()->assertCreated();
        $bien = Property::factory()->published()->create(['agency_id' => Agency::factory()->create()->id]);
        $this->assertTrue($bien->isOnline());

        $this->assertMiseEnLigneRefusee(fn () => $bien->update(['agency_id' => $this->ouverte()->id]));
    }

    /** ADR-0125 § 6 — vérifiée une fois puis échue : la règle commune, pas la restriction de l'ouverture. */
    public function test_une_agence_verifiee_puis_echue_garde_sa_fiche_et_publie(): void
    {
        $this->pro();
        $this->ouvrir()->assertCreated();
        $agence = $this->ouverte();
        $agence->update(['is_verified' => false, 'verified_at' => now()->subYear()]);

        $this->assertFalse($agence->fresh()->awaitsFirstVerification());
        $bien = Property::factory()->published()->create(['agency_id' => $agence->id]);
        $this->assertTrue($bien->isOnline());
        $this->getJson("/api/public/agencies/{$agence->slug}")->assertOk();
    }

    /** ADR-0125 § 4 — aucun abonnement posé à l'ouverture ; l'offre et le quota se lisent sans erreur. */
    public function test_l_abonnement_et_le_quota_se_lisent_sur_l_agence_neuve(): void
    {
        $user = $this->pro();
        $reponse = $this->ouvrir()->assertCreated();
        Sanctum::actingAs($user->fresh());

        $this->withUnencryptedCookie('active_profile_id', $reponse->json('data.active_profile_id'))
            ->getJson('/api/me/subscription')->assertOk();
        $this->withUnencryptedCookie('active_profile_id', $reponse->json('data.active_profile_id'))
            ->getJson('/api/me/quota')->assertOk();
        $this->assertSame(0, AgencySubscription::query()->where('agency_id', $this->ouverte()->id)->count());
    }

    /** @param  callable(): mixed  $geste */
    private function assertMiseEnLigneRefusee(callable $geste): void
    {
        try {
            $geste();
            $this->fail('la mise en ligne devait être refusée');
        } catch (ApiError $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertSame('agency.unverified_publication', $e->errorCode);
        }
    }
}
