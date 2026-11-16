<?php

namespace Tests\Feature\Documents;

use App\Models\Enums\LeaseStatus;
use App\Models\Enums\ServiceProviderBillStatus;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\ServiceProviderBill;
use App\Models\User;
use App\Services\Payout\OwnerStatementSnapshots;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\Support\CoffreDeDocuments;
use Tests\TestCase;
use ZipArchive;

/**
 * TCK-2898 (ADR-0099, amendement du 2026-11-15) — « Relevés et factures » du bailleur : ses relevés,
 * ses attestations ET les factures d'intervention qui lui sont refacturées, dans un seul dossier
 * (`statements`). Une facture y est exactement quand la branche « bailleur du bien » de
 * `ServiceProviderBillPolicy::downloadPdf` l'ouvre : son bien, `rechargeable_to_landlord`, validée ou
 * payée. Chacune s'ouvre par son PDF, et « Tout télécharger » la met dans l'archive.
 */
class DocumentVaultOwnerChargedBillsTest extends TestCase
{
    use CoffreDeDocuments;
    use RefreshDatabase;

    private OwnerProfile $ownerProfile;

    protected function setUp(): void
    {
        parent::setUp();
        $this->batirLeCoffre();
        $this->ownerProfile = OwnerProfile::query()->where('user_id', $this->landlord->id)->sole();
    }

    private function facture(Property $property, string $reference, array $attributs = []): ServiceProviderBill
    {
        return ServiceProviderBill::factory()->validated()->create([
            'agency_id' => $this->agency->id,
            'property_id' => $property->id,
            'reference_number' => $reference,
            ...$attributs,
        ]);
    }

    /** @return list<array<string, mixed>> */
    private function factures(): array
    {
        $statements = collect($this->coffre()['folders'])->firstWhere('key', 'statements');

        return array_values(array_filter($statements['entries'] ?? [], fn (array $e): bool => $e['category'] === 'provider_bill'));
    }

    public function test_ac6_the_bills_charged_to_the_landlord_sit_with_his_statements_and_open_as_pdf(): void
    {
        app(OwnerStatementSnapshots::class)->record($this->agency, $this->landlord, '2025-12', now());
        $imputee = $this->facture($this->property, 'SPB-IMPUTEE');
        $payee = $this->facture($this->otherProperty, 'SPB-PAYEE', ['status' => ServiceProviderBillStatus::Paid]);
        // Hors du dossier : non refacturée, pas encore validée, brouillon, et le bien d'un autre bailleur.
        $this->facture($this->property, 'SPB-NON-REFACTUREE', ['rechargeable_to_landlord' => false]);
        $this->facture($this->property, 'SPB-EN-ATTENTE', ['status' => ServiceProviderBillStatus::PendingValidation]);
        $this->facture($this->property, 'SPB-BROUILLON', ['status' => ServiceProviderBillStatus::Draft]);
        $ailleurs = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => User::factory()->create()->id]);
        $this->facture($ailleurs, 'SPB-AUTRE-BAILLEUR');

        $this->connecter($this->landlord, $this->ownerProfile);
        $vault = $this->coffre();
        $statements = collect($vault['folders'])->firstWhere('key', 'statements');

        // Un seul dossier : les relevés et les factures ensemble.
        $this->assertSame(1, collect($vault['folders'])->where('kind', 'statements')->count());
        $this->assertNotContains('bills', array_column($vault['folders'], 'kind'));
        $this->assertContains('owner_statement', array_column($statements['entries'], 'category'));
        $factures = $this->factures();
        $this->assertEqualsCanonicalizing(['SPB-IMPUTEE', 'SPB-PAYEE'], array_column($factures, 'title'));
        $this->assertEqualsCanonicalizing(
            ["/api/service-provider-bills/{$imputee->id}/pdf", "/api/service-provider-bills/{$payee->id}/pdf"],
            array_column($factures, 'download_path'),
        );
        foreach ($factures as $facture) {
            $this->get($facture['download_path'])->assertOk();
        }
    }

    public function test_without_any_statement_the_folder_exists_for_the_bills_alone(): void
    {
        $this->facture($this->property, 'SPB-SEULE');

        $this->connecter($this->landlord, $this->ownerProfile);

        $this->assertSame(['SPB-SEULE'], array_column($this->factures(), 'title'));
    }

    public function test_the_archive_of_the_folder_holds_the_bill_pdf(): void
    {
        app(OwnerStatementSnapshots::class)->record($this->agency, $this->landlord, '2025-12', now());
        $this->facture($this->property, 'SPB-ARCHIVE');

        $this->connecter($this->landlord, $this->ownerProfile);
        $response = $this->getJson('/api/me/document-vault/archive?folder=statements', ['Accept-Language' => 'fr']);
        $files = $this->contenu($response);

        $date = today()->toDateString();
        $this->assertEqualsCanonicalizing(
            ['2025-12-31 Relevé.pdf', '2025-12-31 Attestation annuelle.pdf', "{$date} Facture.pdf"],
            array_keys($files),
        );
        foreach ($files as $name => $bytes) {
            $this->assertStringStartsWith('%PDF', $bytes, $name);
        }
    }

    /** Une requête pour les factures, quel que soit le nombre de biens. */
    public function test_the_query_count_does_not_depend_on_the_number_of_properties(): void
    {
        $this->facture($this->property, 'SPB-1');
        $this->connecter($this->landlord, $this->ownerProfile);
        $this->coffre();
        $two = $this->requetes(fn () => $this->coffre());

        foreach (range(1, 4) as $i) {
            $property = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->landlord->id]);
            $this->leaseFor(User::factory()->create(), $property, LeaseStatus::Active);
            $this->facture($property, "SPB-N{$i}");
        }

        $this->assertCount(5, $this->factures());
        $this->assertSame($two, $this->requetes(fn () => $this->coffre()));
    }

    /** @return array<string, string> nom → octets */
    private function contenu(TestResponse $response): array
    {
        $response->assertOk()->assertHeader('Content-Type', 'application/zip');
        $path = tempnam(sys_get_temp_dir(), 'archive-test-');
        file_put_contents($path, $response->streamedContent());
        $zip = new ZipArchive;
        $this->assertTrue($zip->open($path) === true, 'archive illisible');
        $files = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $files[(string) $zip->getNameIndex($i)] = (string) $zip->getFromIndex($i);
        }
        $zip->close();
        unlink($path);

        return $files;
    }
}
