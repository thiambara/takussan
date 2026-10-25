<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\Profiles\ServiceProviderProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\ApiTestCase;
use Tests\Support\FakeSmsRouter;

/**
 * P237.01 (TCK-2371) — le carnet des bailleurs et celui des prestataires portent, sur chaque ligne,
 * l'identifiant de l'invitation `sent` du profil (`pending_invitation_id`) : le front relance ou
 * révoque par lui, sans chercher l'invitation par e-mail. La recherche avalait ses pannes en
 * « Aucune invitation en attente », et ne trouvait jamais une invitation partie au seul numéro.
 */
class InvitationEnAttenteDuBrouillonTest extends ApiTestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221770000237';

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

    public function test_le_bailleur_invite_au_seul_numero_porte_son_invitation(): void
    {
        $this->apiPost("/api/agencies/{$this->agency->id}/owners/invite", [
            'phone' => self::NUMERO,
            'first_name' => 'Awa',
            'last_name' => 'Sarr',
            'owner_type' => 'individual',
        ])->assertCreated();
        $invitation = Invitation::query()->sole();

        $ligne = $this->ligneBailleur($invitation->invitable_id, 'fields[owner_profiles]=id,status');

        $this->assertSame($invitation->id, $ligne['pending_invitation_id'] ?? null);
    }

    public function test_le_bailleur_invite_par_email_porte_son_invitation_meme_sans_fields(): void
    {
        $this->apiPost("/api/agencies/{$this->agency->id}/owners/invite", [
            'email' => 'bailleur@example.sn',
            'first_name' => 'Awa',
            'last_name' => 'Sarr',
            'owner_type' => 'individual',
        ])->assertCreated();
        $invitation = Invitation::query()->sole();

        $ligne = $this->ligneBailleur($invitation->invitable_id, '');

        $this->assertSame($invitation->id, $ligne['pending_invitation_id'] ?? null);
    }

    public function test_une_invitation_revoquee_n_est_plus_en_attente(): void
    {
        $this->apiPost("/api/agencies/{$this->agency->id}/owners/invite", [
            'email' => 'bailleur@example.sn',
            'first_name' => 'Awa',
            'last_name' => 'Sarr',
            'owner_type' => 'individual',
        ])->assertCreated();
        $invitation = Invitation::query()->sole();
        $invitation->forceFill(['status' => InvitationStatus::Revoked->value, 'revoked_at' => now()])->save();

        $ligne = $this->ligneBailleur($invitation->invitable_id, 'fields[owner_profiles]=id,status');

        $this->assertArrayHasKey('pending_invitation_id', $ligne);
        $this->assertNull($ligne['pending_invitation_id']);
    }

    public function test_le_prestataire_invite_au_seul_numero_porte_l_invitation_de_cette_agence(): void
    {
        $this->apiPost("/api/agencies/{$this->agency->id}/service-providers/invite", [
            'phone' => self::NUMERO,
            'first_name' => 'Awa',
            'last_name' => 'Ndiaye',
        ])->assertCreated();
        $invitation = Invitation::query()->sole();

        // Une invitation plus récente du même profil, par une autre agence : elle n'est pas la sienne.
        Invitation::factory()->create([
            'invitable_type' => (new ServiceProviderProfile)->getMorphClass(),
            'invitable_id' => $invitation->invitable_id,
            'role' => 'service_provider',
            'created_at' => now()->addMinute(),
        ]);

        $ligne = collect($this->apiGet(
            "/api/agencies/{$this->agency->id}/service-providers?filter[collaboration_status]=active,paused&fields[service_provider_profiles]=id,status",
        )->assertOk()->json('data'))->firstWhere('id', $invitation->invitable_id);

        $this->assertNotNull($ligne);
        $this->assertSame($invitation->id, $ligne['pending_invitation_id'] ?? null);
    }

    /** @return array<string, mixed> */
    private function ligneBailleur(int $profileId, string $fields): array
    {
        $qs = "filter[agency_id]={$this->agency->id}".($fields !== '' ? "&{$fields}" : '');
        $ligne = collect($this->apiGet("/api/owners?{$qs}")->assertOk()->json('data'))->firstWhere('id', $profileId);
        $this->assertNotNull($ligne);

        return $ligne;
    }
}
