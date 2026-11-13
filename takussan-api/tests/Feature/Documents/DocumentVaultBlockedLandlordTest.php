<?php

namespace Tests\Feature\Documents;

use App\Models\Agency;
use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Inventory;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Payout\OwnerStatementSnapshots;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\Support\CoffreDeDocuments;
use Tests\TestCase;

/**
 * TCK-2729 (décision (a) du porteur du 2026-11-11) — le bailleur que son agence a bloqué ne peut plus
 * activer son profil (`ResolveActiveProfile` → 403), mais les policies lui laissent la lecture de son
 * bien (`BailleurDuBien`, de tout statut). Son coffre range donc, EN LECTURE SEULE, un dossier par
 * bien de ses profils bloqués : les seules entrées que les policies lui ouvrent, sans relevé, sans
 * cible où joindre un document. Le bailleur PARTI (`inactive`, ADR-0108) n'a pas cette surface.
 */
class DocumentVaultBlockedLandlordTest extends TestCase
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

    private function bloquer(): void
    {
        $this->ownerProfile->update(['status' => OwnerProfileStatus::Blocked]);
    }

    /** @return array<string, mixed>|null */
    private function dossier(array $vault, Property $property): ?array
    {
        return collect($vault['folders'])->firstWhere('key', "property:{$property->id}");
    }

    /** @return list<string> */
    private function generesDuDossier(array $folder): array
    {
        $paths = array_column(array_filter($folder['entries'], fn (array $e) => $e['kind'] === 'generated'), 'download_path');
        sort($paths);

        return $paths;
    }

    /** @return list<string> */
    private function generesDeLEndpoint(Property $property): array
    {
        $paths = array_column($this->getJson("/api/documents/generated?target=property:{$property->id}")->assertOk()->json('data'), 'download_path');
        sort($paths);

        return $paths;
    }

    public function test_ac1_the_blocked_landlord_finds_his_properties_read_only_with_the_generated_entries_of_the_endpoint(): void
    {
        // Témoin : actif, ses dossiers ne sont pas en lecture seule.
        $this->connecter($this->landlord, $this->ownerProfile);
        $actif = $this->coffre();
        $this->assertFalse($this->dossier($actif, $this->property)['read_only']);
        foreach ($actif['folders'] as $folder) {
            $this->assertArrayHasKey('read_only', $folder, "une seule forme : {$folder['key']}");
        }

        $this->bloquer();
        $this->connecter($this->landlord);
        $vault = $this->coffre();

        $this->assertSame(["property:{$this->otherProperty->id}", "property:{$this->property->id}", 'pieces'], array_column($vault['folders'], 'key'));
        foreach ([$this->property, $this->otherProperty] as $property) {
            $folder = $this->dossier($vault, $property);
            $this->assertTrue($folder['read_only']);
            $this->assertNotSame([], $this->generesDuDossier($folder));
            $this->assertSame($this->generesDeLEndpoint($property), $this->generesDuDossier($folder));
        }
        $this->assertFalse(collect($vault['folders'])->firstWhere('key', 'pieces')['read_only']);

        $villa = $this->dossier($vault, $this->property);
        $this->assertContains("/api/leases/{$this->lease->id}/contract/pdf", array_column($villa['entries'], 'download_path'));
        $this->assertContains("/api/inventories/{$this->signedInventory->id}/pdf", array_column($villa['entries'], 'download_path'));
        $this->assertEqualsCanonicalizing(
            [$this->adminDocOnLease->id, $this->adminDocOnProperty->id],
            array_values(array_filter(array_column($villa['entries'], 'document_id'))),
        );
    }

    public function test_ac2_every_entry_opens_and_no_statement_nor_attachable_target_is_offered(): void
    {
        app(OwnerStatementSnapshots::class)->record($this->agency, $this->landlord, '2025-12', now());
        // Versant actif : le relevé envoyé et les cibles où joindre existent.
        $this->connecter($this->landlord, $this->ownerProfile);
        $actif = $this->coffre();
        $this->assertContains('statements', array_column($actif['folders'], 'key'));
        $this->assertContains(['type' => 'property', 'id' => $this->property->id], array_map(fn ($t) => ['type' => $t['type'], 'id' => $t['id']], $actif['attachable_targets']));

        $this->bloquer();
        $this->connecter($this->landlord);
        $vault = $this->coffre();

        $this->assertNotContains('statements', array_column($vault['folders'], 'key'));
        $this->assertSame([['type' => 'user', 'id' => $this->landlord->id, 'folder' => 'pieces', 'name' => null]], $vault['attachable_targets']);

        $paths = array_merge(
            array_column($this->dossier($vault, $this->property)['entries'], 'download_path'),
            array_column($this->dossier($vault, $this->otherProperty)['entries'], 'download_path'),
        );
        $this->assertNotEmpty($paths);
        foreach ($paths as $path) {
            $this->get($path)->assertOk();
        }
    }

    public function test_ac3_what_view_refuses_on_his_property_stays_out(): void
    {
        // Un ancien bail du bien, d'un AUTRE bailleur : `view` le refuse au bloqué, comme ses pièces.
        $previous = User::factory()->create();
        $foreign = $this->leaseFor(User::factory()->create(), $this->property, LeaseStatus::Expired);
        $foreign->update(['landlord_id' => $previous->id]);
        $foreignDoc = $this->document($foreign, $this->admin, DocumentType::Other, 'Pièce de l’ancien bailleur');
        $foreignInventory = Inventory::factory()->signed()->create(['lease_id' => $foreign->id, 'property_id' => $this->property->id, 'tenant_id' => $foreign->tenant_id, 'conducted_by' => $this->admin->id]);

        $this->bloquer();
        $this->connecter($this->landlord);
        $this->get("/api/documents/{$foreignDoc->id}")->assertForbidden();
        $villa = $this->dossier($this->coffre(), $this->property);

        $paths = array_column($villa['entries'], 'download_path');
        $this->assertNotContains($foreignDoc->id, array_column($villa['entries'], 'document_id'));
        $this->assertNotContains("/api/leases/{$foreign->id}/contract/pdf", $paths);
        $this->assertNotContains("/api/inventories/{$foreignInventory->id}/pdf", $paths);
        // Ce qu'il lit reste.
        $this->assertContains($this->adminDocOnProperty->id, array_column($villa['entries'], 'document_id'));
    }

    public function test_ac4_the_reactivated_profile_gets_its_normal_folder_back(): void
    {
        $this->bloquer();
        $this->connecter($this->landlord);
        $this->assertTrue($this->dossier($this->coffre(), $this->property)['read_only']);

        $this->ownerProfile->update(['status' => OwnerProfileStatus::Active]);
        $this->connecter($this->landlord, $this->ownerProfile);
        $vault = $this->coffre();

        $this->assertFalse($this->dossier($vault, $this->property)['read_only']);
        $this->assertSame(1, collect($vault['folders'])->where('key', "property:{$this->property->id}")->count());
        $this->assertContains(['type' => 'property', 'id' => $this->property->id], array_map(fn ($t) => ['type' => $t['type'], 'id' => $t['id']], $vault['attachable_targets']));
    }

    public function test_ac5_the_query_count_does_not_depend_on_the_number_of_blocked_properties(): void
    {
        $this->bloquer();
        $this->connecter($this->landlord);
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
        $this->assertCount(10, array_filter($vault['folders'], fn (array $f) => $f['kind'] === 'property' && $f['read_only'] === true));
        $this->assertCount(1 + 16, array_filter($this->entrees($vault), fn (array $e) => str_starts_with($e['category'], 'inventory_')));
        $this->assertSame($two, $this->requetes(fn () => $this->coffre()));
    }

    /**
     * AC5 sous un profil actif d'une AUTRE agence (agent de A) : les agences amorcées sont alors
     * celle du profil actif PLUS celles des profils bloqués ; sans elles, chaque bien figé coûterait
     * ses propres requêtes de verdict.
     */
    public function test_ac5_under_an_active_profile_elsewhere_the_blocked_agencies_are_primed(): void
    {
        $elsewhere = Agency::factory()->create();
        $agentProfile = AgentProfile::query()->create(['user_id' => $this->landlord->id, 'agency_id' => $elsewhere->id]);
        $this->bloquer();
        $this->connecter($this->landlord, $agentProfile);
        $this->coffre();
        $two = $this->requetes(fn () => $this->coffre());

        foreach (range(1, 8) as $i) {
            $property = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->landlord->id]);
            $lease = $this->leaseFor(User::factory()->create(), $property, LeaseStatus::Active);
            $this->document($property, $this->admin, DocumentType::Other, "Bien {$i}");
            Inventory::factory()->signed()->moveOut()->create(['lease_id' => $lease->id, 'property_id' => $property->id, 'tenant_id' => $lease->tenant_id, 'conducted_by' => $this->landlord->id]);
        }

        $vault = $this->coffre();
        $this->assertCount(10, array_filter($vault['folders'], fn (array $f) => $f['kind'] === 'property' && $f['read_only'] === true));
        $this->assertSame($two, $this->requetes(fn () => $this->coffre()));
    }

    /**
     * Fuites (décision de team-lead du 2026-11-13) : un autre bailleur actif de l'agence, le personnel
     * d'une AUTRE agence et le locataire du bail ne voient jamais les dossiers figés du bloqué.
     */
    public function test_no_one_else_sees_the_frozen_folders(): void
    {
        $this->bloquer();
        $frozen = ["property:{$this->property->id}", "property:{$this->otherProperty->id}"];

        $voisin = User::factory()->create();
        $voisinProfil = OwnerProfile::query()->create(['user_id' => $voisin->id, 'agency_id' => $this->agency->id]);
        $ailleurs = Agency::factory()->create();
        $adminAilleurs = User::factory()->create();
        $adminAilleursProfil = AgencyAdminProfile::query()->create(['user_id' => $adminAilleurs->id, 'agency_id' => $ailleurs->id]);

        foreach ([
            'autre bailleur de l’agence' => [$voisin, $voisinProfil],
            'admin d’une autre agence' => [$adminAilleurs, $adminAilleursProfil],
            'locataire du bail' => [$this->tenant, null],
        ] as $qui => [$user, $profil]) {
            $this->connecter($user, $profil);
            $vault = $this->coffre();
            $keys = array_column($vault['folders'], 'key');
            foreach ($frozen as $key) {
                $this->assertNotContains($key, $keys, $qui);
            }
            $this->assertSame([], array_values(array_filter($vault['folders'], fn (array $f) => $f['read_only'])), $qui);
        }

        // Le locataire garde son bail, lui : le décor n'est pas vide.
        $this->connecter($this->tenant);
        $this->assertContains("lease:{$this->lease->id}", array_column($this->coffre()['folders'], 'key'));
    }

    /**
     * Le gel est tenu par l'API, pas seulement masqué à l'écran (décision de team-lead du 2026-11-13) :
     * sur un dossier figé, le bloqué n'ajoute ni document (bien ou bail), ni version, ne partage ni ne
     * supprime — même SA pièce, téléversée quand il était actif. Il n'existe pas de route de
     * renommage. Témoin : les mêmes gestes passent tant que le profil est actif.
     */
    public function test_nothing_is_written_into_a_frozen_folder(): void
    {
        $televerser = fn (string $type, int $id, string $nom) => $this->post('/api/documents', [
            'documentable_type' => $type, 'documentable_id' => $id, 'name' => $nom,
            'type' => DocumentType::Other->value, 'file' => UploadedFile::fake()->create("{$nom}.pdf", 20, 'application/pdf'),
        ], ['Accept' => 'application/json']);

        $this->connecter($this->landlord, $this->ownerProfile);
        $sienne = $televerser('property', $this->property->id, 'titre')->assertCreated()->json('data.id');
        $temoin = $televerser('property', $this->property->id, 'temoin')->assertCreated()->json('data.id');
        $this->postJson("/api/documents/{$temoin}/share", [])->assertCreated();
        $this->deleteJson("/api/documents/{$temoin}")->assertSuccessful();

        $this->bloquer();
        $this->connecter($this->landlord);
        $avant = Document::query()->count();
        $this->assertTrue($this->dossier($this->coffre(), $this->property)['read_only']);
        $this->assertContains($sienne, array_column($this->dossier($this->coffre(), $this->property)['entries'], 'document_id'));

        $televerser('property', $this->property->id, 'apres')->assertNotFound();
        $televerser('lease', $this->lease->id, 'apres-bail')->assertNotFound();
        $this->postJson("/api/documents/{$sienne}/share", [])->assertForbidden();
        $this->post("/api/documents/{$sienne}/versions", ['file' => UploadedFile::fake()->create('v2.pdf', 20, 'application/pdf')], ['Accept' => 'application/json'])->assertForbidden();
        $this->deleteJson("/api/documents/{$sienne}")->assertForbidden();
        $this->deleteJson("/api/documents/{$this->adminDocOnProperty->id}")->assertForbidden();
        $this->postJson("/api/documents/{$sienne}/verify")->assertForbidden();

        $this->assertSame($avant, Document::query()->count());
        $this->assertSame(0, Document::query()->findOrFail($sienne)->shareLinks()->count());
    }

    public function test_the_departed_landlord_has_no_such_surface(): void
    {
        $this->ownerProfile->update(['status' => OwnerProfileStatus::Inactive]);
        $this->connecter($this->landlord);

        $this->assertSame(['pieces'], array_column($this->coffre()['folders'], 'key'));
    }

    /**
     * Un compte qui a d'autres profils : agent actif d'une agence A, bailleur bloqué de l'agence du
     * décor. Le dossier figé suit le compte, quel que soit le profil actif ; rien de l'agence A ne
     * s'y ajoute.
     */
    public function test_the_frozen_folders_follow_the_account_whatever_the_active_profile(): void
    {
        $elsewhere = Agency::factory()->create();
        $agentProfile = AgentProfile::query()->create(['user_id' => $this->landlord->id, 'agency_id' => $elsewhere->id]);
        $this->bloquer();

        $this->connecter($this->landlord, $agentProfile);
        $vault = $this->coffre();

        $this->assertTrue($this->dossier($vault, $this->property)['read_only']);
        $this->assertTrue($this->dossier($vault, $this->otherProperty)['read_only']);
        $this->assertSame([['type' => 'user', 'id' => $this->landlord->id, 'folder' => 'pieces', 'name' => null]], $vault['attachable_targets']);
    }

    /** Actif dans une agence, bloqué dans une autre : ses biens actifs normaux, les autres figés. */
    public function test_active_here_blocked_there(): void
    {
        $second = Agency::factory()->create();
        $activeProfile = OwnerProfile::query()->create(['user_id' => $this->landlord->id, 'agency_id' => $second->id]);
        $active = Property::factory()->create(['agency_id' => $second->id, 'user_id' => $this->landlord->id, 'title' => 'Maison Ngor']);
        $this->bloquer();

        $this->connecter($this->landlord, $activeProfile);
        $vault = $this->coffre();

        $this->assertFalse($this->dossier($vault, $active)['read_only']);
        $this->assertTrue($this->dossier($vault, $this->property)['read_only']);
        $attachable = array_map(fn ($t) => $t['type'].':'.$t['id'], $vault['attachable_targets']);
        $this->assertContains("property:{$active->id}", $attachable);
        $this->assertNotContains("property:{$this->property->id}", $attachable);
    }

    /** Un autre bailleur bloqué de la même agence ne voit rien des biens du bailleur. */
    public function test_another_blocked_landlord_of_the_agency_reads_none_of_it(): void
    {
        $stranger = User::factory()->create();
        OwnerProfile::query()->create(['user_id' => $stranger->id, 'agency_id' => $this->agency->id, 'status' => OwnerProfileStatus::Blocked]);

        $this->connecter($stranger);
        $vault = $this->coffre();

        $this->assertSame(['pieces'], array_column($vault['folders'], 'key'));
        $this->assertSame([], $this->entrees($vault));
    }
}
