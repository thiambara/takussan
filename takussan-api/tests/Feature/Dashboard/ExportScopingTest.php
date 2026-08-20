<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-285 — `ExportDataService::scopeToActor()` balayé PAR ACTEUR.
 *
 * `GET /api/export/{entity}` déverse des lignes brutes — montants, noms,
 * e-mails, téléphones — dans un fichier que l'appelant emporte. Le seul point
 * qui décide de ce qu'il emporte est `scopeToActor()`, mesuré le 2026-08-15
 * à 14 de ses 31 lignes : les branches propriétaire, locataire et « aucun
 * profil » n'étaient jamais exécutées, et `customers()` était à 0/21.
 * `ExportControllerTest` n'éprouve qu'un seul acteur — l'admin d'agence.
 *
 * Chaque agence porte un montant-marqueur : le voir apparaître dans l'export
 * d'un autre acteur, c'est la fuite elle-même, lisible dans le CSV.
 */
class ExportScopingTest extends ApiTestCase
{
    use RefreshDatabase;

    private const AMOUNT_A = 111111;      // agence A, bail du propriétaire A

    private const AMOUNT_A_OTHER = 444444; // agence A, bail d'un AUTRE propriétaire

    private const AMOUNT_B = 222222;      // agence B

    private Agency $agencyA;

    private Agency $agencyB;

    private User $ownerA;

    private Customer $tenantA;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agencyA = Agency::factory()->create();
        $this->agencyB = Agency::factory()->create();

        $this->ownerA = User::factory()->create(['agency_id' => $this->agencyA->id]);
        $this->tenantA = Customer::factory()->create(['agency_id' => $this->agencyA->id]);

        // Agence A — un bail du propriétaire A, payé par le locataire A.
        $leaseA = Lease::factory()->active()->create([
            'agency_id' => $this->agencyA->id,
            'landlord_id' => $this->ownerA->id,
            'tenant_id' => $this->tenantA->id,
            'property_id' => Property::factory()->create([
                'agency_id' => $this->agencyA->id,
                'user_id' => $this->ownerA->id,
            ])->id,
        ]);
        $this->payment($leaseA, $this->tenantA, self::AMOUNT_A);

        // Agence A — un bail d'un AUTRE propriétaire, payé par un AUTRE
        // locataire. C'est le témoin qui distingue « voit son agence » de
        // « voit ses propres biens » : sans lui, les deux se confondent.
        $otherOwnerA = User::factory()->create(['agency_id' => $this->agencyA->id]);
        $otherTenantA = Customer::factory()->create(['agency_id' => $this->agencyA->id]);
        $leaseAOther = Lease::factory()->active()->create([
            'agency_id' => $this->agencyA->id,
            'landlord_id' => $otherOwnerA->id,
            'tenant_id' => $otherTenantA->id,
            'property_id' => Property::factory()->create([
                'agency_id' => $this->agencyA->id,
                'user_id' => $otherOwnerA->id,
            ])->id,
        ]);
        $this->payment($leaseAOther, $otherTenantA, self::AMOUNT_A_OTHER);

        // Agence B — l'autre tenant.
        $leaseB = Lease::factory()->active()->create([
            'agency_id' => $this->agencyB->id,
            'property_id' => Property::factory()->create(['agency_id' => $this->agencyB->id])->id,
        ]);
        $this->payment($leaseB, Customer::factory()->create(['agency_id' => $this->agencyB->id]), self::AMOUNT_B);
    }

    // ─── Super-admin : tout ──────────────────────────────────────

    public function test_a_super_admin_exports_every_agency(): void
    {
        $this->apiActingAsRole('super_admin');

        $body = $this->export('payments');
        $this->assertStringContainsString((string) self::AMOUNT_A, $body);
        $this->assertStringContainsString((string) self::AMOUNT_B, $body);
    }

    // ─── Staff d'agence : son agence, toute son agence ───────────

    public function test_an_agency_admin_exports_his_agency_and_only_his_agency(): void
    {
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agencyA]);

        $payments = $this->export('payments');
        $this->assertStringContainsString((string) self::AMOUNT_A, $payments);
        $this->assertStringContainsString((string) self::AMOUNT_A_OTHER, $payments);
        $this->assertStringNotContainsString((string) self::AMOUNT_B, $payments);
    }

    public function test_an_agent_exports_his_agency_and_only_his_agency(): void
    {
        $this->apiActingAsRole('agent', ['agency' => $this->agencyA]);

        $payments = $this->export('payments');
        $this->assertStringContainsString((string) self::AMOUNT_A, $payments);
        $this->assertStringNotContainsString((string) self::AMOUNT_B, $payments);

        $customers = $this->export('customers');
        $this->assertStringContainsString($this->tenantA->email, $customers);
    }

    public function test_agency_staff_never_export_the_customers_of_another_agency(): void
    {
        $foreign = Customer::factory()->create([
            'agency_id' => $this->agencyB->id,
            'email' => 'cible@agence-b.test',
        ]);

        $this->apiActingAsRole('agency_admin', ['agency' => $this->agencyA]);

        $customers = $this->export('customers');
        $this->assertStringContainsString($this->tenantA->email, $customers);
        $this->assertStringNotContainsString($foreign->email, $customers);
    }

    public function test_agency_staff_never_export_the_properties_of_another_agency(): void
    {
        $foreign = Property::factory()->create([
            'agency_id' => $this->agencyB->id,
            'reference_number' => 'PROP-CIBLE-B',
        ]);

        $this->apiActingAsRole('agency_admin', ['agency' => $this->agencyA]);

        $properties = $this->export('properties');
        $this->assertStringNotContainsString($foreign->reference_number, $properties);
    }

    // ─── Propriétaire : ses biens, pas ceux de ses confrères ─────

    public function test_an_owner_exports_only_his_own_leases_and_payments(): void
    {
        $this->actingAs($this->ownerA, 'sanctum');
        $this->materializeRoleProfile($this->ownerA, 'owner', $this->agencyA);

        // Même agence, mais un autre bailleur : le propriétaire ne doit pas
        // voir les loyers de son confrère.
        $payments = $this->export('payments');
        $this->assertStringContainsString((string) self::AMOUNT_A, $payments);
        $this->assertStringNotContainsString((string) self::AMOUNT_A_OTHER, $payments);
        $this->assertStringNotContainsString((string) self::AMOUNT_B, $payments);
    }

    public function test_an_owner_exports_only_his_own_properties(): void
    {
        $this->actingAs($this->ownerA, 'sanctum');
        $this->materializeRoleProfile($this->ownerA, 'owner', $this->agencyA);

        $mine = Property::factory()->create([
            'agency_id' => $this->agencyA->id,
            'user_id' => $this->ownerA->id,
            'reference_number' => 'PROP-A-MIENNE',
        ]);
        $confrere = Property::factory()->create([
            'agency_id' => $this->agencyA->id,
            'reference_number' => 'PROP-A-CONFRERE',
        ]);

        $properties = $this->export('properties');
        $this->assertStringContainsString($mine->reference_number, $properties);
        $this->assertStringNotContainsString($confrere->reference_number, $properties);
    }

    public function test_an_owner_is_refused_the_crm_export(): void
    {
        // Le CRM est la propriété de l'agence, pas du bailleur. Le refus vient
        // du CONTRÔLEUR (`$isStaff` faux → 403) — la branche `'customer' =>
        // whereRaw('1 = 0')` de `scopeToActor` pour les propriétaires est donc
        // inatteignable par HTTP, et reste morte par construction.
        $this->actingAs($this->ownerA, 'sanctum');
        $this->materializeRoleProfile($this->ownerA, 'owner', $this->agencyA);

        $this->apiGet('/api/export/customers?format=csv')->assertForbidden();
    }

    // ─── Locataire : ses paiements, rien d'autre ─────────────────

    public function test_a_tenant_exports_only_his_own_payments(): void
    {
        $tenantUser = User::factory()->create();
        $this->tenantA->update(['user_id' => $tenantUser->id]);
        $this->actingAs($tenantUser, 'sanctum');

        $payments = $this->export('payments');
        $this->assertStringContainsString((string) self::AMOUNT_A, $payments);
        $this->assertStringNotContainsString((string) self::AMOUNT_A_OTHER, $payments);
        $this->assertStringNotContainsString((string) self::AMOUNT_B, $payments);
    }

    public function test_a_tenant_exports_only_his_own_leases(): void
    {
        $tenantUser = User::factory()->create();
        $this->tenantA->update(['user_id' => $tenantUser->id]);
        $this->actingAs($tenantUser, 'sanctum');

        $leases = $this->export('leases');
        $lines = $this->dataLines($leases);
        $this->assertCount(1, $lines, 'Un locataire ne doit exporter que SON bail.');
    }

    public function test_a_tenant_is_refused_the_crm_and_properties_exports(): void
    {
        $tenantUser = User::factory()->create();
        $this->tenantA->update(['user_id' => $tenantUser->id]);
        $this->actingAs($tenantUser, 'sanctum');

        $this->apiGet('/api/export/customers?format=csv')->assertForbidden();
        $this->apiGet('/api/export/properties?format=csv')->assertForbidden();
    }

    // ─── Aucun profil : rien du tout ─────────────────────────────

    public function test_a_user_without_any_profile_exports_zero_rows(): void
    {
        // Le défaut fail-closed de `scopeToActor` : ni super-admin, ni staff,
        // ni propriétaire, ni client → `whereRaw('1 = 0')`. Un compte
        // fraîchement créé ne doit pas aspirer la base.
        $this->actingAs(User::factory()->create(), 'sanctum');

        $this->assertSame([], $this->dataLines($this->export('payments')));
        $this->assertSame([], $this->dataLines($this->export('leases')));
    }

    // ─── Helpers ─────────────────────────────────────────────────

    private function payment(Lease $lease, Customer $payer, int $amount): LeasePayment
    {
        return LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $payer->id,
            'amount' => $amount,
            'status' => PaymentStatus::Paid,
            'paid_at' => now(),
            'due_date' => now()->toDateString(),
        ]);
    }

    private function export(string $entity): string
    {
        return $this->apiGet("/api/export/{$entity}?format=csv")
            ->assertOk()
            ->streamedContent();
    }

    /**
     * Les lignes de DONNÉES du CSV, en-tête et lignes vides retirés.
     *
     * @return array<int,string>
     */
    private function dataLines(string $csv): array
    {
        $lines = array_values(array_filter(
            array_map('trim', preg_split('/\R/', $csv)),
            fn (string $line): bool => $line !== '',
        ));

        return array_values(array_slice($lines, 1));
    }
}
