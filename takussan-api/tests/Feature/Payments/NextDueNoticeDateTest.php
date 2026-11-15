<?php

namespace Tests\Feature\Payments;

use App\Jobs\SendLeasePaymentReminders;
use App\Models\Agency;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\User;
use App\Services\Model\NotificationService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\Support\FabriqueOccupation;

/**
 * TCK-2915 — `next_due_notice_date`, la date du prochain avis d'échéance (le rappel J-3 de
 * `SendLeasePaymentReminders`), sur l'occupation du bien (`include=occupancy`) et sur le bail
 * (`include=due_summary`) : la prochaine échéance que le job relancerait, moins `DUE_SOON_DAYS` ; elle
 * passe à la suivante une fois l'avis parti, `null` s'il n'y en a plus.
 */
class NextDueNoticeDateTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use FabriqueDemandesEtVisites;
    use FabriqueOccupation;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private Lease $lease;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-20 10:00:00');
        $this->agency = $this->agence();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->lease = $this->bail($this->bienLoue($this->agency, $this->bailleur($this->agency), 'F3 Mermoz'), 'Yacine DIOUF');
        $this->loyer($this->lease, '2026-11-05', PaymentStatus::Paid);
        // Une caution ouverte n'est jamais relancée : elle n'a pas d'avis, même plus proche.
        $this->loyer($this->lease, '2026-11-25', PaymentStatus::Pending, ['payment_type' => LeasePaymentType::Deposit]);
    }

    /** @return array{0: ?string, 1: ?string} [occupation du bien, bail] */
    private function noticeDates(): array
    {
        $this->actingAsApi($this->admin);
        $property = $this->getJson("/api/properties/{$this->lease->property_id}?include=occupancy")->assertOk()->json('data.occupancy');
        $lease = $this->getJson("/api/leases/{$this->lease->id}?include=due_summary")->assertOk()->json('data');
        $this->assertArrayHasKey('next_due_notice_date', $property);
        $this->assertArrayHasKey('next_due_notice_date', $lease);

        return [$property['next_due_notice_date'], $lease['next_due_notice_date']];
    }

    /** AC1 — échéance ouverte du 5 déc. : avis le 2 déc. ; parti, l'avis passe à l'échéance suivante, puis à `null`. */
    public function test_ac1_j_moins_3_de_la_prochaine_echeance_puis_la_suivante_apres_l_envoi(): void
    {
        $this->loyer($this->lease, '2026-12-05', PaymentStatus::Pending);
        $this->loyer($this->lease, '2027-01-05', PaymentStatus::Pending);

        $this->assertSame(['2026-12-02', '2026-12-02'], $this->noticeDates());

        // Le job du 2 déc. envoie l'avis du 5 déc.
        $this->travelTo('2026-12-02 08:00:00');
        (new SendLeasePaymentReminders)->handle(app(NotificationService::class));
        $this->travelTo('2026-12-02 10:00:00');
        $this->assertSame(['2027-01-02', '2027-01-02'], $this->noticeDates(), 'l\'avis parti, la date passe à l\'échéance suivante');

        $this->travelTo('2027-01-02 08:00:00');
        (new SendLeasePaymentReminders)->handle(app(NotificationService::class));
        $this->travelTo('2027-01-02 10:00:00');
        $this->assertSame([null, null], $this->noticeDates(), 'plus aucune échéance à aviser');
    }

    /**
     * AC2 — une seule source : la date servie est `due_date − DUE_SOON_DAYS`, et le job, ce jour-là,
     * envoie bien l'avis de cette échéance (la date servie et l'envoi lisent la même constante).
     */
    public function test_ac2_la_date_suit_la_constante_du_job(): void
    {
        $due = $this->loyer($this->lease, '2026-12-10', PaymentStatus::Pending);
        $expected = CarbonImmutable::parse('2026-12-10')->subDays(SendLeasePaymentReminders::DUE_SOON_DAYS)->toDateString();

        $this->assertSame([$expected, $expected], $this->noticeDates());

        $this->travelTo($expected.' 08:00:00');
        (new SendLeasePaymentReminders)->handle(app(NotificationService::class));
        $this->assertArrayHasKey('reminder_due_soon_sent_at', $due->fresh()->metadata ?? [], 'le job avise ce jour-là');
    }

    /** Une échéance déjà payée n'a pas d'avis ; un bail sans échéance ouverte rend `null`. */
    public function test_rien_a_aviser_rend_null(): void
    {
        $this->loyer($this->lease, '2026-12-05', PaymentStatus::Paid);

        $this->assertSame([null, null], $this->noticeDates());
    }

    /** Un bien vacant : `null`. */
    public function test_un_bien_vacant_rend_null(): void
    {
        $vacant = $this->bienLoue($this->agency, $this->bailleur($this->agency), 'Studio Ouakam');
        $this->actingAsApi($this->admin);

        $this->assertNull($this->getJson("/api/properties/{$vacant->id}?include=occupancy")->assertOk()->json('data.occupancy.next_due_notice_date'));
    }
}
