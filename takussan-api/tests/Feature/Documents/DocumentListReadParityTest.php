<?php

namespace Tests\Feature\Documents;

use App\Models\Document;
use App\Models\Enums\LeaseStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\CoffreDeDocuments;
use Tests\TestCase;

/**
 * TCK-2655 (ADR-0099, AC5) — la liste suit la lecture, dans les DEUX sens, par HTTP :
 *
 *  1. chaque entrée listée s'ouvre (`download_path` → 200) ;
 *  2. chaque source du décor qui s'ouvre pour l'appelant, et qui a un dossier chez lui, est listée.
 *
 * Le second sens est ce qui empêche un coffre vide de passer le premier. Les sources sont TOUTES
 * celles du décor (contrats, quittances de toutes les échéances, états des lieux, documents), pas un
 * échantillon des entrées listées.
 */
class DocumentListReadParityTest extends TestCase
{
    use CoffreDeDocuments;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->batirLeCoffre();
    }

    /**
     * Les sources du décor, par famille. Le bail en brouillon n'en fait pas partie : son locataire le
     * lit (`LeasePolicy::view`), mais un brouillon n'a pas de dossier au coffre (décision prise à l'implémentation, à
     * confirmer — notes de TCK-2655).
     *
     * @return array<string, list<string>>
     */
    private function sources(): array
    {
        $leases = [$this->lease, $this->otherLease];

        return [
            'contracts' => array_map(fn (Lease $l) => "/api/leases/{$l->id}/contract/pdf", $leases),
            'receipts' => LeasePayment::query()->whereIn('lease_id', array_map(fn (Lease $l) => $l->id, $leases))->get()
                ->map(fn (LeasePayment $p) => "/api/leases/{$p->lease_id}/receipts/{$p->id}/pdf")->all(),
            'inventories' => ["/api/inventories/{$this->signedInventory->id}/pdf", "/api/inventories/{$this->draftInventory->id}/pdf"],
            'documents' => Document::query()->whereNot('documentable_type', Lease::class)->orWhere('documentable_id', '!=', $this->draftLease->id)->pluck('id')
                ->map(fn (int $id) => "/api/documents/{$id}")->all(),
        ];
    }

    /**
     * @param  list<string>  $listed
     * @param  list<string>  $families  les familles qui ont un dossier chez cet appelant
     */
    private function assertParity(array $listed, array $families, string $who): void
    {
        $this->assertNotEmpty($listed, $who);
        foreach ($listed as $path) {
            $this->assertSame(200, $this->get($path)->getStatusCode(), "{$who} : listé mais refusé — {$path}");
        }

        foreach (array_intersect_key($this->sources(), array_flip($families)) as $family => $paths) {
            foreach ($paths as $path) {
                $readable = $this->get($path)->getStatusCode() === 200;
                $this->assertSame($readable, in_array($path, $listed, true), "{$who} / {$family} : {$path} ".($readable ? 'lisible mais absent' : 'refusé mais listé'));
            }
        }
    }

    public function test_the_tenant_vault_lists_exactly_what_its_endpoints_open(): void
    {
        $this->connecter($this->tenant);
        $this->assertParity($this->chemins($this->coffre()), ['contracts', 'receipts', 'inventories', 'documents'], 'locataire');
    }

    public function test_the_other_tenant_vault_lists_exactly_what_its_endpoints_open(): void
    {
        $this->connecter($this->otherTenant);
        $this->assertParity($this->chemins($this->coffre()), ['contracts', 'receipts', 'inventories', 'documents'], 'autre locataire');
    }

    /** Le bailleur : ses biens, sans quittances (le dossier « quittances » est celui du locataire). */
    public function test_the_landlord_vault_lists_exactly_what_its_endpoints_open(): void
    {
        $this->connecter($this->landlord, OwnerProfile::query()->where('user_id', $this->landlord->id)->sole());
        $this->assertParity($this->chemins($this->coffre()), ['contracts', 'inventories', 'documents'], 'bailleur');
    }

    /** `GET /api/documents/generated` : les générés d'un bail et d'un bien, au personnel de l'agence. */
    public function test_the_generated_entries_of_a_target_are_exactly_its_readable_sources(): void
    {
        $this->connecter($this->agent);

        $lease = array_column($this->getJson("/api/documents/generated?target=lease:{$this->lease->id}")->assertOk()->json('data'), 'download_path');
        $this->assertParity($lease, [], 'agent, bail');
        $sources = $this->sources();
        $ofLease = fn (array $paths) => array_values(array_filter($paths, fn (string $p) => str_contains($p, "/leases/{$this->lease->id}/") || str_contains($p, "/inventories/{$this->signedInventory->id}/") || str_contains($p, "/inventories/{$this->draftInventory->id}/")));
        foreach ([...$ofLease($sources['contracts']), ...$ofLease($sources['receipts']), ...$sources['inventories']] as $path) {
            $this->assertSame($this->get($path)->getStatusCode() === 200, in_array($path, $lease, true), $path);
        }
        $this->assertCount(1 + 1 + 6, $lease); // contrat, état des lieux signé, six quittances

        $property = array_column($this->getJson("/api/documents/generated?target=property:{$this->otherProperty->id}")->assertOk()->json('data'), 'download_path');
        $this->assertSame(["/api/leases/{$this->otherLease->id}/contract/pdf"], $property);
    }

    public function test_the_generated_endpoint_refuses_what_view_refuses_and_rejects_a_bad_target(): void
    {
        $this->connecter($this->otherTenant);
        $this->getJson("/api/documents/generated?target=lease:{$this->lease->id}")->assertForbidden();

        $this->connecter(User::factory()->create());
        $this->getJson("/api/documents/generated?target=property:{$this->property->id}")->assertForbidden();

        foreach (['', '?target=lease', '?target=user:1', '?target=lease:abc', '?target[]=lease:1'] as $query) {
            $this->getJson('/api/documents/generated'.$query)->assertStatus(422)->assertJsonPath('message', __('errors.document.invalid_target'));
        }
        $this->getJson('/api/documents/generated?target=lease:999999999')->assertNotFound();
    }

    /**
     * TCK-2655 (vérification adverse) — `documents/generated` d'un bien, au personnel : le même
     * nombre de requêtes pour 1 bail ou 9 (avant : une de plus par bail, `view` jugé bail par bail).
     */
    public function test_the_generated_entries_of_a_property_cost_the_same_whatever_the_leases(): void
    {
        $this->connecter($this->agent);
        $call = fn () => $this->getJson("/api/documents/generated?target=property:{$this->property->id}")->assertOk();
        $call();
        $one = $this->requetes($call);

        foreach (range(1, 8) as $_) {
            $lease = $this->leaseFor(User::factory()->create(), $this->property, LeaseStatus::Expired);
            Inventory::factory()->signed()->create(['lease_id' => $lease->id, 'property_id' => $this->property->id, 'tenant_id' => $lease->tenant_id, 'conducted_by' => $this->landlord->id]);
        }

        $this->assertCount(9 + 9, $call()->json('data'));
        $this->assertSame($one, $this->requetes($call));
    }

    public function test_both_routes_refuse_an_anonymous_caller(): void
    {
        $this->getJson('/api/me/document-vault')->assertUnauthorized();
        $this->getJson("/api/documents/generated?target=lease:{$this->lease->id}")->assertUnauthorized();
    }
}
