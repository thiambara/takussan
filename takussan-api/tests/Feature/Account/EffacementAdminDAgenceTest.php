<?php

namespace Tests\Feature\Account;

use App\Models\AccountDeletionRequest;
use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyStatus;
use App\Models\User;
use App\Services\Account\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2166 (P204.02) — l'effacement du seul administrateur, ou de l'administrateur principal,
 * d'une agence (décision du porteur du 2026-10-24) :
 *  - espace `individual`, ou agence sans autre membre actif : l'agence passe `inactive` à l'exécution ;
 *  - un autre administrateur existe : `primary_admin_id` lui passe à l'exécution ;
 *  - du personnel mais aucun autre administrateur : une obligation, que le compte lève en promouvant un membre.
 */
class EffacementAdminDAgenceTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function agenceDe(?User &$admin = null, AgencyKind $kind = AgencyKind::Standard): Agency
    {
        $agence = Agency::factory()->create(['kind' => $kind, 'status' => AgencyStatus::Active]);
        $admin = $this->personnel($agence, 'agency_admin');
        $agence->forceFill(['primary_admin_id' => $admin->id])->save();

        return $agence;
    }

    private function effacer(User $user): void
    {
        app(AccountDeletionService::class)->requestDeletion($user);
        $request = AccountDeletionRequest::query()->where('user_id', $user->id)->sole();
        $request->forceFill(['scheduled_for' => now()->subMinute()])->save();
        app(AccountDeletionService::class)->executeDeletion($request->fresh());
    }

    private function obligationsDAgence(User $user): array
    {
        return array_values(array_filter(
            app(AccountDeletionService::class)->collectOpenObligations($user),
            fn (array $o) => $o['type'] === 'agency_admin_succession',
        ));
    }

    public function test_l_espace_individuel_passe_inactif_a_l_execution(): void
    {
        $agence = $this->agenceDe($admin, AgencyKind::Individual);
        $this->bailleur($agence);

        $this->assertSame([], $this->obligationsDAgence($admin));
        $this->effacer($admin);

        $this->assertSame(AgencyStatus::Inactive, $agence->fresh()->status);
    }

    public function test_une_agence_sans_autre_membre_actif_passe_inactive(): void
    {
        $agence = $this->agenceDe($admin);

        $this->effacer($admin);

        $this->assertSame(AgencyStatus::Inactive, $agence->fresh()->status);
    }

    public function test_le_titre_d_admin_principal_passe_a_l_autre_admin(): void
    {
        $agence = $this->agenceDe($admin);
        $autre = $this->personnel($agence, 'agency_admin');
        $this->personnel($agence);

        $this->assertSame([], $this->obligationsDAgence($admin));
        $this->effacer($admin);

        $agence->refresh();
        $this->assertSame($autre->id, $agence->primary_admin_id);
        $this->assertSame(AgencyStatus::Active, $agence->status);
    }

    public function test_du_personnel_sans_autre_admin_retient_l_effacement(): void
    {
        $agence = $this->agenceDe($admin);
        $this->personnel($agence);

        $obligations = $this->obligationsDAgence($admin);
        $this->assertCount(1, $obligations);
        $this->assertSame($agence->id, $obligations[0]['id']);

        $this->expectException(ValidationException::class);
        app(AccountDeletionService::class)->requestDeletion($admin);
    }

    public function test_un_admin_qui_n_est_pas_principal_ne_touche_a_rien(): void
    {
        $agence = $this->agenceDe($principal);
        $admin = $this->personnel($agence, 'agency_admin');
        $this->personnel($agence);

        $this->assertSame([], $this->obligationsDAgence($admin));
        $this->effacer($admin);

        $agence->refresh();
        $this->assertSame($principal->id, $agence->primary_admin_id);
        $this->assertSame(AgencyStatus::Active, $agence->status);
    }
}
