<?php

namespace Tests\Feature\Payout;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\ReminderChannel;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\LeasePaymentReminder;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2915 (ADR-0105, amendement du 2026-11-15) — le relevé du bailleur rend, par bien, les relances
 * NOTÉES par l'agence des échéances en retard de la période : `{at, channel, by_name}`, jamais la note
 * interne, le sujet ni l'identifiant de l'auteur. Un autre bailleur de l'agence ne les lit pas.
 */
class OwnerStatementRemindersTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $landlord;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-12 10:00:00');
        $this->agency = $this->moneyAgency();
        $this->landlord = $this->landlordOf($this->agency);
        $this->agent = $this->agencyAgent($this->agency);
        $this->agent->forceFill(['first_name' => 'Mariama', 'last_name' => 'Sow'])->save();
    }

    private function lease(string $title, User $landlord): Lease
    {
        $property = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $landlord->id, 'title' => $title]);

        return Lease::factory()->create([
            'property_id' => $property->id,
            'agency_id' => $this->agency->id,
            'landlord_id' => $landlord->id,
            'tenant_id' => Customer::factory()->create(['agency_id' => $this->agency->id])->id,
            'status' => LeaseStatus::Active,
            'start_date' => '2026-01-01',
            'end_date' => '2026-12-31',
            'commission_rate' => 10,
        ]);
    }

    private function rent(Lease $lease, string $due, PaymentStatus $status): LeasePayment
    {
        return LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payment_type' => LeasePaymentType::Rent,
            'amount' => 300_000,
            'status' => $status,
            'paid_at' => $status === PaymentStatus::Paid ? $due.' 10:00:00' : null,
            'due_date' => $due,
            'period_start' => '2026-11-01',
            'period_end' => '2026-11-30',
            'late_fee_amount' => null,
            'late_fee_applied_at' => null,
            'late_fee_paid_at' => null,
        ]);
    }

    private function remind(LeasePayment $payment, string $at, ReminderChannel $channel, ?string $note = null): void
    {
        $this->travelTo($at);
        LeasePaymentReminder::query()->create([
            'agency_id' => $this->agency->id,
            'lease_payment_id' => $payment->id,
            'channel' => $channel,
            'created_by_id' => $this->agent->id,
            'note' => $note,
        ]);
        $this->travelTo('2026-11-12 10:00:00');
    }

    /** @return array<string, array<string, mixed>> */
    private function rows(User $reader, ?User $landlord = null): array
    {
        Sanctum::actingAs($reader);
        $query = $landlord !== null ? "&landlord_id={$landlord->id}&agency_id={$this->agency->id}" : '';

        return array_column($this->getJson("/api/owner-statements?period=2026-11{$query}")->assertOk()->json('data.properties'), null, 'title');
    }

    /**
     * AC4 — un bien en retard relancé le 8 nov. (WhatsApp : le canal SMS de l'AC n'existe pas,
     * `ReminderChannel` = whatsapp|call) : la relance, sans note ni sujet ni identifiant d'auteur.
     */
    public function test_ac4_le_bailleur_lit_date_canal_et_auteur_jamais_la_note(): void
    {
        $late = $this->rent($this->lease('F3 Mermoz', $this->landlord), '2026-11-05', PaymentStatus::Late);
        $this->remind($late, '2026-11-08 09:30:00', ReminderChannel::Whatsapp, 'Locataire injoignable, voir son garant');
        $this->remind($late, '2026-11-10 16:00:00', ReminderChannel::Call, 'Promet de payer vendredi');
        // Un rappel automatique (J+1) : pas une relance de l'agence.
        $late->forceFill(['metadata' => ['reminder_overdue_1_sent_at' => '2026-11-06T08:00:00+00:00']])->saveQuietly();
        $this->rent($this->lease('Villa Almadies', $this->landlord), '2026-11-05', PaymentStatus::Paid);

        $rows = $this->rows($this->landlord);

        $reminders = $rows['F3 Mermoz']['reminders'];
        $this->assertCount(2, $reminders, 'les deux relances notées, sans le rappel automatique');
        foreach ($reminders as $entry) {
            $this->assertSame(['at', 'channel', 'by_name'], array_keys($entry), 'liste blanche : ni note, ni subject, ni by.id');
        }
        $this->assertSame(['call', 'Mariama Sow'], [$reminders[0]['channel'], $reminders[0]['by_name']], 'la plus récente d\'abord');
        $this->assertStringStartsWith('2026-11-10', $reminders[0]['at']);
        $this->assertSame(['whatsapp', 'Mariama Sow'], [$reminders[1]['channel'], $reminders[1]['by_name']]);
        $this->assertStringStartsWith('2026-11-08', $reminders[1]['at']);
        $this->assertSame([], $rows['Villa Almadies']['reminders'], 'un bien payé : aucune relance');

        $json = json_encode($this->getJson('/api/owner-statements?period=2026-11')->json());
        $this->assertStringNotContainsString('injoignable', $json, 'la note interne ne sort jamais');
        $this->assertStringNotContainsString('vendredi', $json);
    }

    /** Une échéance pas encore échue n'est pas « en retard » : sa relance n'est pas montrée. */
    public function test_une_relance_d_une_echeance_non_echue_n_est_pas_montree(): void
    {
        $due = $this->rent($this->lease('Studio Ouakam', $this->landlord), '2026-11-20', PaymentStatus::Pending);
        $this->remind($due, '2026-11-10 09:00:00', ReminderChannel::Whatsapp);

        $this->assertSame([], $this->rows($this->landlord)['Studio Ouakam']['reminders']);
    }

    /** AC4 — un autre bailleur de l'agence ne lit pas ces relances : ni dans son relevé, ni dans celui du premier. */
    public function test_ac4_un_autre_bailleur_ne_voit_pas_ces_relances(): void
    {
        $late = $this->rent($this->lease('F3 Mermoz', $this->landlord), '2026-11-05', PaymentStatus::Late);
        $this->remind($late, '2026-11-08 09:30:00', ReminderChannel::Whatsapp);
        $other = $this->landlordOf($this->agency);
        $this->rent($this->lease('Duplex Yoff', $other), '2026-11-05', PaymentStatus::Late);

        $rows = $this->rows($other);
        $this->assertArrayNotHasKey('F3 Mermoz', $rows, 'son relevé ne porte que ses biens');
        $this->assertSame([], $rows['Duplex Yoff']['reminders']);

        Sanctum::actingAs($other);
        $this->getJson("/api/owner-statements?period=2026-11&landlord_id={$this->landlord->id}&agency_id={$this->agency->id}")->assertForbidden();
    }

    /** Le personnel de l'agence lit le même relevé, avec les mêmes relances. */
    public function test_le_personnel_lit_le_releve_avec_les_relances(): void
    {
        $late = $this->rent($this->lease('F3 Mermoz', $this->landlord), '2026-11-05', PaymentStatus::Late);
        $this->remind($late, '2026-11-08 09:30:00', ReminderChannel::Whatsapp);

        $this->assertCount(1, $this->rows($this->agent, $this->landlord)['F3 Mermoz']['reminders']);
    }
}
