<?php

namespace Tests\Feature\Auth\TwoFactor;

use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * TCK-589, vérification adverse M4 — deux familles de gestes étaient hors des listes :
 *  - l'équipe par `profiles.php` (suspendre, retirer un agent : `AgentProfileController`) ;
 *  - l'argent qui SORT, décision du porteur : `booking-payments/{p}/refund` et
 *    `leases/{l}/deposit-refund`.
 * Un admin d'agence sans 2FA y passait. Rouge sur `e59cb8b2` (200 / 204 / 200 / 201).
 */
class MoneyOutTwoFactorTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake(config('media-library.disk_name'));
        Storage::fake(config('media-library.public_disk_name'));
    }

    public function test_un_admin_sans_2fa_ne_suspend_ni_ne_retire_un_agent(): void
    {
        $admin = $this->actingAsRole('agency_admin', ['two_factor_enabled' => false, 'two_factor_secret' => null]);
        $profil = AgentProfile::query()->firstOrCreate(['user_id' => User::factory()->create()->id, 'agency_id' => $admin->agency_id]);
        $profil->forceFill(['status' => 'active'])->save();

        $this->patchJson("/api/profiles/{$profil->id}/suspend")->assertForbidden()->assertJsonPath('code', 'two_factor_required');
        $this->deleteJson("/api/profiles/{$profil->id}")->assertForbidden()->assertJsonPath('code', 'two_factor_required');
        $this->assertDatabaseHas($profil->getTable(), ['id' => $profil->id, 'status' => 'active']);
    }

    public function test_un_admin_sans_2fa_ne_restitue_pas_une_caution(): void
    {
        $admin = $this->actingAsRole('agency_admin', ['two_factor_enabled' => false, 'two_factor_secret' => null]);
        $bail = $this->bail($admin);

        $this->postJson("/api/leases/{$bail->id}/deposit-refund", ['amount' => 500000])
            ->assertForbidden()->assertJsonPath('code', 'two_factor_required');
        $this->assertEquals(0, (float) $bail->fresh()->deposit_refunded_amount);
    }

    public function test_avec_la_2fa_l_admin_restitue_la_caution(): void
    {
        $admin = $this->actingAsRole('agency_admin');

        $this->postJson("/api/leases/{$this->bail($admin)->id}/deposit-refund", ['amount' => 500000])->assertCreated();
    }

    public function test_un_admin_sans_2fa_ne_rembourse_pas_un_paiement(): void
    {
        $admin = $this->actingAsRole('agency_admin', ['two_factor_enabled' => false, 'two_factor_secret' => null]);
        $paiement = $this->paiement($admin);

        $this->postJson("/api/booking-payments/{$paiement->id}/refund", ['refund_amount' => 50000, 'refund_reason' => 'annulation'])
            ->assertForbidden()->assertJsonPath('code', 'two_factor_required');
        $this->assertNull($paiement->fresh()->refund_amount);
    }

    private function bail(User $admin): Lease
    {
        return Lease::factory()->create([
            'landlord_id' => $admin->id,
            'agency_id' => $admin->agency_id,
            'status' => LeaseStatus::Terminated,
            'deposit_amount' => 500000,
        ]);
    }

    private function paiement(User $admin): BookingPayment
    {
        $bien = Property::factory()->create(['user_id' => $admin->id, 'agency_id' => $admin->agency_id]);

        return BookingPayment::factory()->paid()->create([
            'booking_id' => Booking::factory()->create(['property_id' => $bien->id])->id,
            'amount' => 100000,
        ]);
    }
}
