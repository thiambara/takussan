<?php

namespace Tests\Feature\ServiceProvider;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\InvitationStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Invitation;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Support\FakeSmsRouter;
use Tests\Support\MaintenanceActors;

/**
 * TCK-2829 — le carnet par défaut rend les collaborations `active` ET les invitations en attente :
 * un profil `draft`, une collaboration `paused` avec l'agence de l'écran, une invitation `sent` de
 * CETTE agence. Une collaboration `paused` d'un profil actif (suspendue) reste hors du défaut, et un
 * `filter[collaboration_status]` explicite garde son sens.
 *
 * Chaque lecture se juge contre une invitation d'une AUTRE agence qui répond au même terme.
 */
class CarnetInvitationEnAttenteTest extends ApiTestCase
{
    use MaintenanceActors, RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        config(['auth.phone_login.enabled' => true]);
        Mail::fake();
        FakeSmsRouter::install();
        $this->agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);
    }

    public function test_une_invitation_envoyee_par_l_api_parait_au_carnet_par_defaut_et_se_trouve(): void
    {
        $actif = $this->profilDe($this->providerFor($this->agency));
        $this->apiPost("/api/agencies/{$this->agency->id}/service-providers/invite", [
            'phone' => '+221770002829',
            'first_name' => 'Ousmane',
            'last_name' => 'Thioune',
            'intervention_zones' => ['Ouakam'],
        ])->assertCreated();
        $invite = (int) Invitation::query()->sole()->invitable_id;

        $this->assertEqualsCanonicalizing([$actif, $invite], $this->ids(''));
        $this->assertSame([$invite], $this->ids('filter[search]=thioune'));
        $this->assertSame([$invite], $this->ids('filter[search]=7700028'));
        $this->assertSame([$invite], $this->ids('filter[zone]=Ouakam'));
        $this->assertContains('Ouakam', $this->get_('')->json('meta.zones'));

        $ligne = collect($this->get_('')->json('data'))->firstWhere('id', $invite);
        $this->assertSame('draft', $ligne['status']);
        $this->assertSame(Invitation::query()->sole()->id, $ligne['pending_invitation_id']);
    }

    public function test_une_collaboration_suspendue_reste_hors_du_carnet_par_defaut(): void
    {
        $actif = $this->profilDe($this->providerFor($this->agency));
        $suspendu = $this->profilDe($this->providerFor($this->agency, CollaborationStatus::Paused, userAttributes: ['last_name' => 'Suspendu']));
        // Même avec une invitation `sent` de cette agence : c'est le profil actif qui la tient pour suspendue.
        $this->invitationDe($suspendu, $this->agency);

        $this->assertSame([$actif], $this->ids(''));
        $this->assertSame([], $this->ids('filter[search]=suspendu'));
        // Le filtre explicite garde son sens.
        $this->assertSame([$actif], $this->ids('filter[collaboration_status]=active'));
        $this->assertEqualsCanonicalizing([$actif, $suspendu], $this->ids('filter[collaboration_status]=active,paused'));
    }

    public function test_le_filtre_explicite_active_n_ajoute_pas_les_invitations(): void
    {
        $actif = $this->profilDe($this->providerFor($this->agency));
        $invite = $this->brouillon($this->agency, 'Awa', 'Diallo', ['Ngor']);
        $this->invitationDe($invite, $this->agency);

        $this->assertSame([$actif], $this->ids('filter[collaboration_status]=active'));
        $this->assertSame([$invite], $this->ids('filter[collaboration_status]=paused'));
        $this->assertEqualsCanonicalizing([$actif, $invite], $this->ids(''));
    }

    public function test_une_invitation_revoquee_quitte_le_carnet_par_defaut(): void
    {
        $revoquee = $this->brouillon($this->agency, 'Awa', 'Diallo', ['Ngor']);
        $this->invitationDe($revoquee, $this->agency, InvitationStatus::Revoked);

        $this->assertSame([], $this->ids(''));
        $this->assertSame([$revoquee], $this->ids('filter[collaboration_status]=paused'));
    }

    public function test_l_invitation_d_une_autre_agence_ne_sort_jamais(): void
    {
        $autre = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $mienne = $this->brouillon($this->agency, 'Froid', 'Service', ['Mermoz']);
        $this->invitationDe($mienne, $this->agency);

        // L'invitation d'une autre agence, au même nom, dans sa propre zone.
        $ailleurs = $this->brouillon($autre, 'Froid', 'Ailleurs', ['Rufisque']);
        $this->invitationDe($ailleurs, $autre);

        // Un brouillon en pause ICI dont la seule invitation `sent` vient d'une autre agence.
        $croise = $this->brouillon($this->agency, 'Froid', 'Croise', ['Yoff']);
        $this->invitationDe($croise, $autre);

        // Une invitation `sent` de CETTE agence sur un brouillon dont la collaboration est AILLEURS.
        $sansCollaboration = $this->brouillon($autre, 'Froid', 'Orphelin', ['Hann']);
        $this->invitationDe($sansCollaboration, $this->agency);

        $this->assertSame([$mienne], $this->ids(''));
        $this->assertSame([$mienne], $this->ids('filter[search]=froid'));
        $this->assertSame([], $this->ids('filter[search]=ailleurs'));
        $this->assertSame([], $this->ids('filter[zone]=Rufisque'));
        $this->assertSame(['Mermoz'], $this->get_('')->json('meta.zones'));
        // Les filtres de spatie s'appliquent aussi aux invitations : le OU ne les contourne pas.
        $this->assertSame([], $this->ids('filter[status]=active'));
        $this->assertSame([], $this->ids('filter[search]=croise'));
        $this->assertSame([], $this->ids('filter[search]=orphelin'));
    }

    // ------------------------------------------------------------------

    private function get_(string $query): TestResponse
    {
        return $this->apiGet("/api/agencies/{$this->agency->id}/service-providers?per_page=100".($query !== '' ? '&'.$query : ''))->assertOk();
    }

    /** @return list<int> */
    private function ids(string $query): array
    {
        return collect($this->get_($query)->json('data'))->pluck('id')->sort()->values()->all();
    }

    private function profilDe(User $user): int
    {
        return (int) ServiceProviderProfile::query()->where('user_id', $user->id)->value('id');
    }

    /**
     * Un brouillon comme `ServiceProviderInvitationService` le crée : profil `draft` sans compte,
     * nom dans `metadata`, collaboration `paused` avec l'agence.
     *
     * @param  list<string>  $zones
     */
    private function brouillon(Agency $agency, string $prenom, string $nom, array $zones): int
    {
        $profil = ServiceProviderProfile::query()->create([
            'user_id' => null,
            'status' => ServiceProviderProfileStatus::Draft->value,
            'service_areas' => $zones,
            'metadata' => ['first_name' => $prenom, 'last_name' => $nom, 'email' => strtolower($nom).'@example.test'],
        ]);
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $profil->id,
            'agency_id' => $agency->id,
            'status' => CollaborationStatus::Paused->value,
            'started_at' => now()->toDateString(),
        ]);

        return $profil->id;
    }

    private function invitationDe(int $profil, Agency $agency, InvitationStatus $statut = InvitationStatus::Sent): void
    {
        Invitation::factory()->create([
            'invitable_type' => (new ServiceProviderProfile)->getMorphClass(),
            'invitable_id' => $profil,
            'agency_id' => $agency->id,
            'role' => 'service_provider',
            'status' => $statut->value,
        ]);
    }
}
