<?php

namespace Tests\Feature\Authorization;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\Capability;
use App\Models\Enums\PaymentStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Services\Membership\CapabilityEnforcementInventory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-587 (ADR-0031 §4, AC12) — chaque capacité branchée par ce ticket est LUE par son geste.
 *
 * Une ligne par capacité : un membre dont le rôle personnalisé est le rôle système qui la porte
 * MOINS elle reçoit 403 ; le rôle système, 2xx. Avant ce ticket, chaque ligne rendait 2xx sans la
 * capacité : l'éditeur de rôles la servait, aucun geste ne la jugeait.
 *
 * `properties.create|delete|publish` et `leases.create` sont éprouvées par AC3, AC4 et AC1c
 * (`PropertyAuthorizationTest`, `OwnerIsolationWithinAgencyTest`).
 */
class BranchedCapabilitiesTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $landlord;

    private Property $property;

    private Customer $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();
        Notification::fake();

        $this->agency = Agency::factory()->create();
        $this->landlord = User::factory()->withOwnerProfile($this->agency)->create();
        $this->property = Property::factory()->create(['user_id' => $this->landlord->id, 'agency_id' => $this->agency->id]);
        $this->tenant = Customer::factory()->create(['agency_id' => $this->agency->id]);
    }

    /**
     * capacité → [rôle système qui la porte, méthode, URI (gabarit), corps, fabrique de la cible].
     *
     * @return array<string, array{Capability, string, string, string, array<string, mixed>, string}>
     */
    public static function gestes(): array
    {
        return [
            'bookings.validate — confirmer' => [Capability::BookingsValidate, 'agent', 'POST', '/api/bookings/{booking}/confirm', [], 'booking'],
            'bookings.validate — refuser' => [Capability::BookingsValidate, 'agent', 'POST', '/api/bookings/{booking}/reject', [], 'booking'],
            'bookings.cancel' => [Capability::BookingsCancel, 'agent', 'POST', '/api/bookings/{booking}/cancel', [], 'booking'],
            'invoices.send' => [Capability::InvoicesSend, 'agent', 'POST', '/api/invoices/{invoice}/send', [], 'draftInvoice'],
            'invoices.write_off' => [Capability::InvoicesWriteOff, 'admin', 'POST', '/api/invoices/{invoice}/cancel', [], 'draftInvoice'],
            'payments.record — facture' => [Capability::PaymentsRecord, 'agent', 'POST', '/api/invoices/{invoice}/mark-paid', [], 'sentInvoice'],
            'payments.record — loyer' => [Capability::PaymentsRecord, 'agent', 'POST', '/api/leases/{lease}/payments', [
                'amount' => 400000,
                'payment_type' => 'rent',
                'period_start' => '2026-01-01',
                'period_end' => '2026-01-31',
                'due_date' => '2026-01-05',
            ], 'lease'],
            'payments.record — marquer payé' => [Capability::PaymentsRecord, 'agent', 'POST', '/api/lease-payments/{payment}/mark-paid', [], 'payment'],
            'crm.view_all' => [Capability::CrmViewAll, 'agent', 'GET', '/api/customers/{customer}', [], 'colleagueCustomer'],
            'properties.update_own' => [Capability::PropertiesUpdateOwn, 'agent', 'PATCH', '/api/properties/{property}', ['title' => 'Renommé'], 'ownProperty'],
            'crm.export' => [Capability::CrmExport, 'admin', 'GET', '/api/export/customers?format=csv', [], 'none'],
            'payments.export' => [Capability::PaymentsExport, 'admin', 'GET', '/api/export/payments?format=csv', [], 'none'],
            'reports.export' => [Capability::ReportsExport, 'admin', 'GET', '/api/export/leases?format=csv', [], 'none'],
            'team.suspend' => [Capability::TeamSuspend, 'admin', 'POST', '/api/agencies/{agency}/team/{member}/suspend', [], 'member'],
        ];
    }

    /** @param  array<string, mixed>  $body */
    #[DataProvider('gestes')]
    public function test_sans_la_capacite_le_geste_est_refuse(Capability $capability, string $role, string $method, string $template, array $body, string $target): void
    {
        $actor = $role === 'admin'
            ? $this->adminWithout($this->agency, $capability)
            : $this->agentWithout($this->agency, $capability);

        $this->actingAsApi($actor)
            ->json($method, $this->uri($template, $this->target($target, $actor)), $body)
            ->assertForbidden();
    }

    /** @param  array<string, mixed>  $body */
    #[DataProvider('gestes')]
    public function test_avec_le_role_systeme_le_geste_passe(Capability $capability, string $role, string $method, string $template, array $body, string $target): void
    {
        $actor = $role === 'admin' ? $this->agencyAdmin($this->agency) : $this->agencyAgent($this->agency);

        $this->actingAsApi($actor)
            ->json($method, $this->uri($template, $this->target($target, $actor)), $body)
            ->assertSuccessful();
    }

    public function test_sans_crm_view_all_le_client_d_un_collegue_est_absent_de_la_liste(): void
    {
        $restreint = $this->agentWithout($this->agency, Capability::CrmViewAll);
        $duCollegue = $this->target('colleagueCustomer', $restreint)['customer'];
        $leSien = Customer::factory()->create(['agency_id' => $this->agency->id, 'added_by_id' => $restreint->id]);

        $ids = collect($this->actingAsApi($restreint)->getJson('/api/customers?per_page=100')->assertOk()->json('data'))
            ->pluck('id')->all();

        $this->assertNotContains($duCollegue->id, $ids);
        $this->assertContains($leSien->id, $ids);
    }

    /** AC10 — `not_enforced` rend exactement l'inventaire, ligne pour ligne. */
    public function test_le_catalogue_expose_les_capacites_sans_effet(): void
    {
        $rendu = $this->actingAsApi($this->agencyAdmin($this->agency))
            ->getJson('/api/capabilities')
            ->assertOk()
            ->json('data.not_enforced');

        $attendu = [];
        foreach (CapabilityEnforcementInventory::AWAITING as $capability => $ticket) {
            $attendu[] = ['capability' => $capability, 'ticket' => $ticket];
        }
        $this->assertSame($attendu, $rendu);
        $this->assertContains(['capability' => 'payouts.approve', 'ticket' => 'TCK-594'], $rendu);
    }

    /** @return array<string, int|Model> */
    private function target(string $kind, User $actor): array
    {
        $lease = fn () => Lease::factory()->create([
            'property_id' => $this->property->id,
            'landlord_id' => $this->landlord->id,
            'tenant_id' => $this->tenant->id,
            'agency_id' => $this->agency->id,
        ]);

        return match ($kind) {
            'booking' => ['booking' => Booking::factory()->create([
                'property_id' => $this->property->id,
                'customer_id' => $this->tenant->id,
                'created_by_id' => $this->landlord->id,
                'agency_id' => $this->agency->id,
                'status' => BookingStatus::Pending,
            ])],
            'draftInvoice' => ['invoice' => Invoice::factory()->create(['customer_id' => $this->tenant->id, 'agency_id' => $this->agency->id])],
            'sentInvoice' => ['invoice' => Invoice::factory()->sent()->create(['customer_id' => $this->tenant->id, 'agency_id' => $this->agency->id])],
            'lease' => ['lease' => $lease()],
            'payment' => ['payment' => LeasePayment::factory()->create([
                'lease_id' => $lease()->id,
                'payer_id' => $this->tenant->id,
                'status' => PaymentStatus::Pending,
            ])],
            'colleagueCustomer' => ['customer' => Customer::factory()->create([
                'agency_id' => $this->agency->id,
                'added_by_id' => $this->agencyAgent($this->agency)->id,
            ])],
            'ownProperty' => ['property' => Property::factory()->create(['user_id' => $actor->id, 'agency_id' => $this->agency->id])],
            'member' => ['agency' => $this->agency, 'member' => $this->agencyAgent($this->agency)],
            default => [],
        };
    }

    /** @param  array<string, int|Model>  $targets */
    private function uri(string $template, array $targets): string
    {
        return preg_replace_callback('/\{(\w+)\}/', fn ($m) => (string) $targets[$m[1]]->getKey(), $template);
    }
}
