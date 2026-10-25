<?php

namespace Tests\Feature\Api;

use App\Jobs\GenerateLeasePaymentSchedule;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Guarantor;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Services\Lease\RentReviewService;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * P140.01 (TCK-1788) — un renouvellement qui naît `active` sans signature fige son contrat comme
 * la voie papier : termes d'exécution, empreinte et PDF rangé. Avant, le contrat de l'enfant était
 * rendu à la volée à chaque téléchargement, et une révision de loyer réécrivait le loyer imprimé.
 */
class LeaseRenewalFrozenContractTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Bus::fake([GenerateLeasePaymentSchedule::class]);
        Storage::fake(config('media-library.disk_name'));

        // Le vrai gabarit, rendu en HTML sans le pied de page horodaté (même sonde que
        // `LeaseSignatureTest`) : le contenu imprimé se lit dans les octets servis.
        $this->partialMock(DocumentPdfService::class, function ($mock) {
            $mock->shouldReceive('render')->andReturnUsing(
                fn (string $template, array $data) => (string) preg_replace('/Document généré le [^<]*/u', '', view($template, $data)->render())
            );
        });
    }

    public function test_un_renouvellement_actif_fige_son_contrat_et_une_revision_ne_le_change_pas(): void
    {
        [$landlord, $parent] = $this->scaffold();
        Sanctum::actingAs($landlord);

        $childId = (int) $this->postJson("/api/leases/{$parent->id}/renew", [
            'start_date' => $parent->end_date->copy()->addDay()->toDateString(),
            'end_date' => $parent->end_date->copy()->addYear()->toDateString(),
        ])->assertCreated()->assertJsonPath('data.status', 'active')->json('data.id');

        $child = Lease::query()->findOrFail($childId);
        $this->assertNotNull($child->contract_sha256, 'le contrat du renouvellement actif est figé');
        $this->assertSame([2, 10.0], [$child->early_termination_penalty_months, (float) $child->rent_review_max_pct]);

        $avant = $this->get("/api/leases/{$childId}/contract/pdf")->assertOk()->getContent();
        $this->assertSame($child->contract_sha256, hash('sha256', (string) $avant));
        $this->assertStringContainsString('400', (string) $avant);

        app(RentReviewService::class)->review($child, $landlord, [
            'new_rent' => 420_000,
            'reason' => 'Révision annuelle du loyer',
        ]);
        $this->assertEquals(420_000.0, (float) $child->fresh()->monthly_rent);

        $apres = $this->get("/api/leases/{$childId}/contract/pdf")->assertOk()->getContent();
        $this->assertSame($avant, $apres, 'la révision ne réécrit pas le contrat délivré');
        $this->assertStringNotContainsString('420', (string) $apres);
    }

    public function test_un_renouvellement_en_attente_de_signature_n_est_pas_fige_a_la_naissance(): void
    {
        [$landlord, $parent] = $this->scaffold();
        $parent->forceFill(['contract_sha256' => str_repeat('a', 64)])->save();
        Sanctum::actingAs($landlord);

        $childId = (int) $this->postJson("/api/leases/{$parent->id}/renew", [
            'start_date' => $parent->end_date->copy()->addDay()->toDateString(),
            'monthly_rent' => 450_000,
        ])->assertCreated()->json('data.id');

        $child = Lease::query()->findOrFail($childId);
        $this->assertSame(LeaseStatus::PendingSignature, $child->status);
        $this->assertNull($child->contract_sha256, 'la demande de signature figera ce contrat');
    }

    public function test_le_renouvellement_d_un_bail_anterieur_n_est_pas_fige(): void
    {
        [$landlord, $parent] = $this->scaffold();
        $parent->forceFill(['early_termination_penalty_months' => null, 'rent_review_max_pct' => null])->save();
        Sanctum::actingAs($landlord);

        $childId = (int) $this->postJson("/api/leases/{$parent->id}/renew", [
            'start_date' => $parent->end_date->copy()->addDay()->toDateString(),
        ])->assertCreated()->assertJsonPath('data.status', 'active')->json('data.id');

        // ADR-0042 §1 — « Seul un parent antérieur (colonnes nulles) donne un enfant nul » : ses
        // termes suivent le réglage, et son contrat n'est pas figé (reste de P140.01, au porteur).
        $child = Lease::query()->findOrFail($childId);
        $this->assertNull($child->contract_sha256);
        $this->assertNull($child->rent_review_max_pct);
    }

    /**
     * P231.01 (TCK-2316) — le bail renouvelé naît sans garant, et la réponse le dit. Une caution
     * signée pour le bail précédent n'engage pas d'office le suivant : rien ne recopie le pivot,
     * ni l'ancienne colonne `guarantor_id`, et le contrat figé n'imprime aucun garant.
     */
    public function test_le_bail_renouvele_nait_sans_garant_et_la_reponse_le_dit(): void
    {
        [$landlord, $parent] = $this->scaffold();
        [$principal, $second] = Guarantor::factory()->count(2)->create(['first_name' => 'Ousmane', 'last_name' => 'Garant']);
        $parent->guarantors()->attach([$principal->id => ['role' => 'principal'], $second->id => ['role' => 'parent']]);
        $parent->forceFill(['guarantor_id' => $principal->id])->save();
        Sanctum::actingAs($landlord);

        $childId = (int) $this->postJson("/api/leases/{$parent->id}/renew", [
            'start_date' => $parent->end_date->copy()->addDay()->toDateString(),
        ])->assertCreated()
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('meta.guarantors_not_carried_over', 2)
            ->json('data.id');

        $child = Lease::query()->findOrFail($childId);
        $this->assertSame(0, $child->guarantors()->count());
        $this->assertNull($child->guarantor_id);
        $this->assertSame(2, $parent->guarantors()->count(), 'le bail précédent garde ses garants');

        $this->assertNotNull($child->contract_sha256);
        $contrat = (string) $this->get("/api/leases/{$childId}/contract/pdf")->assertOk()->getContent();
        $this->assertStringNotContainsString('Ousmane', $contrat);
    }

    public function test_sans_garant_au_bail_precedent_la_reponse_n_en_signale_aucun(): void
    {
        [$landlord, $parent] = $this->scaffold();
        Sanctum::actingAs($landlord);

        $this->postJson("/api/leases/{$parent->id}/renew", [
            'start_date' => $parent->end_date->copy()->addDay()->toDateString(),
        ])->assertCreated()->assertJsonPath('meta.guarantors_not_carried_over', 0);
    }

    /**
     * @return array{0: User, 1: Lease}
     */
    private function scaffold(): array
    {
        $landlord = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $tenant = Customer::factory()->create();
        $lease = Lease::factory()->active()->create([
            'landlord_id' => $landlord->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'start_date' => now()->subYear(),
            'end_date' => now(),
            'monthly_rent' => 400_000,
            'deposit_amount' => 800_000,
            // Un parent figé (signé) : ses termes d'exécution passent à l'enfant (ADR-0042 §1).
            'early_termination_penalty_months' => 2,
            'rent_review_max_pct' => 10,
        ]);

        return [$landlord, $lease];
    }
}
