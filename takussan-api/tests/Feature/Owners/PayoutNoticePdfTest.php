<?php

namespace Tests\Feature\Owners;

use App\Models\Agency;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PayoutStatus;
use App\Models\Payout;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Concerns\BuildsMoneyOut;

/**
 * TCK-2909 (AC4) — un reversement rend sa nature (acompte ou solde, écrite à sa création ; la
 * restitution, le remboursement constaté et la facture de prestataire par leurs colonnes) et son
 * moyen ; l'avis de versement (`GET /api/payouts/{id}/notice/pdf`) se lit sous `PayoutPolicy::view`
 * — le bailleur concerné, le personnel qui tient `payouts.create` — d'un reversement au bailleur
 * terminé seulement.
 */
class PayoutNoticePdfTest extends ApiTestCase
{
    use BuildsMoneyOut;
    use RefreshDatabase;

    private Agency $agency;

    private User $landlord;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-09-20 10:00:00');
        $this->agency = $this->moneyAgency();
        $this->landlord = $this->landlordOf($this->agency);
    }

    private function completed(array $attributes = []): Payout
    {
        return Payout::factory()->create(array_merge([
            'agency_id' => $this->agency->id, 'landlord_id' => $this->landlord->id, 'payee_role' => PayeeRole::Landlord,
            'status' => PayoutStatus::Completed, 'processed_at' => '2026-09-15 09:00:00',
            'gross_amount' => 200_000, 'commission_amount' => 20_000, 'net_amount' => 180_000,
            'currency' => 'XOF', 'payment_method' => PaymentMethod::BankTransfer, 'nature' => 'balance',
        ], $attributes));
    }

    public function test_acompte_puis_solde_a_la_creation(): void
    {
        $lease = $this->leaseOf($this->agency, $this->landlord);
        $premier = $this->leasePayment($lease, 200_000);
        $second = $this->leasePayment($lease, 200_000, paidAt: '2026-09-12 10:00:00');
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);

        // Il reste un loyer encaissé non reversé : acompte.
        $this->apiPost('/api/payouts', ['landlord_id' => $this->landlord->id, 'lease_payment_ids' => [$premier->id], 'payment_method' => 'bank_transfer'])
            ->assertCreated()
            ->assertJsonPath('data.nature', 'advance')
            ->assertJsonPath('data.payment_method', 'bank_transfer');
        // Plus rien n'attend : solde.
        $id = $this->apiPost('/api/payouts', ['landlord_id' => $this->landlord->id, 'lease_payment_ids' => [$second->id]])
            ->assertCreated()->assertJsonPath('data.nature', 'balance')->json('data.id');

        // La nature est écrite : un loyer encaissé ensuite ne change pas le solde en acompte.
        $this->leasePayment($lease, 200_000, paidAt: '2026-09-18 10:00:00');
        $this->apiGet("/api/payouts/{$id}")->assertOk()->assertJsonPath('data.nature', 'balance');
        $this->assertSame(['advance', 'balance'], $this->apiGet('/api/payouts?sort=id')->assertOk()->json('data.*.nature'));
    }

    /** Le solde est celui du MOIS de la période : un loyer d'octobre n'en fait pas un acompte de septembre. */
    public function test_un_encaissement_du_mois_suivant_ne_fait_pas_un_acompte(): void
    {
        $this->travelTo('2026-10-03 10:00:00');
        $lease = $this->leaseOf($this->agency, $this->landlord);
        $septembre = $this->leasePayment($lease, 200_000);
        $this->leasePayment($lease, 200_000, paidAt: '2026-10-02 10:00:00');
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);

        $this->apiPost('/api/payouts', ['landlord_id' => $this->landlord->id, 'lease_payment_ids' => [$septembre->id], 'period_end' => '2026-09-30'])
            ->assertCreated()->assertJsonPath('data.nature', 'balance');
    }

    public function test_les_autres_natures_viennent_des_colonnes(): void
    {
        $tenant = Payout::factory()->create(['agency_id' => $this->agency->id, 'landlord_id' => $this->landlord->id, 'payee_role' => PayeeRole::Tenant]);
        $provider = Payout::factory()->create(['agency_id' => $this->agency->id, 'landlord_id' => User::factory()->create()->id, 'payee_role' => PayeeRole::ServiceProvider]);

        $this->assertSame('deposit_refund', $tenant->refresh()->nature?->value);
        $this->assertSame('provider_bill', $provider->refresh()->nature?->value);
    }

    public function test_l_avis_se_lit_par_le_bailleur_et_le_personnel_jamais_par_un_autre_bailleur(): void
    {
        $payout = $this->completed();
        $url = "/api/payouts/{$payout->id}/notice/pdf";

        Sanctum::actingAs($this->landlord);
        $response = $this->get($url)->assertOk();
        $this->assertSame('application/pdf', $response->headers->get('Content-Type'));
        $this->assertStringStartsWith('%PDF', (string) $response->getContent());

        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);
        $this->get($url)->assertOk();

        Sanctum::actingAs($this->landlordOf($this->agency));
        $this->getJson($url)->assertForbidden();

        $this->apiActingAsRole('agency_admin', ['agency' => Agency::factory()->create()]);
        $this->getJson($url)->assertForbidden();
    }

    /** Le contenu : nature, moyen, destination MASQUÉE seulement, montants XOF sans sous-unité. */
    public function test_le_contenu_de_l_avis(): void
    {
        app()->setLocale('fr');
        $payout = $this->completed(['metadata' => ['destination_masked' => 'SN•••• 4521']]);

        $html = view('pdf.payouts.notice', [
            'agency' => $this->agency, 'payout' => $payout->load('agency'), 'landlord' => $this->landlord,
            'destination' => 'SN•••• 4521', 'title' => 'Avis', 'document_label' => 'Avis', 'company_name' => 'SCI Baobab',
        ])->render();

        $this->assertStringContainsString('Avis de versement', $html);
        $this->assertStringContainsString('Solde', $html);
        $this->assertStringContainsString('SCI Baobab', $html);
        $this->assertStringContainsString('Virement bancaire', $html);
        $this->assertStringContainsString('SN•••• 4521', $html);
        $this->assertStringContainsString('15/09/2026', $html);
        $this->assertMatchesRegularExpression('/180[\s\x{202F}\x{00A0}]000/u', $html);
        $this->assertStringNotContainsString('180 000,00', $html);
    }

    public function test_seul_un_reversement_au_bailleur_termine_a_un_avis(): void
    {
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);

        foreach ([
            $this->completed(['status' => PayoutStatus::Pending, 'processed_at' => null]),
            $this->completed(['status' => PayoutStatus::Cancelled, 'processed_at' => null]),
            $this->completed(['payee_role' => PayeeRole::Tenant, 'nature' => null]),
        ] as $payout) {
            $this->getJson("/api/payouts/{$payout->id}/notice/pdf")
                ->assertUnprocessable()->assertJsonPath('code', 'payout.notice_unavailable');
        }
    }
}
