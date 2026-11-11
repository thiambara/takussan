<?php

namespace Tests\Feature\Api;

use App\Jobs\GenerateLeasePaymentSchedule;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2719 (décision du porteur du 2026-11-11, option a) — un contrat signé ne se régénère jamais :
 * il ne se fige donc pas tant que la fiche du locataire n'a ni prénom ni nom (un compte ouvert par
 * e-mail ou par téléphone naît sans, TCK-2605). `422 lease_signature.tenant_without_name`, après le
 * refus du compte manquant, et avant tout gel : ni empreinte, ni média, ni changement de statut.
 */
class LeaseSignatureTenantNameTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Customer $tenant;

    private Lease $lease;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Bus::fake([GenerateLeasePaymentSchedule::class]);
        $this->mock(DocumentPdfService::class, function ($mock) {
            $mock->shouldReceive('render')->andReturnUsing(fn (string $template, array $data) => view($template, $data)->render());
        });

        $agency = Agency::factory()->create();
        $this->owner = User::factory()->withOwnerProfile($agency)->create();
        $this->tenant = Customer::factory()->create([
            'user_id' => User::factory()->create(['first_name' => '', 'last_name' => ''])->id,
            'first_name' => '', 'last_name' => '', 'email' => 'a@x.sn',
        ]);
        $this->lease = Lease::factory()->create([
            'property_id' => Property::factory()->create(['user_id' => $this->owner->id, 'agency_id' => $agency->id])->id,
            'landlord_id' => $this->owner->id,
            'tenant_id' => $this->tenant->id,
            'agency_id' => $agency->id,
        ]);
    }

    private function demander(): TestResponse
    {
        Sanctum::actingAs($this->owner);

        return $this->postJson("/api/leases/{$this->lease->id}/signature-request");
    }

    private function assertRienNEstFige(LeaseStatus $statut = LeaseStatus::Draft): void
    {
        $lease = $this->lease->fresh();
        $this->assertSame($statut, $lease->status);
        $this->assertNull($lease->contract_sha256);
        $this->assertNull($lease->signature_requested_at);
        $this->assertCount(0, $lease->getMedia('signed_contract'));
    }

    /** AC1 */
    public function test_un_locataire_sans_nom_ne_part_pas_en_signature(): void
    {
        $this->demander()->assertStatus(422)->assertJsonPath('code', 'lease_signature.tenant_without_name');

        $this->assertRienNEstFige();
    }

    /** AC1 — des espaces ne sont pas un nom. */
    public function test_un_nom_fait_d_espaces_n_est_pas_un_nom(): void
    {
        $this->tenant->forceFill(['first_name' => '  ', 'last_name' => ' '])->save();

        $this->demander()->assertStatus(422)->assertJsonPath('code', 'lease_signature.tenant_without_name');
        $this->assertRienNEstFige();
    }

    /** AC2 — la fiche complétée, la demande passe ; un nom seul suffit. */
    public function test_la_fiche_completee_la_demande_passe(): void
    {
        $this->demander()->assertStatus(422);

        $this->tenant->forceFill(['first_name' => 'Awa'])->save();

        $this->demander()->assertOk()->assertJsonPath('data.status', 'pending_signature');
        $this->assertNotNull($this->lease->fresh()->contract_sha256);
        $this->assertStringContainsString('Awa', (string) $this->lease->fresh()->frozenContractBytes());
    }

    /** AC3 — sans compte ET sans nom : le refus du compte reste le premier. */
    public function test_sans_compte_ni_nom_le_refus_du_compte_passe_d_abord(): void
    {
        $this->tenant->forceFill(['user_id' => null])->save();

        $this->demander()->assertStatus(422)->assertJsonPath('code', 'lease_signature.tenant_without_account');
        $this->assertRienNEstFige();
    }

    /** Le message est rendu dans la langue de la requête, depuis `lang/` (le front l'affiche tel quel). */
    public function test_le_refus_porte_son_message(): void
    {
        Sanctum::actingAs($this->owner);

        $fr = $this->postJson("/api/leases/{$this->lease->id}/signature-request", [], ['Accept-Language' => 'fr'])->json('message');
        $en = $this->postJson("/api/leases/{$this->lease->id}/signature-request", [], ['Accept-Language' => 'en'])->json('message');

        $this->assertSame(__('errors.lease_signature.tenant_without_name', [], 'fr'), $fr);
        $this->assertSame(__('errors.lease_signature.tenant_without_name', [], 'en'), $en);
        $this->assertNotSame('errors.lease_signature.tenant_without_name', $fr);
    }
}
