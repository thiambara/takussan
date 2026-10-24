<?php

namespace Tests\Feature\Api;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsInvoices;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\FormeDuShow;
use Tests\TestCase;

/**
 * ADR-0071 (TCK-1511, P95.03) — `store`, `send`, `markPaid` et `cancel` d'une facture rendent la
 * forme de son `show`, dont `credit_notes`. Avant : seul le `show` chargeait les avoirs, et la
 * réponse de l'annulation, le geste qui crée l'avoir, était la seule où il manquait. Chaque écriture
 * est relue par le `show` du même appelant.
 */
class InvoiceWriteMatchesShowTest extends TestCase
{
    use BuildsInvoices;
    use CreatesAgencyMembers;
    use FormeDuShow;
    use RefreshDatabase;

    public function test_la_creation_rend_la_forme_du_show(): void
    {
        [, $admin, $customer] = $this->invoicingAgency();
        Sanctum::actingAs($admin);

        $ecriture = $this->postJson('/api/invoices', [
            'customer_id' => $customer->id,
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(15)->toDateString(),
            'subtotal' => 100000,
        ])->assertCreated()->json('data');

        $this->assertEcritureALaFormeDuShow($ecriture, $this->show($ecriture['id']), geste: 'store');
    }

    public function test_envoyer_puis_marquer_payee_rendent_la_forme_du_show(): void
    {
        [$agency, $admin, $customer] = $this->invoicingAgency();
        $facture = $this->draftOf($agency, $customer);
        Sanctum::actingAs($admin);

        $ecriture = $this->postJson("/api/invoices/{$facture->id}/send")->assertOk()->json('data');
        $this->assertEcritureALaFormeDuShow($ecriture, $this->show($facture->id), geste: 'send');

        $ecriture = $this->postJson("/api/invoices/{$facture->id}/mark-paid")->assertOk()->json('data');
        $this->assertEcritureALaFormeDuShow($ecriture, $this->show($facture->id), geste: 'markPaid');
    }

    public function test_annuler_une_facture_emise_rend_l_avoir_comme_le_show(): void
    {
        [$agency, $admin, $customer] = $this->invoicingAgency();
        $facture = $this->draftOf($agency, $customer);
        Sanctum::actingAs($admin);
        $this->postJson("/api/invoices/{$facture->id}/send")->assertOk();

        $ecriture = $this->postJson("/api/invoices/{$facture->id}/cancel")->assertOk()->json('data');

        $show = $this->show($facture->id);
        // ADR-0071, point 4 : la donnée remplit ce que le `show` rend — l'avoir y est.
        $this->assertNotEmpty($show['credit_notes'], 'le show doit rendre l\'avoir');
        $this->assertEcritureALaFormeDuShow($ecriture, $show, geste: 'cancel');
    }

    /** @return array<string, mixed> */
    private function show(int $id): array
    {
        $show = $this->getJson("/api/invoices/{$id}")->assertOk()->json('data');
        $this->assertArrayHasKey('credit_notes', $show);

        return $show;
    }
}
