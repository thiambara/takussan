<?php

namespace Tests\Feature\Documents;

use App\Models\Agency;
use App\Models\Enums\DocumentType;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Inventory;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\CoffreDeDocuments;
use Tests\TestCase;

/**
 * TCK-2655 (ADR-0099) — le coffre du LOCATAIRE : un dossier par bail (contrat, états des lieux
 * signés, documents du bail de tous auteurs), ses quittances par année, ses pièces.
 */
class DocumentVaultTenantTest extends TestCase
{
    use CoffreDeDocuments;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->batirLeCoffre();
    }

    /** AC1 — six quittances (les six échéances payées), le contrat, l'état des lieux signé. */
    public function test_ac1_six_receipts_the_contract_and_the_signed_inventory(): void
    {
        $this->connecter($this->tenant);
        $vault = $this->coffre();
        $paths = $this->chemins($vault);

        $receipts = array_values(array_filter($this->entrees($vault), fn (array $e) => str_starts_with($e['category'], 'receipt_')));
        $this->assertCount(6, $receipts);
        $this->assertEqualsCanonicalizing(
            array_map(fn ($p) => "/api/leases/{$this->lease->id}/receipts/{$p->id}/pdf", $this->paid),
            array_column($receipts, 'download_path'),
        );
        $this->assertSame(['receipts:2026'], array_values(array_unique(array_column($receipts, 'folder'))));

        $this->assertContains("/api/leases/{$this->lease->id}/contract/pdf", $paths);
        $this->assertContains("/api/inventories/{$this->signedInventory->id}/pdf", $paths);

        $leaseFolder = collect($vault['folders'])->firstWhere('key', "lease:{$this->lease->id}");
        $this->assertSame('Villa Almadies', $leaseFolder['name']);
        $this->assertEqualsCanonicalizing(
            ['lease_contract', 'inventory_move_in', 'lease_contract'],
            array_column($leaseFolder['entries'], 'category'),
        );
    }

    /** AC1 — aucune quittance pour une échéance impayée, remboursée, ou une restitution de caution. */
    public function test_ac1_no_receipt_for_an_unpaid_a_refunded_or_a_deposit_refund_installment(): void
    {
        $this->connecter($this->tenant);
        $paths = $this->chemins($this->coffre());

        foreach ($this->withoutReceipt as $motif => $payment) {
            $this->assertNotContains("/api/leases/{$this->lease->id}/receipts/{$payment->id}/pdf", $paths, $motif);
        }
        // Le brouillon de sortie : son PDF est refusé, il n'est pas listé.
        $this->assertNotContains("/api/inventories/{$this->draftInventory->id}/pdf", $paths);
        // Le bail en brouillon n'a ni dossier ni contrat.
        $this->assertNotContains("/api/leases/{$this->draftLease->id}/contract/pdf", $paths);
    }

    /** AC2 — le document de l'admin sur le bail est au locataire de ce bail, pas à l'autre. */
    public function test_ac2_the_admin_document_on_the_lease_reaches_its_tenant_only(): void
    {
        $this->connecter($this->tenant);
        $mine = $this->entrees($this->coffre());
        $doc = collect($mine)->firstWhere('document_id', $this->adminDocOnLease->id);
        $this->assertNotNull($doc);
        $this->assertSame("lease:{$this->lease->id}", $doc['folder']);
        $this->assertSame([['type' => 'lease', 'id' => $this->lease->id]], $doc['targets']);
        $this->assertNotContains($this->adminDocOnOtherLease->id, array_column($mine, 'document_id'));
        $this->assertNotContains($this->adminDocOnProperty->id, array_column($mine, 'document_id'));

        $this->connecter($this->otherTenant);
        $theirs = $this->entrees($this->coffre());
        $this->assertNotContains($this->adminDocOnLease->id, array_column($theirs, 'document_id'));
        $this->assertContains($this->adminDocOnOtherLease->id, array_column($theirs, 'document_id'));
        $this->assertNotContains("/api/leases/{$this->lease->id}/contract/pdf", array_column($theirs, 'download_path'));
    }

    /** Les pièces du locataire sont dans « mes pièces », avec leur expiration ; les comptes suivent. */
    public function test_the_pieces_folder_and_the_attention_counts(): void
    {
        $this->connecter($this->tenant);
        $vault = $this->coffre();

        $pieces = collect($vault['folders'])->firstWhere('key', 'pieces');
        $this->assertEqualsCanonicalizing([$this->idCard->id, $this->insurance->id], array_column($pieces['entries'], 'document_id'));
        $this->assertSame(today()->addDays(42)->toDateString(), collect($pieces['entries'])->firstWhere('document_id', $this->idCard->id)['expiry_date']);

        // Expire bientôt : la CNI (42 j), pas l'assurance (90 j). À vérifier : les trois documents listés.
        $this->assertSame(['expiring_soon' => 1, 'unverified' => 3], $vault['counts']);

        $this->assertEqualsCanonicalizing(
            [['type' => 'user', 'id' => $this->tenant->id], ['type' => 'lease', 'id' => $this->lease->id]],
            array_map(fn (array $t) => ['type' => $t['type'], 'id' => $t['id']], $vault['attachable_targets']),
        );
    }

    /**
     * Le coût est constant par échéance et par document : 3 échéances ou 36, 3 documents ou 13.
     */
    public function test_the_query_count_does_not_grow_with_the_installments_nor_the_documents(): void
    {
        $this->connecter($this->tenant);
        $this->coffre(); // échauffement
        $few = $this->requetes(fn () => $this->coffre());

        foreach (range(1, 30) as $i) {
            $this->payment($this->lease, LeasePaymentType::Rent, PaymentStatus::Paid, sprintf('%d-%02d-05', 2023 + intdiv($i, 12), $i % 12 + 1));
        }
        foreach (range(1, 5) as $i) {
            $this->document($this->lease, $this->admin, DocumentType::Other, "Pièce {$i}");
            $this->document($this->tenant, $this->tenant, DocumentType::Other, "Mienne {$i}");
        }

        $vault = $this->coffre();
        $this->assertCount(36, array_filter($this->entrees($vault), fn (array $e) => str_starts_with($e['category'], 'receipt_')));
        $this->assertCount(13, array_filter($this->entrees($vault), fn (array $e) => $e['kind'] === 'uploaded'));
        $this->assertSame($few, $this->requetes(fn () => $this->coffre()));
    }

    /**
     * TCK-2655 (vérification adverse) — ni par bail ni par état des lieux : de 1 à 7 baux, répartis
     * sur deux agences, chacun avec ses états des lieux signés (l'un conduit par le bailleur), une
     * échéance payée et un document, le même nombre de requêtes. Avant : 49 requêtes pour un bail,
     * 249 pour neuf (les profils de l'appelant relus à chaque jugement de policy).
     */
    public function test_the_query_count_does_not_depend_on_the_number_of_leases(): void
    {
        $this->connecter($this->tenant);
        $this->coffre();
        $one = $this->requetes(fn () => $this->coffre());

        $agencyB = Agency::factory()->create();
        $landlordB = User::factory()->create();
        OwnerProfile::query()->create(['user_id' => $landlordB->id, 'agency_id' => $agencyB->id]);
        foreach (range(1, 6) as $i) {
            [$agency, $landlord] = $i % 2 === 0 ? [$this->agency, $this->landlord] : [$agencyB, $landlordB];
            $property = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $landlord->id]);
            $lease = $this->leaseFor($this->tenant, $property, LeaseStatus::Active);
            Inventory::factory()->signed()->create(['lease_id' => $lease->id, 'property_id' => $property->id, 'tenant_id' => $lease->tenant_id, 'conducted_by' => $this->admin->id]);
            Inventory::factory()->signed()->moveOut()->create(['lease_id' => $lease->id, 'property_id' => $property->id, 'tenant_id' => $lease->tenant_id, 'conducted_by' => $landlord->id]);
            $this->payment($lease, LeasePaymentType::Rent, PaymentStatus::Paid, '2026-03-05');
            $this->document($lease, $this->admin, DocumentType::Other, "Bail {$i}");
        }

        $vault = $this->coffre();
        $this->assertCount(7, array_filter(array_column($vault['folders'], 'kind'), fn (string $k) => $k === 'lease'));
        $this->assertCount(13, array_filter($this->entrees($vault), fn (array $e) => str_starts_with($e['category'], 'inventory_')));
        $this->assertSame($one, $this->requetes(fn () => $this->coffre()));
    }
}
