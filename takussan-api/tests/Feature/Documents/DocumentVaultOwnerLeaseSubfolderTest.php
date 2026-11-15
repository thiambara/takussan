<?php

namespace Tests\Feature\Documents;

use App\Models\Enums\DocumentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Inventory;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\CoffreDeDocuments;
use Tests\TestCase;

/**
 * TCK-2897 (ADR-0099, amendement du 2026-11-15) — le coffre du BAILLEUR range les documents d'un bail
 * dans un sous-dossier du bien (`parent`), au nom du locataire et à la référence du bail : contrat, états
 * des lieux signés, pièces du bail. Le dossier du bien garde ses pièces. Un brouillon n'a pas de
 * sous-dossier. La liste reste plate.
 */
class DocumentVaultOwnerLeaseSubfolderTest extends TestCase
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

    /** @return array<string, mixed> */
    private function dossier(array $vault, string $key): array
    {
        $folder = collect($vault['folders'])->firstWhere('key', $key);
        $this->assertNotNull($folder, "le dossier {$key}");

        return $folder;
    }

    public function test_ac1_le_bail_actif_a_son_sous_dossier_dans_le_bien_avec_son_contrat(): void
    {
        $this->connecter($this->landlord, $this->ownerProfile);
        $vault = $this->coffre();

        $this->assertSame(
            ["property:{$this->otherProperty->id}", "lease:{$this->otherLease->id}", "property:{$this->property->id}", "lease:{$this->lease->id}", 'pieces'],
            array_column($vault['folders'], 'key'),
        );

        $bail = $this->dossier($vault, "lease:{$this->lease->id}");
        $this->assertSame('lease', $bail['kind']);
        $this->assertSame("property:{$this->property->id}", $bail['parent']);
        $this->assertSame($this->lease->tenant->full_name, $bail['name']);
        $this->assertNotNull($this->lease->reference_number);
        $this->assertSame($this->lease->reference_number, $bail['reference']);
        $this->assertSame(['type' => 'lease', 'id' => $this->lease->id], $bail['target']);
        $this->assertFalse($bail['read_only']);

        $chemins = array_column($bail['entries'], 'download_path');
        $this->assertContains("/api/leases/{$this->lease->id}/contract/pdf", $chemins);
        $this->assertContains("/api/inventories/{$this->signedInventory->id}/pdf", $chemins);
        $this->assertSame([$this->adminDocOnLease->id], array_values(array_filter(array_column($bail['entries'], 'document_id'))));
        foreach ($bail['entries'] as $entree) {
            $this->assertSame([['type' => 'lease', 'id' => $this->lease->id], ['type' => 'property', 'id' => $this->property->id]], array_slice($entree['targets'], 0, 2));
        }

        // Le dossier du bien ne liste plus le contrat à plat : il garde les pièces du bien.
        $bien = $this->dossier($vault, "property:{$this->property->id}");
        $this->assertNull($bien['parent']);
        $this->assertNull($bien['reference']);
        $this->assertNotContains("/api/leases/{$this->lease->id}/contract/pdf", array_column($bien['entries'], 'download_path'));
        $this->assertSame([$this->adminDocOnProperty->id], array_column($bien['entries'], 'document_id'));

        // Chaque dossier porte la même forme ; « mes pièces » n'a pas de parent.
        $this->assertNull($this->dossier($vault, 'pieces')['parent']);
        // Le sous-dossier est la cible où joindre un document au bail.
        $cible = collect($vault['attachable_targets'])->first(fn (array $c) => $c['type'] === 'lease' && $c['id'] === $this->lease->id);
        $this->assertSame("lease:{$this->lease->id}", $cible['folder']);
    }

    public function test_ac2_un_bail_en_brouillon_ne_produit_aucun_sous_dossier(): void
    {
        $this->connecter($this->landlord, $this->ownerProfile);
        $vault = $this->coffre();

        $this->assertNotContains("lease:{$this->draftLease->id}", array_column($vault['folders'], 'key'));
        $this->assertSame(1, collect($vault['folders'])->where('parent', "property:{$this->otherProperty->id}")->count());
        $this->assertNotContains("/api/leases/{$this->draftLease->id}/contract/pdf", $this->chemins($vault));
    }

    public function test_deux_baux_d_un_bien_ont_chacun_leur_sous_dossier(): void
    {
        $ended = $this->leaseFor(User::factory()->create(), $this->property, LeaseStatus::Terminated);

        $this->connecter($this->landlord, $this->ownerProfile);
        $vault = $this->coffre();

        $sous = collect($vault['folders'])->where('parent', "property:{$this->property->id}")->pluck('key')->sort()->values()->all();
        $this->assertEqualsCanonicalizing(["lease:{$this->lease->id}", "lease:{$ended->id}"], $sous);
        $this->assertContains("/api/leases/{$ended->id}/contract/pdf", array_column($this->dossier($vault, "lease:{$ended->id}")['entries'], 'download_path'));
    }

    public function test_le_sous_dossier_d_un_bien_en_lecture_seule_l_est_aussi(): void
    {
        $this->ownerProfile->forceFill(['status' => OwnerProfileStatus::Blocked->value])->save();

        $this->connecter($this->landlord);
        $vault = $this->coffre();

        $this->assertTrue($this->dossier($vault, "property:{$this->property->id}")['read_only']);
        $bail = $this->dossier($vault, "lease:{$this->lease->id}");
        $this->assertTrue($bail['read_only']);
        $this->assertSame("property:{$this->property->id}", $bail['parent']);
    }

    public function test_le_locataire_garde_son_dossier_de_bail_sans_parent(): void
    {
        $this->connecter($this->tenant);
        $vault = $this->coffre();

        $bail = $this->dossier($vault, "lease:{$this->lease->id}");
        $this->assertNull($bail['parent']);
        $this->assertSame('Villa Almadies', $bail['name']);
        $this->assertSame($this->lease->reference_number, $bail['reference']);
    }

    /** Le nombre de requêtes ne dépend pas du nombre de baux rangés en sous-dossiers. */
    public function test_le_nombre_de_requetes_ne_depend_pas_du_nombre_de_baux(): void
    {
        $this->connecter($this->landlord, $this->ownerProfile);
        $this->coffre();
        $avant = $this->requetes(fn () => $this->coffre());

        foreach (range(1, 6) as $i) {
            $property = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->landlord->id]);
            $lease = $this->leaseFor(User::factory()->create(), $property, LeaseStatus::Active);
            $this->leaseFor(User::factory()->create(), $property, LeaseStatus::Terminated);
            $this->document($lease, $this->admin, DocumentType::Other, "Doc {$i}");
            Inventory::factory()->signed()->create(['lease_id' => $lease->id, 'property_id' => $property->id, 'tenant_id' => $lease->tenant_id, 'conducted_by' => $this->admin->id]);
        }

        $vault = $this->coffre();
        $this->assertCount(2 + 12, array_filter($vault['folders'], fn (array $f) => $f['parent'] !== null));
        $this->assertSame($avant, $this->requetes(fn () => $this->coffre()));
    }
}
