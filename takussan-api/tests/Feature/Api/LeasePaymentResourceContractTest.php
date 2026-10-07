<?php

namespace Tests\Feature\Api;

use App\Models\Enums\PaymentStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * TCK-593 — le contrat de `LeasePaymentResource`, clé par clé.
 *
 * Le front lisait `late_fee` là où la ressource envoyait `late_fee_amount` : le « +X FCFA » de
 * l'échéancier ne s'affichait jamais, et rien ne le voyait. Ce test fige les clés EXACTES ; le type
 * `LeasePayment` de `takussan-web/src/types/lease.ts` s'aligne sur elles.
 */
class LeasePaymentResourceContractTest extends TestCase
{
    use LeaseDueFixture;
    use RefreshDatabase;

    public const KEYS = [
        'id', 'reference_number', 'lease_id', 'payer_id', 'collector_id',
        'amount', 'currency', 'payment_method', 'payment_type',
        'period_start', 'period_end', 'due_date', 'paid_at', 'status',
        'paid_amount', 'remaining_amount',
        'late_fee_amount', 'late_fee_applied_at', 'late_fee_paid_at',
        'late_fee_outstanding', 'late_fee_payable_online', 'amount_due', 'receipt_available',
        'notes', 'created_at',
    ];

    public function test_les_cles_de_la_ressource_sont_exactement_celles_du_contrat(): void
    {
        $ctx = $this->leaseDue();
        Sanctum::actingAs($ctx['tenant']);

        $row = $this->getJson("/api/leases/{$ctx['lease']->id}/payments")->assertOk()->json('data.0');

        $this->assertEqualsCanonicalizing(self::KEYS, array_keys($row));
    }

    /** AC3 — réglage désactivé : la pénalité restant due est montrée, pas demandée. */
    public function test_reglage_desactive_la_penalite_est_due_mais_pas_payable_en_ligne(): void
    {
        $ctx = $this->leaseDue(['late_fee_online_collection' => false]);
        Sanctum::actingAs($ctx['tenant']);

        $this->getJson("/api/leases/{$ctx['lease']->id}/payments")->assertOk()
            ->assertJsonPath('data.0.amount_due', 150000)
            ->assertJsonPath('data.0.late_fee_amount', 7500)
            ->assertJsonPath('data.0.late_fee_outstanding', 7500)
            ->assertJsonPath('data.0.late_fee_payable_online', false)
            ->assertJsonPath('data.0.receipt_available', false);
    }

    /** AC3 — réglage activé : `amount_due` porte la pénalité. */
    public function test_reglage_active_la_penalite_entre_dans_amount_due(): void
    {
        $ctx = $this->leaseDue(['late_fee_online_collection' => true]);
        Sanctum::actingAs($ctx['tenant']);

        $this->getJson("/api/leases/{$ctx['lease']->id}/payments")->assertOk()
            ->assertJsonPath('data.0.amount_due', 157500)
            ->assertJsonPath('data.0.late_fee_payable_online', true);
    }

    /** Une échéance payée dont la pénalité reste due ne demande rien en ligne. */
    public function test_echeance_payee_amount_due_nul_et_quittance_disponible(): void
    {
        $ctx = $this->leaseDue(['late_fee_online_collection' => true], ['status' => PaymentStatus::Paid, 'paid_at' => now()]);
        Sanctum::actingAs($ctx['tenant']);

        $this->getJson("/api/leases/{$ctx['lease']->id}/payments")->assertOk()
            ->assertJsonPath('data.0.amount_due', 0)
            ->assertJsonPath('data.0.late_fee_outstanding', 7500)
            ->assertJsonPath('data.0.late_fee_payable_online', false)
            ->assertJsonPath('data.0.receipt_available', true);
    }

    /** Une échéance `failed` (données antérieures) reste payable. */
    public function test_echeance_en_echec_reste_payable(): void
    {
        $ctx = $this->leaseDue(null, ['status' => PaymentStatus::Failed, 'late_fee_amount' => null, 'late_fee_applied_at' => null]);
        Sanctum::actingAs($ctx['tenant']);

        $this->getJson("/api/leases/{$ctx['lease']->id}/payments")->assertOk()
            ->assertJsonPath('data.0.amount_due', 150000);
    }
}
