<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\User;
use App\Notifications\ResetPasswordNotification;
use App\Services\Admin\AgencyProvisioningService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Spatie\Activitylog\Models\Activity;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\BaseTestCase;

class AgencyOnboardingTest extends BaseTestCase
{
    use RefreshDatabase;

    public function test_super_admin_can_create_agency_admin_and_invitation(): void
    {
        Notification::fake();
        $actor = $this->actingAsRole('super_admin');

        $response = $this->postJson('/api/admin/agencies', $this->payload())
            ->assertCreated()
            ->assertJsonPath('data.agency.name', 'Sunu Gestion')
            ->assertJsonPath('data.agency.slug', 'sunu-gestion')
            ->assertJsonPath('data.agency.status', 'active')
            ->assertJsonPath('data.agency.is_verified', false)
            ->assertJsonPath('data.admin.email', 'admin@sunu.test');

        $agency = Agency::query()->findOrFail($response->json('data.agency.id'));
        $admin = User::query()->where('email', 'admin@sunu.test')->firstOrFail();

        $this->assertSame($admin->id, $agency->primary_admin_id);
        $this->assertTrue($admin->agentProfiles()->where('agency_id', $agency->id)->exists());
        $this->assertTrue($admin->isAgencyAdminAt((int) $agency->id));

        Notification::assertSentTo($admin, ResetPasswordNotification::class);

        $this->assertTrue(
            Activity::query()
                ->where('event', 'super_admin_agency_provisioned')
                ->where('causer_id', $actor->id)
                ->where('subject_id', $agency->id)
                ->exists(),
        );
    }

    public function test_agency_admin_cannot_onboard_agency(): void
    {
        $this->actingAsRole('agency_admin');

        $this->postJson('/api/admin/agencies', $this->payload())->assertForbidden();
    }

    public function test_admin_email_collision_returns_409(): void
    {
        Notification::fake();
        $this->actingAsRole('super_admin');
        User::factory()->create(['email' => 'admin@sunu.test']);

        $this->postJson('/api/admin/agencies', $this->payload())
            ->assertStatus(409)
            ->assertJsonPath('message', 'An account already exists with this admin email.');
    }

    public function test_validation_failure_returns_422(): void
    {
        $this->actingAsRole('super_admin');

        $this->postJson('/api/admin/agencies', [
            'agency' => ['name' => ''],
            'admin' => ['email' => 'not-an-email'],
        ])->assertUnprocessable();
    }

    public function test_invitation_failure_rolls_back_agency_and_admin(): void
    {
        Notification::fake();
        $this->actingAsRole('super_admin');
        $this->app->instance(AgencyProvisioningService::class, new class extends AgencyProvisioningService
        {
            protected function sendActivationLink(User $admin): void
            {
                throw new HttpException(502, 'Invitation email could not be sent.');
            }
        });

        $this->postJson('/api/admin/agencies', $this->payload(['agency' => ['slug' => 'rollback-agency']]))
            ->assertStatus(502);

        $this->assertDatabaseMissing('agencies', ['slug' => 'rollback-agency']);
        $this->assertDatabaseMissing('users', ['email' => 'admin@sunu.test']);
    }

    private function payload(array $overrides = []): array
    {
        return array_replace_recursive([
            'agency' => [
                'name' => 'Sunu Gestion',
                'slug' => 'sunu-gestion',
                'type' => 'property_management',
                'email' => 'contact@sunu.test',
                'phone' => '+221771234567',
                'address' => 'Plateau, Dakar',
            ],
            'admin' => [
                'first_name' => 'Awa',
                'last_name' => 'Ndiaye',
                'email' => 'admin@sunu.test',
                'language' => 'fr',
            ],
        ], $overrides);
    }
}
