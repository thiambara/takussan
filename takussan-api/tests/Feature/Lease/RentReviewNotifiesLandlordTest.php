<?php

namespace Tests\Feature\Lease;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Lease;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Notifications\LeaseRentReviewedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\Support\FabriqueOccupation;

/**
 * TCK-2642, AC7 — une révision de loyer prévient le bailleur comme le locataire
 * (`NotifyLandlordOfRentReview`, à côté de `NotifyTenantOfRentReview`) ; le bailleur qui révise
 * lui-même n'est pas prévenu de son propre geste.
 */
class RentReviewNotifiesLandlordTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use FabriqueDemandesEtVisites;
    use FabriqueOccupation;
    use RefreshDatabase;

    private Agency $agency;

    private User $owner;

    private User $tenantUser;

    private Lease $lease;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-11 10:00:00');
        $this->agency = $this->agence();
        $this->owner = $this->bailleur($this->agency);
        $this->tenantUser = User::factory()->create();
        $this->lease = $this->bail($this->bienLoue($this->agency, $this->owner, 'Villa Ngor'), 'Loc REVISE', [
            'reference_number' => 'LS-REV-01', 'start_date' => '2025-06-01', 'end_date' => '2027-05-31', 'monthly_rent' => 200_000,
        ]);
        $this->lease->tenant->update(['user_id' => $this->tenantUser->id]);
    }

    private function review(User $as): void
    {
        $this->actingAsApi($as);
        $this->patchJson("/api/leases/{$this->lease->id}/rent", ['new_rent' => 210_000, 'reason' => 'Révision annuelle'])->assertOk();
    }

    public function test_ac7_une_revision_previent_le_bailleur_et_le_locataire(): void
    {
        $admin = $this->agencyAdmin($this->agency);
        $this->actingAsApi($admin);
        $this->assertSame(['LS-REV-01'], array_column($this->getJson('/api/leases?filter[motif]=rent_review_open&fields[leases]=id,reference_number')->assertOk()->json('data'), 'reference_number'), 'anniversaire passé, jamais révisé');

        $this->review($admin);

        $notice = AppNotification::query()->where('user_id', $this->owner->id)->sole();
        $this->assertSame(NotificationCode::LeaseRentReviewedLandlord->value, $notice->code);
        $this->assertSame('LS-REV-01', $notice->params['reference']);
        $this->assertSame('Villa Ngor', $notice->params['property']);
        $this->assertSame('lease', $notice->target['kind']);
        $this->assertSame($this->lease->id, $notice->target['id']);

        Notification::assertSentTo($this->tenantUser, LeaseRentReviewedNotification::class);
        // L'e-mail : la même notification codée part par `mail` (préférence `lease_rent_reviewed`).
        Notification::assertSentTo($this->owner, CodedNotification::class, fn (CodedNotification $n, array $channels) => $n->code === NotificationCode::LeaseRentReviewedLandlord && in_array('mail', $channels, true));

        // La révision, écrite par le service réel, ferme le motif `rent_review_open` (la règle lit son journal).
        $this->assertSame([], $this->getJson('/api/leases?filter[motif]=rent_review_open&fields[leases]=id')->assertOk()->json('data'));
    }

    public function test_le_bailleur_qui_revise_n_est_pas_prevenu_de_son_geste(): void
    {
        $this->review($this->owner);

        $this->assertSame(0, AppNotification::query()->where('user_id', $this->owner->id)->count());
        Notification::assertSentTo($this->tenantUser, LeaseRentReviewedNotification::class);
    }
}
