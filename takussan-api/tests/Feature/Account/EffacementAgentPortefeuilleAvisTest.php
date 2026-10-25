<?php

namespace Tests\Feature\Account;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\TaskStatus;
use App\Models\Task;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Services\Account\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Support\EnvoisParCode;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2164 (P204.01) — à la demande d'effacement d'un membre du personnel, les administrateurs de
 * chaque agence où son portefeuille n'est pas vide reçoivent un avis avec l'inventaire, pour le
 * passer pendant le délai de grâce par l'assistant existant.
 */
class EffacementAgentPortefeuilleAvisTest extends ApiTestCase
{
    use EnvoisParCode;
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $admin;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agence = $this->agence();
        $this->admin = $this->personnel($this->agence, 'agency_admin');
        $this->agent = $this->personnel($this->agence);
    }

    private function tacheOuverte(User $assigne): Task
    {
        return Task::factory()->forCustomer(Customer::factory()->create(['agency_id' => $this->agence->id]))->create([
            'created_by_id' => $this->admin->id,
            'assigned_to_id' => $assigne->id,
            'status' => TaskStatus::Open,
        ]);
    }

    public function test_les_admins_de_l_agence_recoivent_l_inventaire_du_portefeuille(): void
    {
        $this->tacheOuverte($this->agent);
        $this->tacheOuverte($this->agent);

        app(AccountDeletionService::class)->requestDeletion($this->agent);

        $avis = Notification::sent($this->admin, CodedNotification::class, self::deCode(NotificationCode::AgencyMemberDeletionRequested));
        $this->assertCount(1, $avis);
        $this->assertSame(2, $avis->first()->params['tasks']);
        $this->assertSame(0, $avis->first()->params['maintenance']);
        $this->assertSame('team', $avis->first()->target['kind'] ?? null);
        Notification::assertNotSentTo($this->agent, CodedNotification::class, self::deCode(NotificationCode::AgencyMemberDeletionRequested));
    }

    public function test_un_portefeuille_vide_ne_previent_personne(): void
    {
        app(AccountDeletionService::class)->requestDeletion($this->agent);

        Notification::assertNotSentTo($this->admin, CodedNotification::class, self::deCode(NotificationCode::AgencyMemberDeletionRequested));
    }

    public function test_l_admin_qui_s_efface_ne_s_avise_pas_lui_meme(): void
    {
        $autreAdmin = $this->personnel($this->agence, 'agency_admin');
        $this->tacheOuverte($this->admin);

        app(AccountDeletionService::class)->requestDeletion($this->admin);

        Notification::assertNotSentTo($this->admin, CodedNotification::class, self::deCode(NotificationCode::AgencyMemberDeletionRequested));
        $this->assertCount(1, Notification::sent($autreAdmin, CodedNotification::class, self::deCode(NotificationCode::AgencyMemberDeletionRequested)));
    }
}
