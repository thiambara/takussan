<?php

namespace Tests\Feature\Api;

use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Services\Export\ExportDataService;
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
        'paid_amount', 'remaining_amount', 'refund_amount',
        'late_fee_amount', 'late_fee_applied_at', 'late_fee_paid_at',
        'late_fee_outstanding', 'late_fee_payable_online', 'amount_due', 'receipt_available',
        'is_overdue', 'notes', 'created_at',
    ];

    public function test_les_cles_de_la_ressource_sont_exactement_celles_du_contrat(): void
    {
        $ctx = $this->leaseDue();
        Sanctum::actingAs($ctx['tenant']);

        $row = $this->getJson("/api/leases/{$ctx['lease']->id}/payments")->assertOk()->json('data.0');

        $this->assertEqualsCanonicalizing(self::KEYS, array_keys($row));
    }

    /**
     * TCK-1135 (P76.06) — le montant rendu d'une échéance, tel qu'en base : dans la ressource, sous
     * la forme de `BookingPaymentResource`, et en dernière colonne de l'export des paiements.
     */
    public function test_une_echeance_remboursee_en_partie_rend_son_refund_amount(): void
    {
        $ctx = $this->leaseDue(null, [
            'status' => PaymentStatus::Refunded,
            'paid_at' => now()->subDays(5),
            'late_fee_amount' => null,
            'late_fee_applied_at' => null,
            'refund_amount' => 40_000,
        ]);
        Sanctum::actingAs($ctx['tenant']);

        $this->getJson("/api/leases/{$ctx['lease']->id}/payments")->assertOk()
            ->assertJsonPath('data.0.refund_amount', 40000);

        $export = app(ExportDataService::class)->payments($ctx['tenant']);
        // TCK-2060 (P206.05) — `late_fee_paid_at` prend la dernière colonne ; `refund_amount` la précède.
        $this->assertSame('refund_amount', $export['columns'][count($export['columns']) - 2]);
        $this->assertSame(40000.0, $export['rows'][0]['refund_amount']);
        $this->assertSame(array_keys($export['rows'][0]), $export['columns']);
    }

    /**
     * TCK-2060 (P206.05) — l'export des paiements distingue une pénalité réglée d'une pénalité due :
     * `late_fee_paid_at`, en dernière colonne, la valeur en base sans calcul, comme `paid_at`.
     */
    public function test_l_export_rend_la_date_de_reglement_de_la_penalite_en_derniere_colonne(): void
    {
        $ctx = $this->leaseDue(null, [
            'status' => PaymentStatus::Paid,
            'paid_at' => '2026-03-10 09:15:00',
            'late_fee_amount' => 7_500,
            'late_fee_applied_at' => '2026-03-06 00:00:00',
            'late_fee_paid_at' => '2026-03-10 09:15:00',
        ]);

        $export = app(ExportDataService::class)->payments($ctx['tenant']);

        $this->assertSame('late_fee_paid_at', end($export['columns']));
        $this->assertSame('2026-03-10 09:15:00', $export['rows'][0]['late_fee_paid_at']);
        $this->assertSame(array_keys($export['rows'][0]), $export['columns']);
    }

    public function test_une_penalite_due_rend_une_date_de_reglement_nulle_a_l_export(): void
    {
        $ctx = $this->leaseDue();
        $this->assertNotNull($ctx['payment']->refresh()->late_fee_amount, 'La fixture porte une pénalité due.');

        $export = app(ExportDataService::class)->payments($ctx['tenant']);

        $this->assertArrayHasKey('late_fee_paid_at', $export['rows'][0]);
        $this->assertNull($export['rows'][0]['late_fee_paid_at']);
    }

    public function test_sans_remboursement_refund_amount_est_nul(): void
    {
        $ctx = $this->leaseDue();
        Sanctum::actingAs($ctx['tenant']);

        $this->getJson("/api/leases/{$ctx['lease']->id}/payments")->assertOk()
            ->assertJsonPath('data.0.refund_amount', null);

        $export = app(ExportDataService::class)->payments($ctx['tenant']);
        $this->assertNull($export['rows'][0]['refund_amount']);
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

    /**
     * AC3 (ajouté après vérification adverse, AC3b) — une échéance payée EN PARTIE ne demande que
     * son reste : `amount` à la place de `remaining_amount` dans `amountDue` demandait le loyer
     * entier, et aucun test n'avait de paiement partiel. Ce qui est montré est ce qui est transmis.
     */
    public function test_une_echeance_payee_en_partie_ne_demande_que_son_reste(): void
    {
        $spy = $this->spyDriver();
        foreach ([false => [100000, 10_000_000], true => [107500, 10_750_000]] as $online => [$due, $cents]) {
            $ctx = $this->leaseDue(['late_fee_online_collection' => (bool) $online], ['metadata' => ['paid_amount' => 50_000]]);
            Sanctum::actingAs($ctx['tenant']);

            $this->getJson("/api/leases/{$ctx['lease']->id}/payments")->assertOk()
                ->assertJsonPath('data.0.remaining_amount', 100000)
                ->assertJsonPath('data.0.amount_due', $due);

            $this->postJson("/api/lease-payments/{$ctx['payment']->id}/initiate", ['provider' => 'wave'])->assertOk();
            $this->assertSame($cents, end($spy->calls)['amount_cents']);
        }
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

    /**
     * TCK-1831 (P183.01) — `is_overdue` suit la règle de `scopeOverdue` : `late`, ou
     * `pending`/`partially_paid` dû AVANT aujourd'hui. L'échéance du jour n'est pas en retard (la
     * première relance part à J+1), et une restitution de caution ne l'est jamais : c'est l'agence
     * qui la doit (features.md, TCK-595).
     */
    public function test_is_overdue_suit_la_regle_de_scope_overdue(): void
    {
        $this->travelTo('2026-10-23 09:00:00');
        $ctx = $this->leaseDue(null, ['status' => PaymentStatus::Late, 'due_date' => '2026-10-10']);
        Sanctum::actingAs($ctx['tenant']);

        $ligne = fn (array $attrs) => LeasePayment::factory()->create(array_merge([
            'lease_id' => $ctx['lease']->id,
            'payer_id' => $ctx['payment']->payer_id,
            'amount' => 150_000,
            'payment_type' => LeasePaymentType::Rent,
            'late_fee_amount' => null,
            'late_fee_applied_at' => null,
            'paid_at' => null,
        ], $attrs))->id;

        $attendu = [
            $ctx['payment']->id => true,
            $ligne(['status' => PaymentStatus::Pending, 'due_date' => '2026-10-23']) => false,
            $ligne(['status' => PaymentStatus::Pending, 'due_date' => '2026-10-22']) => true,
            $ligne(['status' => PaymentStatus::Pending, 'due_date' => '2026-10-24']) => false,
            $ligne(['status' => PaymentStatus::PartiallyPaid, 'due_date' => '2026-10-22']) => true,
            $ligne(['status' => PaymentStatus::Paid, 'due_date' => '2026-10-22', 'paid_at' => '2026-10-21 10:00:00']) => false,
            $ligne(['status' => PaymentStatus::Cancelled, 'due_date' => '2026-10-01']) => false,
            $ligne(['status' => PaymentStatus::Pending, 'due_date' => '2026-10-01', 'payment_type' => LeasePaymentType::DepositRefund]) => false,
            $ligne(['status' => PaymentStatus::Late, 'due_date' => '2026-10-01', 'payment_type' => LeasePaymentType::DepositRefund]) => false,
        ];

        $rendu = collect($this->getJson("/api/leases/{$ctx['lease']->id}/payments")->assertOk()->json('data'))
            ->mapWithKeys(fn (array $row) => [$row['id'] => $row['is_overdue']])
            ->all();

        foreach ($attendu as $id => $enRetard) {
            $this->assertSame($enRetard, $rendu[$id] ?? 'absente', "échéance {$id}");
        }
    }
}
