<?php

namespace Tests\Feature\Api;

use App\Models\Enums\ServiceProviderBillStatus;
use App\Models\ServiceProviderBill;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\LaravelPdf\Facades\Pdf;
use Tests\TestCase;

/**
 * TCK-2911 (ADR-0120 § 2) — « Relevé de mes factures » : le PDF des factures du prestataire APPELANT
 * sur la période, hors brouillons, datées par leur envoi (à défaut leur naissance). Aucune facture
 * d'un autre prestataire.
 */
class ServiceProviderBillStatementPdfTest extends TestCase
{
    use RefreshDatabase;

    private function bill(User $provider, string $reference, string $at, array $attributes = []): ServiceProviderBill
    {
        $bill = ServiceProviderBill::factory()->create(array_merge([
            'provider_id' => $provider->id,
            'reference_number' => $reference,
            'amount' => 120_000,
            'status' => ServiceProviderBillStatus::PendingValidation,
            'submitted_at' => $at,
        ], $attributes));
        $bill->forceFill(['created_at' => $at])->save();

        return $bill;
    }

    public function test_ac5_le_releve_liste_les_factures_du_prestataire_sur_la_periode_et_aucune_d_un_autre(): void
    {
        $moi = User::factory()->create();
        $autre = User::factory()->create();
        $this->bill($moi, 'SPB-NOV-PAYEE', '2026-11-03 10:00:00', ['status' => ServiceProviderBillStatus::Paid, 'amount' => 75_000]);
        $this->bill($moi, 'SPB-NOV-ATTENTE', '2026-11-30 18:00:00');
        $this->bill($moi, 'SPB-NOV-REJETEE', '2026-11-12 10:00:00', ['status' => ServiceProviderBillStatus::Rejected, 'amount' => 999_000]);
        $this->bill($moi, 'SPB-NOV-BROUILLON', '2026-11-10 10:00:00', ['status' => ServiceProviderBillStatus::Draft, 'submitted_at' => null]);
        $this->bill($moi, 'SPB-OCT', '2026-10-31 23:00:00');
        // Née en octobre, envoyée en novembre : elle est de novembre.
        $tardive = $this->bill($moi, 'SPB-ENVOYEE-NOV', '2026-11-02 08:00:00');
        $tardive->forceFill(['created_at' => '2026-10-20 08:00:00'])->save();
        // Antérieure à l'ADR, sans instant d'envoi : datée par sa naissance.
        $this->bill($moi, 'SPB-ANCIENNE-NOV', '2026-11-05 08:00:00', ['submitted_at' => null]);
        $this->bill($autre, 'SPB-AUTRE-PRESTATAIRE', '2026-11-15 10:00:00');

        $pdf = Pdf::fake();
        Sanctum::actingAs($moi);
        $reponse = $this->get('/api/service-provider-bills/statement/pdf?from=2026-11-01&to=2026-11-30');

        $reponse->assertOk();
        $this->assertStringStartsWith('application/pdf', (string) $reponse->headers->get('Content-Type'));
        $html = (string) $pdf->html;
        foreach (['SPB-NOV-PAYEE', 'SPB-NOV-ATTENTE', 'SPB-NOV-REJETEE', 'SPB-ENVOYEE-NOV', 'SPB-ANCIENNE-NOV'] as $reference) {
            $this->assertStringContainsString($reference, $html);
        }
        foreach (['SPB-NOV-BROUILLON', 'SPB-OCT', 'SPB-AUTRE-PRESTATAIRE'] as $reference) {
            $this->assertStringNotContainsString($reference, $html);
        }
        // Facturé : 75 000 + 3 × 120 000 (la rejetée n'y compte pas) ; payé : 75 000. XOF sans décimale.
        $this->assertMatchesRegularExpression('/435\D{1,3}000/u', $html);
        $this->assertMatchesRegularExpression('/75\D{1,3}000/u', $html);
        $this->assertDoesNotMatchRegularExpression('/435\D{1,3}000[,.]00/u', $html);
    }

    public function test_par_defaut_le_mois_en_cours_et_une_periode_bornee(): void
    {
        $this->travelTo('2026-11-15 12:00:00');
        $moi = User::factory()->create();
        $this->bill($moi, 'SPB-CE-MOIS', '2026-11-02 10:00:00');
        $this->bill($moi, 'SPB-MOIS-DERNIER', '2026-10-02 10:00:00');

        $pdf = Pdf::fake();
        Sanctum::actingAs($moi);
        $this->get('/api/service-provider-bills/statement/pdf')->assertOk();
        $this->assertStringContainsString('SPB-CE-MOIS', (string) $pdf->html);
        $this->assertStringNotContainsString('SPB-MOIS-DERNIER', (string) $pdf->html);

        $this->getJson('/api/service-provider-bills/statement/pdf?from=2026-01-01&to=2027-06-01')->assertUnprocessable()->assertJsonValidationErrors('to');
        $this->getJson('/api/service-provider-bills/statement/pdf?from=2026-11-10&to=2026-11-01')->assertUnprocessable()->assertJsonValidationErrors('to');
        $this->getJson('/api/service-provider-bills/statement/pdf?from[]=2026-11-01')->assertUnprocessable();
    }
}
