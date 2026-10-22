<?php

namespace Tests\Feature\Api\Permissions;

use App\Domain\Notifications\NotificationCode;
use App\Jobs\Permissions\ProcessRoleDelegationsJob;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Services\Permissions\RoleDelegationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;

/**
 * TCK-1320 (P128.01) — la fin d'une délégation est inclusive : « jusqu'au 25 » est retirée à la
 * fin du 25, heure de Dakar (décision du porteur, 2026-10-22).
 *
 * Le champ « Fin » du front est un `<input type="date">` : l'API recevait `2026-10-25`, le rangeait
 * à 00:00 et le job retirait le rôle au DÉBUT du jour que la notification annonçait comme dernier.
 */
class RoleDelegationFinInclusiveTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $beneficiary;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo(Carbon::parse('2026-10-20 10:00:00', 'UTC'));

        // Patron de `RoleDelegationTest` : l'administrateur principal, et un membre de l'agence.
        $this->admin = User::factory()->create();
        $this->agency = Agency::factory()->create(['primary_admin_id' => $this->admin->id]);
        $this->admin->update(['agency_id' => $this->agency->id]);

        $this->beneficiary = User::factory()->create(['agency_id' => $this->agency->id]);
    }

    public function test_une_date_seule_est_le_dernier_jour_de_la_delegation_et_le_job_la_retire_a_sa_fin(): void
    {
        $this->actingAs($this->admin);

        $this->postJson("/api/agencies/{$this->agency->id}/role-delegations", [
            'user_id' => $this->beneficiary->id,
            'role' => 'agency_admin',
            'ends_at' => '2026-10-25',
        ])->assertCreated();

        $delegation = RoleDelegation::query()->where('user_id', $this->beneficiary->id)->sole();

        // Rangée à la fin du 25, heure de Dakar.
        $this->assertSame(
            '2026-10-25 23:59:59',
            $delegation->ends_at->copy()->timezone('Africa/Dakar')->format('Y-m-d H:i:s'),
        );

        // La notification annonce ce même jour comme dernier.
        $notification = AppNotification::query()
            ->where('user_id', $this->beneficiary->id)
            ->where('code', NotificationCode::RoleDelegationActivated->value)
            ->sole();
        $this->assertSame('2026-10-25', $notification->params['ends_at']);

        // Toujours active à midi le 25, et juste avant minuit.
        $this->travelTo(Carbon::parse('2026-10-25 12:00:00', 'Africa/Dakar'));
        $this->runJob();
        $this->assertSame(RoleDelegationStatus::Active, $delegation->refresh()->status);

        $this->travelTo(Carbon::parse('2026-10-25 23:59:00', 'Africa/Dakar'));
        $this->runJob();
        $this->assertSame(RoleDelegationStatus::Active, $delegation->refresh()->status);

        // Retirée une fois le 25 passé.
        $this->travelTo(Carbon::parse('2026-10-26 00:00:01', 'Africa/Dakar'));
        $this->runJob();
        $this->assertSame(RoleDelegationStatus::Expired, $delegation->refresh()->status);
    }

    public function test_un_instant_explicite_est_range_tel_quel(): void
    {
        $this->actingAs($this->admin);

        $this->postJson("/api/agencies/{$this->agency->id}/role-delegations", [
            'user_id' => $this->beneficiary->id,
            'role' => 'agency_admin',
            'ends_at' => '2026-10-25T08:30:00+00:00',
        ])->assertCreated();

        $delegation = RoleDelegation::query()->where('user_id', $this->beneficiary->id)->sole();
        $this->assertSame('2026-10-25 08:30:00', $delegation->ends_at->copy()->utc()->format('Y-m-d H:i:s'));
    }

    private function runJob(): void
    {
        (new ProcessRoleDelegationsJob)->handle(app(RoleDelegationService::class));
    }
}
