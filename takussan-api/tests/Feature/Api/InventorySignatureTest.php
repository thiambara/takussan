<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Enums\InventoryStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-076 — role-explicit signature workflow + PDF export.
 */
class InventorySignatureTest extends TestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    // Two distinct, valid 1×1 PNGs — used so re-signing or both-party-signing
    // tests never rely on string concatenation (which would break base64 and
    // trip the new data-URL validator introduced in the TCK-076 hardening).
    private const SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAvMBAOeufn4AAAAASUVORK5CYII=';

    private const SIGNATURE_ALT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEX/AAAZ4gk3AAAACXBIWXMAAA7EAAAOxAGVKw4bAAAACklEQVQImWNgAAAAAgAB9HFkpgAAAABJRU5ErkJggg==';

    public function test_tenant_can_sign_as_tenant_role(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = $this->makeInventory($property, $tenant, $owner, $lease);

        Sanctum::actingAs($tenantUser);

        $response = $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'tenant',
            'signature' => self::SIGNATURE,
        ])->assertOk();

        $response->assertJsonPath('data.tenant_signed', true);
        $response->assertJsonPath('data.owner_signed', false);
        // The raw payload must NEVER come back in the API response — only
        // the hash is exposed.
        $response->assertJsonMissingPath('data.tenant_signature_data');
        $this->assertSame(
            hash('sha256', self::SIGNATURE),
            $response->json('data.tenant_signature_hash'),
        );
    }

    public function test_property_owner_can_sign_as_landlord(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = $this->makeInventory($property, $tenant, $owner, $lease);

        Sanctum::actingAs($owner);

        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            'signature' => self::SIGNATURE,
        ])->assertOk()
            ->assertJsonPath('data.owner_signed', true)
            ->assertJsonPath('data.tenant_signed', false);
    }

    public function test_both_signatures_flip_status_to_signed_and_stamp_signed_at(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = $this->makeInventory($property, $tenant, $owner, $lease);

        Sanctum::actingAs($owner);
        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            'signature' => self::SIGNATURE,
        ])->assertOk();

        Sanctum::actingAs($tenantUser);
        $res = $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'tenant',
            'signature' => self::SIGNATURE_ALT,
        ])->assertOk();

        $res->assertJsonPath('data.status', InventoryStatus::Signed->value);
        $this->assertNotNull($res->json('data.signed_at'));
    }

    public function test_tenant_cannot_sign_as_landlord(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = $this->makeInventory($property, $tenant, $owner, $lease);

        Sanctum::actingAs($tenantUser);

        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            'signature' => self::SIGNATURE,
        ])->assertForbidden();
    }

    public function test_stranger_receives_403(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = $this->makeInventory($property, $tenant, $owner, $lease);

        Sanctum::actingAs(User::factory()->create());

        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'tenant',
            'signature' => self::SIGNATURE,
        ])->assertForbidden();

        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            'signature' => self::SIGNATURE,
        ])->assertForbidden();
    }

    public function test_signing_twice_same_role_returns_409(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = $this->makeInventory($property, $tenant, $owner, $lease);

        Sanctum::actingAs($owner);

        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            'signature' => self::SIGNATURE,
        ])->assertOk();

        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            'signature' => self::SIGNATURE_ALT,
        ])->assertStatus(409);
    }

    public function test_pdf_requires_fully_signed_inventory(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = $this->makeInventory($property, $tenant, $owner, $lease);

        Sanctum::actingAs($owner);
        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            'signature' => self::SIGNATURE,
        ])->assertOk();

        // Only the landlord has signed — PDF must be blocked (409).
        $this->getJson("/api/inventories/{$inventory->id}/pdf")
            ->assertStatus(409);
    }

    public function test_pdf_is_served_after_both_parties_sign(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = $this->makeInventory($property, $tenant, $owner, $lease);

        Sanctum::actingAs($owner);
        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            'signature' => self::SIGNATURE,
        ])->assertOk();

        Sanctum::actingAs($tenantUser);
        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'tenant',
            'signature' => self::SIGNATURE,
        ])->assertOk();

        $response = $this->get("/api/inventories/{$inventory->id}/pdf");
        $response->assertOk();
        $response->assertHeader('Content-Type', 'application/pdf');
        $body = $response->getContent();
        $this->assertTrue(str_starts_with($body, '%PDF-'), 'Response should be a real PDF binary.');
    }

    public function test_pdf_stranger_gets_403(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = Inventory::factory()->signed()->create([
            'property_id' => $property->id,
            'lease_id' => $lease->id,
            'tenant_id' => $tenant->id,
            'conducted_by' => $owner->id,
        ]);

        Sanctum::actingAs(User::factory()->create());

        $this->get("/api/inventories/{$inventory->id}/pdf")->assertForbidden();
    }

    public function test_signed_inventory_patch_returns_409(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = Inventory::factory()->signed()->create([
            'property_id' => $property->id,
            'lease_id' => $lease->id,
            'tenant_id' => $tenant->id,
            'conducted_by' => $owner->id,
        ]);

        Sanctum::actingAs($owner);

        $this->patchJson("/api/inventories/{$inventory->id}", [
            'notes' => 'late-night edit',
        ])->assertStatus(409);
    }

    public function test_missing_signature_payload_returns_422(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = $this->makeInventory($property, $tenant, $owner, $lease);

        Sanctum::actingAs($owner);

        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            // missing signature
        ])->assertStatus(422);

        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'signature' => self::SIGNATURE,
            // missing role
        ])->assertStatus(422);

        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'bogus',
            'signature' => self::SIGNATURE,
        ])->assertStatus(422);
    }

    public function test_pdf_rejects_unsigned_inventory_with_409(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = $this->makeInventory($property, $tenant, $owner, $lease);

        Sanctum::actingAs($owner);

        $this->get("/api/inventories/{$inventory->id}/pdf")
            ->assertStatus(409);
    }

    /**
     * TCK-076 — the signature endpoint MUST reject anything that isn't a
     * valid PNG data URL. Before this hardening, the server accepted any
     * string up to 2 MB, which the PDF pipeline would then embed as
     * `<img src="...">` — opening an LFI/SSRF/tracking vector through dompdf
     * even with remote resources disabled (local file:// paths remain).
     */
    #[DataProvider('invalidSignaturePayloads')]
    public function test_signature_payload_must_be_a_png_data_url(string $badPayload): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = $this->makeInventory($property, $tenant, $owner, $lease);

        Sanctum::actingAs($owner);

        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            'signature' => $badPayload,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['signature']);
    }

    public static function invalidSignaturePayloads(): array
    {
        return [
            'plain string' => ['hello world'],
            'svg data url' => ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
            'jpeg data url' => ['data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/'],
            'file scheme' => ['file:///etc/passwd'],
            'http scheme' => ['http://attacker.example/tracker.gif'],
            'https scheme' => ['https://attacker.example/tracker.gif'],
            'javascript scheme' => ['javascript:alert(1)'],
            'broken base64' => ['data:image/png;base64,!!!not-base64!!!'],
            'empty base64' => ['data:image/png;base64,'],
            'valid base64 but too short' => ['data:image/png;base64,'.base64_encode('too-short')],
            'valid base64 but not a PNG' => ['data:image/png;base64,'.base64_encode(str_repeat('A', 200))],
        ];
    }

    public function test_signature_payload_size_is_capped(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = $this->makeInventory($property, $tenant, $owner, $lease);

        Sanctum::actingAs($owner);

        // Forge a string past the 2 MB cap — should hit the `max:` rule
        // before anything else (including the data-URL prefix check).
        $oversized = 'data:image/png;base64,'.str_repeat('A', 2 * 1024 * 1024 + 100);

        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            'signature' => $oversized,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['signature']);
    }

    // ── TCK-596 §5 — personne ne signe pour une autre partie ─────────────────────────────────

    /** AC20 — plus de chemin sans charge utile : 422, et rien n'est marqué signé. */
    public function test_sign_without_body_returns_422_and_changes_nothing(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = $this->makeInventory($property, $tenant, $owner, $lease);

        Sanctum::actingAs($owner);
        $this->postJson("/api/inventories/{$inventory->id}/sign")
            ->assertStatus(422)
            ->assertJsonValidationErrors(['role', 'signature']);

        $inventory->refresh();
        $this->assertFalse($inventory->owner_signed);
        $this->assertFalse($inventory->tenant_signed);
        $this->assertSame(InventoryStatus::PendingSignature, $inventory->status);
    }

    /** AC20 — le super-admin ne signe pas comme locataire (il le pouvait, l.101 de l'ancien code). */
    public function test_super_admin_cannot_sign_as_tenant(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = $this->makeInventory($property, $tenant, $owner, $lease);

        $this->actingAsRole('super_admin');
        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'tenant',
            'signature' => self::SIGNATURE,
        ])->assertForbidden();

        $this->assertFalse($inventory->refresh()->tenant_signed);
    }

    /** AC23 — ni comme bailleur : `Gate::before` ne passe pas, le service juge sans la Gate. */
    public function test_super_admin_cannot_sign_as_landlord(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = $this->makeInventory($property, $tenant, $owner, $lease);

        $this->actingAsRole('super_admin');
        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            'signature' => self::SIGNATURE,
        ])->assertForbidden();

        $this->assertFalse($inventory->refresh()->owner_signed);
    }

    /** AC20 — un autre bailleur de la même agence (`OwnerProfile`) ne signe pas pour le bailleur. */
    public function test_other_landlord_of_the_same_agency_cannot_sign_as_landlord(): void
    {
        $agency = Agency::factory()->create();
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease($agency);
        $inventory = $this->makeInventory($property, $tenant, $owner, $lease);
        $otherLandlord = User::factory()->withOwnerProfile($agency)->create();

        Sanctum::actingAs($otherLandlord);
        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            'signature' => self::SIGNATURE,
        ])->assertForbidden();

        $this->assertFalse($inventory->refresh()->owner_signed);
    }

    /**
     * AC23 — un collaborateur accepté du bien, sans autre lien, n'engage pas le bailleur : ni
     * `viewer` ni `co_owner` (ni aucun rôle de collaborateur).
     */
    #[DataProvider('collaboratorRoles')]
    public function test_property_collaborator_cannot_sign_as_landlord(string $role): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease(Agency::factory()->create());
        $inventory = $this->makeInventory($property, $tenant, $owner, $lease);
        $collaborator = User::factory()->create();
        $property->collaborators()->create([
            'user_id' => $collaborator->id,
            'role' => $role,
            'accepted_at' => now(),
        ]);

        Sanctum::actingAs($collaborator);
        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            'signature' => self::SIGNATURE,
        ])->assertForbidden();

        $this->assertFalse($inventory->refresh()->owner_signed);
    }

    public static function collaboratorRoles(): array
    {
        return [
            'viewer' => ['viewer'],
            'co_owner' => ['co_owner'],
            'manager' => ['manager'],
            'agent' => ['agent'],
        ];
    }

    /** AC11/AC23 — l'agent de l'agence du bail SANS `leases.sign` ne signe pas pour le bailleur. */
    public function test_agency_agent_without_leases_sign_cannot_sign_as_landlord(): void
    {
        $agency = Agency::factory()->create();
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease($agency);
        $inventory = $this->makeInventory($property, $tenant, $owner, $lease);

        Sanctum::actingAs($this->agentWithout($agency, Capability::LeasesSign));
        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            'signature' => self::SIGNATURE,
        ])->assertForbidden();

        $this->assertFalse($inventory->refresh()->owner_signed);
    }

    /** AC23 — AVEC `leases.sign`, il signe POUR LE COMPTE du bailleur, et la preuve le dit. */
    public function test_agency_agent_with_leases_sign_signs_on_behalf_of_the_landlord(): void
    {
        $agency = Agency::factory()->create();
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease($agency);
        $inventory = $this->makeInventory($property, $tenant, $owner, $lease);
        $agent = $this->agencyAgent($agency);

        Sanctum::actingAs($agent);
        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            'signature' => self::SIGNATURE,
        ])->assertOk()
            ->assertJsonPath('data.owner_signed', true)
            ->assertJsonPath('data.owner_signed_by_user_id', $agent->id)
            ->assertJsonPath('data.owner_signed_on_behalf_of_user_id', $owner->id);
    }

    /** AC23 — le bailleur du bail signe pour lui-même : `on_behalf_of` nul. */
    public function test_landlord_signs_for_himself_without_on_behalf_of(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease(Agency::factory()->create());
        $inventory = $this->makeInventory($property, $tenant, $owner, $lease);

        Sanctum::actingAs($owner);
        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            'signature' => self::SIGNATURE,
        ])->assertOk()
            ->assertJsonPath('data.owner_signed_by_user_id', $owner->id)
            ->assertJsonPath('data.owner_signed_on_behalf_of_user_id', null);
    }

    /** Le PDF imprime « Signé par X pour le compte de Y » quand le personnel a signé pour le bailleur. */
    public function test_pdf_prints_who_signed_on_behalf_of_the_landlord(): void
    {
        $agency = Agency::factory()->create();
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease($agency);
        $inventory = $this->makeInventory($property, $tenant, $owner, $lease);
        $agent = $this->agencyAgent($agency);

        Sanctum::actingAs($agent);
        $this->postJson("/api/inventories/{$inventory->id}/sign", ['role' => 'landlord', 'signature' => self::SIGNATURE])->assertOk();
        Sanctum::actingAs($tenantUser);
        $this->postJson("/api/inventories/{$inventory->id}/sign", ['role' => 'tenant', 'signature' => self::SIGNATURE_ALT])->assertOk();

        $captured = null;
        $this->mock(DocumentPdfService::class, function ($mock) use (&$captured) {
            $mock->shouldReceive('stream')->once()->andReturnUsing(function (string $template, array $data) use (&$captured) {
                $captured = view($template, $data)->render();

                return response('%PDF-1.4');
            });
        });

        $this->get("/api/inventories/{$inventory->id}/pdf")->assertOk();

        $expected = __('inventories.pdf.signed_on_behalf_of', [
            'signer' => $agent->getFullNameAttribute(),
            'landlord' => $owner->getFullNameAttribute(),
        ]);
        $this->assertStringContainsString(e($expected), (string) $captured);
        $this->assertStringContainsString((string) $inventory->refresh()->traceability_hash, (string) $captured);
    }

    /** Un bailleur suspendu dans l'agence du bail perd les écritures (ADR-0031 §2), signature comprise. */
    public function test_blocked_landlord_cannot_sign_as_landlord(): void
    {
        $agency = Agency::factory()->create();
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease($agency);
        $inventory = $this->makeInventory($property, $tenant, $owner, $lease);
        OwnerProfile::query()->where('user_id', $owner->id)->where('agency_id', $agency->id)
            ->update(['status' => OwnerProfileStatus::Blocked->value]);

        Sanctum::actingAs($owner);
        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            'signature' => self::SIGNATURE,
        ])->assertForbidden();
    }

    /** `can_sign_as` (show) suit le même prédicat : le canevas s'ouvre à qui l'API laisse signer. */
    public function test_show_exposes_can_sign_as_for_the_viewer(): void
    {
        $agency = Agency::factory()->create();
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease($agency);
        $inventory = $this->makeInventory($property, $tenant, $owner, $lease);

        Sanctum::actingAs($tenantUser);
        $this->getJson("/api/inventories/{$inventory->id}")->assertOk()->assertJsonPath('data.can_sign_as', ['tenant']);

        Sanctum::actingAs($owner);
        $this->getJson("/api/inventories/{$inventory->id}")->assertOk()->assertJsonPath('data.can_sign_as', ['landlord']);

        $this->actingAsRole('super_admin');
        $this->getJson("/api/inventories/{$inventory->id}")->assertOk()->assertJsonPath('data.can_sign_as', []);

        $this->getJson('/api/inventories')->assertOk()->assertJsonMissingPath('data.0.can_sign_as');
    }

    /**
     * @return array{0: User, 1: User, 2: Customer, 3: Property, 4: Lease}
     */
    private function scaffoldLease(?Agency $agency = null): array
    {
        $owner = $agency !== null ? User::factory()->withOwnerProfile($agency)->create() : User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id, 'agency_id' => $agency?->id]);
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $owner->id,
            'tenant_id' => $tenant->id,
            'agency_id' => $agency?->id,
        ]);

        return [$owner, $tenantUser, $tenant, $property, $lease];
    }

    /**
     * TCK-596 — l'état des lieux porte le bail de `scaffoldLease` : sans lui, la fabrique crée un
     * autre bail (`InventoryFactory`) dont le bailleur n'est pas `$owner`, et les signatures
     * « bailleur » rougiraient pour une raison de fixture, pas de règle.
     */
    private function makeInventory(Property $property, Customer $tenant, User $owner, Lease $lease): Inventory
    {
        return Inventory::factory()->pendingSignature()->create([
            'lease_id' => $lease->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'conducted_by' => $owner->id,
        ]);
    }
}
