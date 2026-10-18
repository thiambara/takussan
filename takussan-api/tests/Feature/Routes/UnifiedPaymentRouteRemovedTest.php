<?php

namespace Tests\Feature\Routes;

use App\Models\Customer;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-940 (P46.01, P46.02, P46.03) — `POST /api/payments` n'existe plus. Sans appelant depuis
 * TCK-681, il laissait écrire un loyer `paid` hors de `payments.record` et de la suspension du
 * bailleur, une restitution de caution payée sans reversement, et un règlement hors des gardes de
 * `mark-paid`. Un paiement se crée par les voies imbriquées (`leases/{id}/payments`,
 * `bookings/{id}/payments`) et se règle par `lease-payments/{id}/mark-paid`.
 */
class UnifiedPaymentRouteRemovedTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_route_unifiee_ne_cree_plus_rien(): void
    {
        $landlord = User::factory()->create();
        $lease = Lease::factory()->create([
            'landlord_id' => $landlord->id,
            'tenant_id' => Customer::factory()->create()->id,
        ]);
        Sanctum::actingAs($landlord);

        // Le corps qui rendait 201 `paid` au bailleur (mesuré par P46.01).
        $status = $this->postJson('/api/payments', [
            'payable_type' => 'lease',
            'payable_id' => $lease->id,
            'amount' => 250_000,
            'payment_type' => LeasePaymentType::Rent->value,
            'status' => PaymentStatus::Paid->value,
            'paid_at' => now()->toDateString(),
            'period_start' => now()->startOfMonth()->toDateString(),
            'period_end' => now()->endOfMonth()->toDateString(),
        ])->status();

        $this->assertContains($status, [404, 405], "POST /api/payments répond {$status}");
        $this->assertDatabaseCount('lease_payments', 0);
    }

    public function test_l_historique_au_meme_prefixe_reste_servi(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/payments/history')->assertOk();
    }
}
