<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\InvitationStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Invitation;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * P234.02 et P234.03 (TCK-2280) — une invitation adressée à un NUMÉRO désigne le compte qui l'a
 * vérifié (`InvitationService::recipientAccount`), comme une invitation par e-mail désigne le
 * compte de cette adresse.
 *
 * - P234.03 : un bailleur ou un agent déjà membre, invité de nouveau par son numéro, recevait le
 *   SMS (201) puis tombait en 500 à l'acceptation, sur `unique(user_id, agency_id)`. Le refus
 *   « déjà membre » n'était joué que pour un e-mail.
 * - P234.02 : un prestataire invité par son numéro par une seconde agence recevait un second
 *   profil, que `me/profiles` et `me/service-provider/collaborations` ne voyaient pas.
 *   Décision du porteur : réutiliser le profil du compte, et refuser par un 409 nommé
 *   l'acceptation d'un second profil.
 */
class CompteExistantInviteParNumeroTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221770002341';

    private Agency $agency;

    private User $compte;

    protected function setUp(): void
    {
        parent::setUp();
        config(['auth.phone_login.enabled' => true]);
        Mail::fake();
        FakeSmsRouter::install();
        $this->agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->compte = User::factory()->create([
            'email' => null,
            'phone' => self::NUMERO,
            'phone_verified_at' => now(),
        ]);
    }

    /** @return array<string, array{class-string, string}> */
    public static function membres(): array
    {
        return [
            'bailleur' => [OwnerProfile::class, 'owners'],
            'agent' => [AgentProfile::class, 'agents'],
        ];
    }

    /** @param class-string<OwnerProfile|AgentProfile> $profil */
    #[DataProvider('membres')]
    public function test_un_membre_invite_par_son_numero_rend_409_a_l_invitation(string $profil, string $surface): void
    {
        $profil::factory()->create(['user_id' => $this->compte->id, 'agency_id' => $this->agency->id, 'status' => 'active']);

        $this->inviter($this->agency, $surface)->assertStatus(409);

        $this->assertSame(0, Invitation::query()->count());
    }

    /** @param class-string<OwnerProfile|AgentProfile> $profil */
    #[DataProvider('membres')]
    public function test_un_brouillon_accepte_par_un_compte_devenu_membre_rend_409_et_non_500(string $profil, string $surface): void
    {
        $this->inviter($this->agency, $surface)->assertCreated();
        $invitation = Invitation::query()->sole();
        // Entre l'envoi et l'acceptation, le compte entre dans l'agence par un autre chemin.
        $profil::factory()->create(['user_id' => $this->compte->id, 'agency_id' => $this->agency->id, 'status' => 'active']);

        $this->accepterEnTantQueCompte($invitation)
            ->assertStatus(409)
            ->assertJsonPath('code', 'invitation.already_member');

        $this->assertSame(InvitationStatus::Sent, $invitation->fresh()->status);
        $this->assertNull($profil::query()->findOrFail($invitation->invitable_id)->user_id);
    }

    public function test_un_prestataire_invite_par_son_numero_par_une_seconde_agence_garde_un_seul_profil(): void
    {
        $agencyA = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $profil = $this->profilDePrestataire(['plumbing']);
        $this->collaborer($profil, $agencyA);

        $this->inviter($this->agency, 'service-providers', ['trades' => ['electricity']])
            ->assertCreated()
            ->assertJsonPath('meta.existing_sp_other_agency', true)
            ->assertJsonPath('meta.service_provider_profile_id', $profil->id);
        $invitation = Invitation::query()->sole();
        $this->assertSame($profil->id, $invitation->invitable_id);

        $this->accepterEnTantQueCompte($invitation)->assertOk();

        $this->assertSame(1, ServiceProviderProfile::query()->where('user_id', $this->compte->id)->count());
        $this->assertDatabaseHas('service_provider_agency_collaborations', [
            'service_provider_profile_id' => $profil->id,
            'agency_id' => $this->agency->id,
            'status' => CollaborationStatus::Active->value,
        ]);
        $agences = collect($this->getJson('/api/me/service-provider/collaborations')->assertOk()->json('data'))
            ->pluck('agency_id')->all();
        $this->assertEqualsCanonicalizing([$agencyA->id, $this->agency->id], $agences);
    }

    public function test_un_prestataire_deja_actif_chez_l_agence_invite_par_son_numero_rend_409(): void
    {
        $this->collaborer($this->profilDePrestataire(['plumbing']), $this->agency);

        $this->inviter($this->agency, 'service-providers')->assertStatus(409);

        $this->assertSame(0, Invitation::query()->count());
    }

    public function test_un_brouillon_de_prestataire_accepte_par_un_compte_qui_a_deja_un_profil_rend_409(): void
    {
        // Le numéro n'est vérifié par aucun compte à l'envoi : l'invitation crée un brouillon.
        $this->compte->forceFill(['phone_verified_at' => null])->save();
        $this->inviter($this->agency, 'service-providers', ['trades' => ['electricity']])->assertCreated();
        $invitation = Invitation::query()->sole();
        $brouillon = ServiceProviderProfile::query()->findOrFail($invitation->invitable_id);
        $this->assertNull($brouillon->user_id);

        $this->compte->forceFill(['phone_verified_at' => now()])->save();
        $this->profilDePrestataire(['plumbing']);

        $this->accepterEnTantQueCompte($invitation)
            ->assertStatus(409)
            ->assertJsonPath('code', 'invitation.service_provider_profile_exists');

        $this->assertSame(1, ServiceProviderProfile::query()->where('user_id', $this->compte->id)->count());
        $this->assertNull($brouillon->fresh()->user_id);
        $this->assertSame(InvitationStatus::Sent, $invitation->fresh()->status);
    }

    /** @param array<string, mixed> $champs */
    private function inviter(Agency $agency, string $surface, array $champs = []): TestResponse
    {
        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);
        $corps = ['phone' => self::NUMERO, 'first_name' => 'Awa', 'last_name' => 'Ndiaye', ...$champs];
        if ($surface === 'agents') {
            $corps['role'] = 'agent';
        }
        if ($surface === 'owners') {
            $corps['owner_type'] = 'individual';
        }
        $reponse = $this->postJson("/api/agencies/{$agency->id}/{$surface}/invite", $corps);
        $this->app['auth']->forgetGuards();

        return $reponse;
    }

    private function accepterEnTantQueCompte(Invitation $invitation): TestResponse
    {
        Sanctum::actingAs($this->compte->fresh());

        return $this->postJson("/api/invitations/{$invitation->token}/accept");
    }

    /** @param list<string> $metiers */
    private function profilDePrestataire(array $metiers): ServiceProviderProfile
    {
        return ServiceProviderProfile::factory()->create([
            'user_id' => $this->compte->id,
            'status' => ServiceProviderProfileStatus::Active->value,
            'specialties' => $metiers,
        ]);
    }

    private function collaborer(ServiceProviderProfile $profil, Agency $agency): void
    {
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $profil->id,
            'agency_id' => $agency->id,
            'status' => CollaborationStatus::Active->value,
            'started_at' => now()->subMonth()->toDateString(),
        ]);
    }
}
