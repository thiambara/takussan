<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Invitation;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-2939 (ADR-0094, amendement du 2026-11-15 § 6) — `GET /api/me/profiles/{profile}/invite-summary` : le résumé chiffré
 * de l'étape du numéro des assistants (« N biens suivis par l'agence », « Votre dernier loyer », « N pièces à envoyer »),
 * au TITULAIRE du profil, dès l'acceptation de l'invitation et avant la vérification du numéro. Avant l'acceptation, le
 * profil n'a pas de titulaire : rien (404).
 */
class InviteNumberStepSummaryTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-15 10:00:00');
        $this->agency = Agency::factory()->create();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** AC5 — trois biens suivis, leurs titres, le dernier loyer encaissé (350 000 le 5 nov.), deux pièces à envoyer. */
    public function test_le_bailleur_lit_ses_biens_son_dernier_loyer_et_ses_pieces(): void
    {
        $bailleur = User::factory()->create(['phone_verified_at' => null]);
        $profil = OwnerProfile::factory()->create([
            'user_id' => $bailleur->id, 'agency_id' => $this->agency->id, 'status' => OwnerProfileStatus::Active->value,
            // Le NINEA saisi : la pièce compte « envoyée ». Restent la CNI et le RIB.
            'tax_id' => '0012345 2G3',
        ]);
        $biens = collect(['Villa Almadies', 'F3 Mermoz', 'Studio Ouakam'])
            ->map(fn (string $titre) => Property::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $this->agency->id, 'title' => $titre]));
        $bail = Lease::factory()->create(['agency_id' => $this->agency->id, 'property_id' => $biens[1]->id]);
        LeasePayment::factory()->paid()->create(['lease_id' => $bail->id, 'amount' => 340_000, 'paid_at' => '2026-10-05 09:00:00']);
        LeasePayment::factory()->paid()->create(['lease_id' => $bail->id, 'amount' => 350_000, 'paid_at' => '2026-11-05 09:00:00']);
        // Ni une caution, ni un loyer en attente, ni le loyer d'un bien d'une autre agence ne sont « le dernier loyer ».
        LeasePayment::factory()->paid()->create(['lease_id' => $bail->id, 'amount' => 700_000, 'paid_at' => '2026-11-10 09:00:00', 'payment_type' => LeasePaymentType::Deposit]);
        LeasePayment::factory()->create(['lease_id' => $bail->id, 'amount' => 360_000]);
        $ailleurs = Property::factory()->create(['user_id' => $bailleur->id, 'agency_id' => Agency::factory()->create()->id]);
        LeasePayment::factory()->paid()->create([
            'lease_id' => Lease::factory()->create(['property_id' => $ailleurs->id])->id,
            'amount' => 999_000, 'paid_at' => '2026-11-12 09:00:00',
        ]);

        $data = $this->resume($bailleur, 'owner:'.$profil->id)->assertOk()->json('data');

        $this->assertSame('owner', $data['role']);
        $this->assertSame(3, $data['properties_count']);
        $this->assertSame(['Villa Almadies', 'F3 Mermoz', 'Studio Ouakam'], $data['titles']);
        $this->assertEquals(350000, $data['last_rent']['amount']);
        $this->assertSame(Carbon::parse('2026-11-05 09:00:00')->toIso8601String(), $data['last_rent']['paid_at']);
        $this->assertSame(2, $data['missing_documents']);
        $this->assertSame(['last_rent', 'missing_documents', 'properties_count', 'role', 'titles'], collect(array_keys($data))->sort()->values()->all());
    }

    /** Sans loyer encaissé : `last_rent` nul ; les biens encore saisis pour le profil comptent aussi. */
    public function test_sans_loyer_le_dernier_loyer_est_nul(): void
    {
        $bailleur = User::factory()->create();
        $profil = OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $this->agency->id, 'status' => OwnerProfileStatus::Active->value]);
        Property::factory()->draft()->create(['agency_id' => $this->agency->id, 'pending_owner_profile_id' => $profil->id]);

        $this->resume($bailleur, 'owner:'.$profil->id)->assertOk()
            ->assertJsonPath('data.properties_count', 1)
            ->assertJsonPath('data.last_rent', null);
    }

    /** L'agent lit le parc de son agence et ses pièces ; ni titres ni loyer. */
    public function test_l_agent_lit_le_parc_de_l_agence_et_ses_pieces(): void
    {
        $agent = User::factory()->create();
        $profil = AgentProfile::query()->create(['user_id' => $agent->id, 'agency_id' => $this->agency->id, 'status' => AgentProfileStatus::Active]);
        Property::factory()->count(2)->create(['agency_id' => $this->agency->id]);

        $this->resume($agent, 'agent:'.$profil->id)->assertOk()
            ->assertJsonPath('data.role', 'agent')
            ->assertJsonPath('data.properties_count', 2)
            ->assertJsonPath('data.titles', [])
            ->assertJsonPath('data.last_rent', null)
            ->assertJsonPath('data.missing_documents', 3);
    }

    /** Le prestataire : ses pièces obligatoires seules (l'assurance est facultative). */
    public function test_le_prestataire_lit_ses_pieces(): void
    {
        $prestataire = User::factory()->create();
        $profil = ServiceProviderProfile::factory()->create(['user_id' => $prestataire->id, 'status' => ServiceProviderProfileStatus::Active->value]);

        $this->resume($prestataire, 'service_provider:'.$profil->id)->assertOk()
            ->assertJsonPath('data.role', 'service_provider')
            ->assertJsonPath('data.properties_count', null)
            ->assertJsonPath('data.missing_documents', 1);
    }

    /** Avant l'acceptation (profil sans titulaire), le profil d'un autre, un profil non actif : rien. */
    public function test_rien_avant_l_acceptation_ni_pour_un_autre(): void
    {
        $appelant = User::factory()->create();
        $invite = OwnerProfile::factory()->create(['user_id' => null, 'agency_id' => $this->agency->id, 'status' => OwnerProfileStatus::Draft->value]);
        Property::factory()->draft()->create(['agency_id' => $this->agency->id, 'pending_owner_profile_id' => $invite->id, 'title' => 'Secret']);
        $autre = OwnerProfile::factory()->create(['user_id' => User::factory()->create()->id, 'agency_id' => $this->agency->id, 'status' => OwnerProfileStatus::Active->value]);
        $brouillon = OwnerProfile::factory()->create(['user_id' => $appelant->id, 'agency_id' => $this->agency->id, 'status' => OwnerProfileStatus::Draft->value]);

        foreach (['owner:'.$invite->id, 'owner:'.$autre->id, 'owner:'.$brouillon->id, 'agency_admin:1'] as $id) {
            $reponse = $this->resume($appelant, $id)->assertNotFound();
            $this->assertStringNotContainsString('Secret', (string) $reponse->getContent());
        }
        $this->getJson('/api/me/profiles/owner:abc/invite-summary')->assertNotFound();
    }

    /** Par la voie réelle : l'invitation acceptée (le profil brouillon passe actif), la session émise lit le résumé. */
    public function test_apres_une_vraie_acceptation_le_titulaire_lit_son_resume(): void
    {
        config(['auth.phone_login.enabled' => true]);
        Cache::flush();
        $sms = FakeSmsRouter::install();
        $profil = OwnerProfile::factory()->create(['user_id' => null, 'agency_id' => $this->agency->id, 'status' => OwnerProfileStatus::Draft->value]);
        Property::factory()->draft()->count(2)->create(['agency_id' => $this->agency->id, 'pending_owner_profile_id' => $profil->id]);
        $invitation = Invitation::factory()->create([
            'email' => null, 'phone' => '+221771234567', 'agency_id' => $this->agency->id,
            'invitable_type' => OwnerProfile::class, 'invitable_id' => $profil->id, 'role' => 'owner',
        ]);

        // Avant l'acceptation : le profil n'a pas de titulaire, rien.
        $this->resume(User::factory()->create(), 'owner:'.$profil->id)->assertNotFound();

        $this->postJson("/api/public/invitations/{$invitation->token}/code", [])->assertStatus(202);
        $jeton = $this->postJson("/api/public/invitations/{$invitation->token}/verify", ['code' => $sms->lastCodeFor('+221771234567')])
            ->assertOk()->json('token');

        $this->app['auth']->forgetGuards();
        $this->withToken($jeton)->getJson('/api/me/profiles/owner:'.$profil->id.'/invite-summary')
            ->assertOk()
            ->assertJsonPath('data.role', 'owner')
            ->assertJsonPath('data.properties_count', 2);
    }

    public function test_sans_session_401(): void
    {
        $this->getJson('/api/me/profiles/owner:1/invite-summary')->assertUnauthorized();
    }

    private function resume(User $user, string $profile): TestResponse
    {
        Sanctum::actingAs($user);

        return $this->getJson("/api/me/profiles/{$profile}/invite-summary");
    }
}
