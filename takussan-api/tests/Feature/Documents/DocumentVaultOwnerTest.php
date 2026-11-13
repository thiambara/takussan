<?php

namespace Tests\Feature\Documents;

use App\Models\Enums\DocumentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Inventory;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Payout\OwnerStatementSnapshots;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\CoffreDeDocuments;
use Tests\TestCase;

/**
 * TCK-2655 (ADR-0099 §2) — le coffre du BAILLEUR, au profil bailleur actif : un dossier par bien
 * (contrats de ses baux hors brouillon, états des lieux signés, documents du bien et de ses baux de
 * tous auteurs), ses relevés envoyés et attestations annuelles, ses pièces. Pas de quittances : le
 * dossier « quittances » est celui du locataire.
 */
class DocumentVaultOwnerTest extends TestCase
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

    public function test_one_folder_per_property_with_its_leases_documents_of_all_authors(): void
    {
        $this->connecter($this->landlord, $this->ownerProfile);
        $vault = $this->coffre();

        $keys = array_column($vault['folders'], 'key');
        $this->assertSame(["property:{$this->otherProperty->id}", "property:{$this->property->id}", 'pieces'], $keys);
        $this->assertNotContains('receipts:2026', $keys);

        $villa = collect($vault['folders'])->firstWhere('key', "property:{$this->property->id}");
        $this->assertSame('Villa Almadies', $villa['name']);
        $paths = array_column($villa['entries'], 'download_path');
        $this->assertContains("/api/leases/{$this->lease->id}/contract/pdf", $paths);
        $this->assertContains("/api/inventories/{$this->signedInventory->id}/pdf", $paths);
        $this->assertNotContains("/api/inventories/{$this->draftInventory->id}/pdf", $paths);
        $this->assertEqualsCanonicalizing(
            [$this->adminDocOnLease->id, $this->adminDocOnProperty->id],
            array_values(array_filter(array_column($villa['entries'], 'document_id'))),
        );
        $onLease = collect($villa['entries'])->firstWhere('document_id', $this->adminDocOnLease->id);
        $this->assertSame([['type' => 'lease', 'id' => $this->lease->id], ['type' => 'property', 'id' => $this->property->id]], $onLease['targets']);

        $plateau = collect($vault['folders'])->firstWhere('key', "property:{$this->otherProperty->id}");
        $plateauPaths = array_column($plateau['entries'], 'download_path');
        $this->assertContains("/api/leases/{$this->otherLease->id}/contract/pdf", $plateauPaths);
        $this->assertNotContains("/api/leases/{$this->draftLease->id}/contract/pdf", $plateauPaths);
        $this->assertSame([$this->adminDocOnOtherLease->id], array_values(array_filter(array_column($plateau['entries'], 'document_id'))));

        // Les pièces du locataire ne sont pas au bailleur.
        $all = array_column($this->entrees($vault), 'document_id');
        $this->assertNotContains($this->idCard->id, $all);
    }

    public function test_r_tck2656_a_lease_target_carries_its_reference_to_tell_two_leases_of_a_property_apart(): void
    {
        $this->connecter($this->landlord, $this->ownerProfile);
        $cibles = collect($this->coffre()['attachable_targets']);

        $bail = $cibles->first(fn (array $c) => $c['type'] === 'lease' && $c['id'] === $this->lease->id);
        $this->assertNotNull($bail);
        $this->assertNotNull($this->lease->reference_number);
        $this->assertSame($this->lease->reference_number, $bail['reference']);
        $this->assertSame("property:{$this->property->id}", $bail['folder']);
        $autre = $cibles->first(fn (array $c) => $c['type'] === 'lease' && $c['id'] === $this->otherLease->id);
        $this->assertSame($this->otherLease->reference_number, $autre['reference']);
        $this->assertNotSame($bail['reference'], $autre['reference']);
        $cibles->reject(fn (array $c) => $c['type'] === 'lease')->each(fn (array $c) => $this->assertNull($c['reference']));
    }

    public function test_the_sent_statements_and_the_annual_attestation_of_a_closed_year(): void
    {
        $snapshots = app(OwnerStatementSnapshots::class);
        $snapshots->record($this->agency, $this->landlord, '2025-12', now());
        $current = now()->format('Y-m');
        $snapshots->record($this->agency, $this->landlord, $current, now());

        $this->connecter($this->landlord, $this->ownerProfile);
        $statements = collect($this->coffre()['folders'])->firstWhere('key', 'statements');

        $this->assertNotNull($statements);
        $this->assertEqualsCanonicalizing(
            [
                "/api/owner-statements/pdf?period={$current}&agency_id={$this->agency->id}",
                "/api/owner-statements/pdf?period=2025-12&agency_id={$this->agency->id}",
                "/api/owner-statements/pdf?period=2025&agency_id={$this->agency->id}",
            ],
            array_column($statements['entries'], 'download_path'),
        );
        foreach ($statements['entries'] as $entry) {
            $this->get($entry['download_path'])->assertOk();
        }
        // L'année en cours n'a pas d'attestation : elle n'est pas close.
        $this->assertNotContains((string) now()->year, array_column($statements['entries'], 'title'));
    }

    public function test_another_landlord_of_the_agency_reads_none_of_it(): void
    {
        // Un relevé envoyé au bailleur du décor : l'autre bailleur de l'agence ne doit pas le voir
        // (le filtre `landlord_id` des relevés). Versant autorisé d'abord.
        $this->assertTrue(app(OwnerStatementSnapshots::class)->record($this->agency, $this->landlord, '2025-12', now()));
        $this->connecter($this->landlord, $this->ownerProfile);
        $this->assertContains('statements', array_column($this->coffre()['folders'], 'key'));

        $stranger = User::factory()->create();
        $profile = OwnerProfile::query()->create(['user_id' => $stranger->id, 'agency_id' => $this->agency->id]);

        $this->connecter($stranger, $profile);
        $vault = $this->coffre();

        $this->assertSame(['pieces'], array_column($vault['folders'], 'key'));
        $this->assertSame([], $this->entrees($vault));
        $this->assertSame([['type' => 'user', 'id' => $stranger->id, 'folder' => 'pieces', 'name' => null, 'reference' => null]], $vault['attachable_targets']);
    }

    /**
     * TCK-2655 (vérification adverse) — le coût ne dépend PAS du nombre de biens : de 2 à 10 biens,
     * chacun avec un bail, deux documents et deux états des lieux signés (l'un conduit par le
     * bailleur : la branche « conducteur »), le même nombre de requêtes. Les règles de lecture sont
     * jugées sous amorce (`MembershipCapabilityResolver::primed()`). Avant : 42 requêtes à 2 biens,
     * 114 à 10. Échauffement d'abord : les capacités du rôle se lisent une fois par processus.
     */
    public function test_the_query_count_does_not_depend_on_the_number_of_properties(): void
    {
        $this->connecter($this->landlord, $this->ownerProfile);
        $this->coffre();
        $two = $this->requetes(fn () => $this->coffre());

        foreach (range(1, 8) as $i) {
            $property = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->landlord->id]);
            $lease = $this->leaseFor(User::factory()->create(), $property, LeaseStatus::Active);
            $this->document($lease, $this->admin, DocumentType::Other, "Doc {$i}");
            $this->document($property, $this->admin, DocumentType::Other, "Bien {$i}");
            Inventory::factory()->signed()->create(['lease_id' => $lease->id, 'property_id' => $property->id, 'tenant_id' => $lease->tenant_id, 'conducted_by' => $this->admin->id]);
            Inventory::factory()->signed()->moveOut()->create(['lease_id' => $lease->id, 'property_id' => $property->id, 'tenant_id' => $lease->tenant_id, 'conducted_by' => $this->landlord->id]);
        }

        $vault = $this->coffre();
        $this->assertCount(10, array_filter(array_column($vault['folders'], 'kind'), fn (string $k) => $k === 'property'));
        $this->assertCount(1 + 16, array_filter($this->entrees($vault), fn (array $e) => str_starts_with($e['category'], 'inventory_')));
        $this->assertSame($two, $this->requetes(fn () => $this->coffre()));
    }
}
