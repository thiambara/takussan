<?php

namespace Tests\Feature\Owners;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Support\FakeSmsRouter;

/**
 * TCK-2641 (décisions 4a et 5a) — le carnet des bailleurs rend :
 *
 * - `meta.summary` : le compte des bailleurs et des invitations, des biens, du reste à verser et des
 *   bailleurs qui en ont un, sur le périmètre de l'agence, ni la recherche, ni une vue, ni la page
 *   ne le changent ; les chiffres d'argent suivent la règle du relevé ;
 * - `pending_invitation_sent_at` : le dernier envoi de l'invitation en cours, qu'un renvoi déplace
 *   et qu'un rappel ne déplace pas.
 */
class OwnerListSummaryTest extends ApiTestCase
{
    use BuildsMoneyOut;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Mail::fake();
        FakeSmsRouter::install();
        $this->travelTo('2026-09-20 10:00:00');
    }

    /** @return array{0: array<int, array<string, mixed>>, 1: array<string, mixed>|null} */
    private function lire(Agency $agency, string $query = ''): array
    {
        $response = $this->apiGet("/api/owners?per_page=100&filter[agency_id]={$agency->id}{$query}")->assertOk();

        return [collect($response->json('data'))->keyBy('id')->all(), $response->json('meta.summary')];
    }

    /** Un carnet : deux bailleurs avec un reste, un sans reste, un brouillon ; une autre agence peuplée. */
    private function carnet(): Agency
    {
        $agency = $this->moneyAgency();
        $a = $this->landlordOf($agency);
        $b = $this->landlordOf($agency);
        $this->landlordOf($agency); // aucun loyer : rien à verser
        $this->leasePayment($this->leaseOf($agency, $a, 10), 200_000);
        $this->leasePayment($this->leaseOf($agency, $b, 5), 300_000);
        Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $a->id]); // vacant
        Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $a->id, 'archived_at' => now()]); // archivé
        OwnerProfile::factory()->draft()->create(['agency_id' => $agency->id, 'metadata' => ['first_name' => 'Awa', 'last_name' => 'Sarr']]);

        $other = $this->moneyAgency();
        $this->leasePayment($this->leaseOf($other, $this->landlordOf($other), 10), 900_000);
        OwnerProfile::factory()->draft()->create(['agency_id' => $other->id]);

        return $agency;
    }

    public function test_le_resume_recoupe_les_lignes_du_carnet_entier(): void
    {
        $agency = $this->carnet();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        [$rows, $summary] = $this->lire($agency);
        // Trois bailleurs, le brouillon, et l'admin (`apiActingAsRole` lui pose un profil de bailleur).
        $this->assertCount(5, $rows);
        $drafts = array_filter($rows, fn (array $r) => $r['status'] === 'draft');
        $restes = array_filter(array_column($rows, 'remaining_to_pay'), fn ($r) => $r !== null && $r > 0);

        $this->assertSame(4, $summary['owners']);
        $this->assertSame(count($rows) - count($drafts), $summary['owners']);
        $this->assertSame(count($drafts), $summary['invitations']);
        $this->assertSame(array_sum(array_column($rows, 'properties_count')), $summary['properties']);
        $this->assertSame(3, $summary['properties']); // A : loué + vacant (l'archivé ne compte pas) ; B : loué
        $this->assertSame(2, $summary['with_remaining']);
        $this->assertSame(count($restes), $summary['with_remaining']);
        $this->assertEquals(array_sum($restes), $summary['remaining_to_pay']);
        $this->assertEquals(180_000 + 285_000, $summary['remaining_to_pay']);
    }

    public function test_ni_la_recherche_ni_une_vue_ni_la_page_ne_changent_le_resume(): void
    {
        $agency = $this->carnet();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        [, $global] = $this->lire($agency);

        foreach (['&filter[search]=awa', '&filter[has_remaining]=1', '&filter[status]=draft', '&filter[search]=personne', '&sort=-remaining_to_pay&page=2&per_page=1'] as $query) {
            $response = $this->apiGet("/api/owners?filter[agency_id]={$agency->id}{$query}")->assertOk();
            $this->assertSame($global, $response->json('meta.summary'), $query);
        }
        // La vue, elle, a bien filtré.
        $this->assertSame(1, $this->apiGet("/api/owners?filter[agency_id]={$agency->id}&filter[status]=draft")->json('meta.total'));
    }

    public function test_sans_payouts_create_le_resume_ne_dit_rien_de_l_argent(): void
    {
        $agency = $this->carnet();
        $role = AgencyRole::factory()->ofType(AgencyRoleBaseType::Agent)
            ->withCapabilities([Capability::PaymentsRecord, Capability::CrmViewAll])
            ->create(['agency_id' => $agency->id]);
        $agent = User::factory()->withTwoFactor()->create();
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agency->id, 'agency_role_id' => $role->id]);
        Sanctum::actingAs($agent->fresh());

        [, $summary] = $this->lire($agency);

        $this->assertSame(['owners' => 3, 'properties' => 3, 'remaining_to_pay' => null, 'with_remaining' => null, 'invitations' => 1], $summary);
    }

    /** Le super-admin lit le résumé d'UNE agence, celle qu'il filtre ; sans elle, aucun résumé. */
    public function test_le_resume_du_super_admin_est_celui_de_l_agence_filtree(): void
    {
        $agency = $this->carnet();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        [, $admin] = $this->lire($agency);

        $this->apiActingAsRole('super_admin');
        [, $super] = $this->lire($agency);
        $this->assertSame($admin, $super);

        $response = $this->apiGet('/api/owners?per_page=100')->assertOk();
        $this->assertGreaterThan($admin['owners'] + $admin['invitations'], count($response->json('data'))); // deux agences
        $this->assertArrayHasKey('summary', $response->json('meta'));
        $this->assertNull($response->json('meta.summary'));
    }

    public function test_la_date_d_envoi_suit_le_dernier_envoi_et_pas_le_rappel(): void
    {
        $agency = $this->moneyAgency();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $this->apiPost("/api/agencies/{$agency->id}/owners/invite", [
            'email' => 'bailleur@example.sn', 'first_name' => 'Awa', 'last_name' => 'Sarr', 'owner_type' => 'individual',
        ])->assertCreated();
        $invitation = Invitation::query()->sole();
        $ligne = fn (): array => $this->lire($agency, '&fields[owner_profiles]=id,status')[0][$invitation->invitable_id];

        $this->assertSame($invitation->id, $ligne()['pending_invitation_id']);
        $this->assertSame('2026-09-20T10:00:00+00:00', $ligne()['pending_invitation_sent_at']);

        // Le rappel de J+2 réécrit la ligne (`last_reminded_at`) : ce n'est pas un envoi.
        $this->travelTo('2026-09-23 08:00:00');
        $this->artisan('invitations:remind')->assertSuccessful();
        $this->assertNotNull($invitation->fresh()->last_reminded_at);
        $this->assertSame('2026-09-20T10:00:00+00:00', $ligne()['pending_invitation_sent_at']);

        // Le renvoi, si.
        $this->travelTo('2026-09-24 15:30:00');
        $this->apiPost("/api/invitations/{$invitation->id}/resend")->assertSuccessful();
        $this->assertSame('2026-09-24T15:30:00+00:00', $ligne()['pending_invitation_sent_at']);

        // Révoquée, elle n'est plus en cours : ni identifiant, ni date.
        $invitation->fresh()->forceFill(['status' => InvitationStatus::Revoked->value, 'revoked_at' => now()])->save();
        $this->assertArrayHasKey('pending_invitation_sent_at', $ligne());
        $this->assertNull($ligne()['pending_invitation_id']);
        $this->assertNull($ligne()['pending_invitation_sent_at']);
    }
}
