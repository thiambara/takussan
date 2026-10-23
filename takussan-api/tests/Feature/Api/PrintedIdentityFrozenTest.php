<?php

namespace Tests\Feature\Api;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Services\Payments\PaymentReceiptPdf;
use App\Services\Pdf\DocumentPdfService;
use App\Services\Pdf\PrintedIdentity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * P140.02 (TCK-1792) — une quittance, un reçu de réservation et un état des lieux signé
 * impriment les identités du jour qu'ils attestent (acquittement, seconde signature), et non
 * celles du jour du téléchargement.
 */
class PrintedIdentityFrozenTest extends TestCase
{
    use RefreshDatabase;

    private const SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAvMBAOeufn4AAAAASUVORK5CYII=';

    protected function setUp(): void
    {
        parent::setUp();

        // Le vrai gabarit, rendu en HTML : le texte imprimé se lit dans la réponse.
        $this->partialMock(DocumentPdfService::class, function ($mock) {
            $mock->shouldReceive('render')->andReturnUsing(
                fn (string $template, array $data) => view($template, $data)->render()
            );
        });
    }

    public function test_la_quittance_imprime_les_identites_du_reglement(): void
    {
        [$landlord, $tenantUser, $tenant, $property, $agency, $lease] = $this->scaffold();
        $payment = LeasePayment::factory()->paid()->create(['lease_id' => $lease->id, 'payer_id' => $tenant->id, 'amount' => 400_000]);

        $this->rename($tenant, $property, $agency, $landlord);

        Sanctum::actingAs($tenantUser);
        $html = (string) $this->get("/api/leases/{$lease->id}/receipts/{$payment->id}/pdf")->assertOk()->getContent();

        $this->assertPrintsTheOldIdentities($html, landlord: false);
    }

    public function test_le_recu_de_reservation_imprime_les_identites_du_reglement(): void
    {
        [, , $customer, $property, $agency] = $this->scaffold();
        $booking = Booking::factory()->create(['customer_id' => $customer->id, 'property_id' => $property->id, 'agency_id' => $agency->id]);
        $payment = BookingPayment::factory()->paid()->create(['booking_id' => $booking->id, 'amount' => 125_000]);

        $this->rename($customer, $property, $agency);

        $html = app(PaymentReceiptPdf::class)->forBookingPayment($payment->fresh());

        $this->assertStringContainsString('Diop', $html);
        $this->assertStringNotContainsString('Ndiaye', $html);
        $this->assertStringContainsString('Villa Alpha', $html);
        $this->assertStringNotContainsString('Villa Beta', $html);
        $this->assertStringContainsString('Agence Alpha', $html);
        $this->assertStringNotContainsString('Agence Beta', $html);
    }

    public function test_l_etat_des_lieux_signe_imprime_les_identites_de_la_seconde_signature(): void
    {
        [$landlord, $tenantUser, $tenant, $property, $agency, $lease] = $this->scaffold();
        $inventory = Inventory::factory()->pendingSignature()->create([
            'lease_id' => $lease->id, 'property_id' => $property->id, 'tenant_id' => $tenant->id, 'conducted_by' => $landlord->id,
        ]);
        Sanctum::actingAs($landlord);
        $this->postJson("/api/inventories/{$inventory->id}/sign", ['role' => 'landlord', 'signature' => self::SIGNATURE])->assertOk();
        Sanctum::actingAs($tenantUser);
        $this->postJson("/api/inventories/{$inventory->id}/sign", ['role' => 'tenant', 'signature' => self::SIGNATURE])->assertOk();

        $this->rename($tenant, $property, $agency, $landlord);

        $html = (string) $this->get("/api/inventories/{$inventory->id}/pdf")->assertOk()->getContent();

        // Le bailleur n'y est pas : `InventoryController` le lit par `$property->user`, relation que
        // `Property` n'a pas (hors périmètre, signalé dans le rapport du lot).
        $this->assertPrintsTheOldIdentities($html, landlord: false);
    }

    public function test_un_acte_sans_instantane_imprime_les_valeurs_courantes(): void
    {
        [, $tenantUser, $tenant, $property, $agency, $lease] = $this->scaffold();
        $payment = LeasePayment::factory()->paid()->create(['lease_id' => $lease->id, 'payer_id' => $tenant->id, 'amount' => 400_000]);
        // Acquittée avant TCK-1792 : sans instantané.
        $metadata = (array) $payment->fresh()->metadata;
        unset($metadata[PrintedIdentity::KEY]);
        LeasePayment::query()->whereKey($payment->id)->update(['metadata' => json_encode($metadata)]);

        $this->rename($tenant, $property, $agency);

        Sanctum::actingAs($tenantUser);
        $html = (string) $this->get("/api/leases/{$lease->id}/receipts/{$payment->id}/pdf")->assertOk()->getContent();

        $this->assertStringContainsString('Ndiaye', $html);
        $this->assertStringContainsString('Agence Beta', $html);
    }

    private function assertPrintsTheOldIdentities(string $html, bool $landlord): void
    {
        $old = ['Diop', 'awa.diop@example.test', 'Rue Alpha', 'Agence Alpha'];
        $new = ['Ndiaye', 'awa.ndiaye@example.test', 'Rue Beta', 'Agence Beta'];
        if ($landlord) {
            $old[] = 'Fall';
            $new[] = 'Sarr';
        }
        foreach ($old as $value) {
            $this->assertStringContainsString($value, $html, "« {$value} », vrai au jour de l'acte");
        }
        foreach ($new as $value) {
            $this->assertStringNotContainsString($value, $html, "« {$value} », écrit après l'acte");
        }
    }

    /** @return array{0: User, 1: User, 2: Customer, 3: Property, 4: Agency, 5: Lease} */
    private function scaffold(): array
    {
        $agency = Agency::factory()->create(['name' => 'Agence Alpha']);
        $landlord = User::factory()->create(['first_name' => 'Moussa', 'last_name' => 'Fall']);
        $property = Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $agency->id, 'title' => 'Villa Alpha']);
        Address::query()->where('addressable_type', $property->getMorphClass())->where('addressable_id', $property->id)->delete();
        $property->address()->create(['street' => 'Rue Alpha', 'city' => 'Dakar', 'country' => 'SN']);
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id, 'first_name' => 'Awa', 'last_name' => 'Diop', 'email' => 'awa.diop@example.test']);
        $lease = Lease::factory()->create([
            'property_id' => $property->id, 'landlord_id' => $landlord->id, 'tenant_id' => $tenant->id, 'agency_id' => $agency->id,
        ]);

        return [$landlord, $tenantUser, $tenant, $property, $agency, $lease];
    }

    private function rename(Customer $person, Property $property, Agency $agency, ?User $landlord = null): void
    {
        $person->forceFill(['last_name' => 'Ndiaye', 'email' => 'awa.ndiaye@example.test'])->save();
        $property->forceFill(['title' => 'Villa Beta'])->save();
        $property->address()->update(['street' => 'Rue Beta']);
        $agency->forceFill(['name' => 'Agence Beta'])->save();
        $landlord?->forceFill(['last_name' => 'Sarr'])->save();
    }
}
