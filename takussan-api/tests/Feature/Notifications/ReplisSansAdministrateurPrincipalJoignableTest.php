<?php

namespace Tests\Feature\Notifications;

use App\Console\Commands\RemindTenantOnboarding;
use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\UserStatus;
use App\Models\Lease;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Property;
use App\Models\TenantOnboardingChecklist;
use App\Models\User;
use App\Notifications\AgentTenantInventoryReminderNotification;
use App\Notifications\BookingExpiredNotification;
use App\Services\Booking\BookingExpirationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-2187 (P225.02, décision déléguée) — le rappel « agent » de l'état des lieux et le dernier
 * repli de l'expiration d'une réservation visaient l'administrateur principal sans juger qu'il est
 * joignable : bloqué, l'avis partait au compte fermé, et à personne d'autre. La règle de P225.01
 * (`AdminsDeLAgence::principalSinonDestinataires`) s'y applique.
 */
class ReplisSansAdministrateurPrincipalJoignableTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $principal;

    private User $coAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->principal = User::factory()->create();
        $this->coAdmin = User::factory()->create();
        foreach ([$this->principal, $this->coAdmin] as $admin) {
            AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $this->agency->id]);
        }
        $this->agency->update(['primary_admin_id' => $this->principal->id]);
    }

    private function bloquerLePrincipal(): void
    {
        $this->principal->forceFill(['status' => UserStatus::Blocked])->save();
    }

    private function rappelDeSeptJours(): void
    {
        $locataire = User::factory()->create();
        $lease = Lease::factory()->active()->create([
            'tenant_id' => Customer::factory()->create(['user_id' => $locataire->id])->id,
            'agency_id' => $this->agency->id,
        ]);
        TenantOnboardingChecklist::create(['lease_id' => $lease->id, 'user_id' => $locataire->id])
            ->forceFill(['created_at' => now()->subDays(8)])->save();

        $this->artisan(RemindTenantOnboarding::class)->assertSuccessful();
    }

    /** Une réservation sans équipe (`BookingStakeholders::for` ne rend que le client) : le repli sert. */
    private function expirerSansEquipe(): void
    {
        $client = User::factory()->create();
        $booking = Booking::factory()->create([
            'property_id' => Property::factory()->create(['agency_id' => $this->agency->id])->id,
            'customer_id' => Customer::factory()->create(['user_id' => $client->id])->id,
            'created_by_id' => $client->id,
            'agency_id' => $this->agency->id,
            'status' => BookingStatus::Pending,
        ]);

        $this->assertTrue(app(BookingExpirationService::class)->expireBookingManually($booking));
    }

    public function test_rappel_de_l_etat_des_lieux_principal_bloque(): void
    {
        Notification::fake();
        $this->bloquerLePrincipal();

        $this->rappelDeSeptJours();

        Notification::assertSentTo($this->coAdmin, AgentTenantInventoryReminderNotification::class);
        Notification::assertNotSentTo($this->principal, AgentTenantInventoryReminderNotification::class);
    }

    public function test_repli_de_l_expiration_principal_bloque(): void
    {
        Notification::fake();
        $this->bloquerLePrincipal();

        $this->expirerSansEquipe();

        Notification::assertSentTo($this->coAdmin, BookingExpiredNotification::class);
        Notification::assertNotSentTo($this->principal, BookingExpiredNotification::class);
    }

    /** Témoin : un administrateur principal joignable reste seul destinataire, sur les deux sites. */
    public function test_principal_joignable_reste_seul_destinataire(): void
    {
        Notification::fake();

        $this->rappelDeSeptJours();
        $this->expirerSansEquipe();

        Notification::assertSentTo($this->principal, AgentTenantInventoryReminderNotification::class);
        Notification::assertSentTo($this->principal, BookingExpiredNotification::class);
        Notification::assertNotSentTo($this->coAdmin, AgentTenantInventoryReminderNotification::class);
        Notification::assertNotSentTo($this->coAdmin, BookingExpiredNotification::class);
    }
}
