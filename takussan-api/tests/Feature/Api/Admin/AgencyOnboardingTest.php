<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\User;
use App\Notifications\AgencyAdminActivationNotification;
use Illuminate\Contracts\Auth\PasswordBroker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Mockery;
use RuntimeException;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

class AgencyOnboardingTest extends TestCase
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

        // TCK-781 — l'e-mail « Activez votre compte », et non la réinitialisation.
        Notification::assertSentTo($admin, AgencyAdminActivationNotification::class);

        $this->assertTrue(
            Activity::query()
                ->where('event', 'super_admin_agency_provisioned')
                ->where('causer_id', $actor->id)
                ->where('subject_id', $agency->id)
                ->exists(),
        );
    }

    /**
     * TCK-1130 (P83.01) — le champ libre « Type » de l'assistant n'avait aucun lecteur : il
     * finissait dans `agencies.metadata.onboarding_type`, sans effet sur le `kind`. Un client
     * qui l'envoie encore est accepté, et l'agence créée ne le porte plus.
     */
    public function test_agency_type_is_ignored_and_not_stored(): void
    {
        Notification::fake();
        $this->actingAsRole('super_admin');

        $response = $this->postJson('/api/admin/agencies', $this->payload(['agency' => ['type' => 'individual']]))
            ->assertCreated();

        $agency = Agency::query()->findOrFail($response->json('data.agency.id'));
        $this->assertArrayNotHasKey('onboarding_type', $agency->metadata ?? []);
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
            ->assertJsonPath('code', 'agency.admin_email_taken');
    }

    public function test_validation_failure_returns_422(): void
    {
        $this->actingAsRole('super_admin');

        $this->postJson('/api/admin/agencies', [
            'agency' => ['name' => ''],
            'admin' => ['email' => 'not-an-email'],
        ])->assertUnprocessable();
    }

    /**
     * TCK-1388 (P142.01) — l'activation part en file (TCK-747) : la requête ne voit jamais le
     * transport. Un échec avant la mise en file (ici, le jeton) n'est donc pas « l'e-mail n'a pas
     * pu partir » : il remonte tel quel et annule le provisionnement, sans le 502
     * `mail.invitation_not_sent` qu'aucun envoi ne pouvait plus justifier.
     */
    public function test_un_echec_avant_la_mise_en_file_annule_sans_promettre_un_502(): void
    {
        Notification::fake();
        $this->actingAsRole('super_admin');
        $broker = Mockery::mock(PasswordBroker::class);
        $broker->shouldReceive('createToken')->andThrow(new RuntimeException('jeton indisponible'));
        Password::shouldReceive('broker')->with('activations')->andReturn($broker);

        $response = $this->postJson('/api/admin/agencies', $this->payload(['agency' => ['slug' => 'rollback-agency']]))
            ->assertStatus(500);

        $this->assertNotSame('mail.invitation_not_sent', $response->json('code'));
        $this->assertDatabaseMissing('agencies', ['slug' => 'rollback-agency']);
        $this->assertDatabaseMissing('users', ['email' => 'admin@sunu.test']);
        Notification::assertSentTimes(AgencyAdminActivationNotification::class, 0);
    }

    /**
     * TCK-1388 (P142.01) — le contrat retenu : sous la file `database` de la production, un
     * transport injoignable ne touche pas la requête. L'agence est créée, l'activation attend
     * dans la file urgente, où `RetriesWithBackoff` (TCK-1352) l'espace et journalise son échec.
     */
    public function test_sous_la_file_database_l_activation_attend_dans_la_file_urgente(): void
    {
        config([
            'queue.default' => 'database',
            'mail.default' => 'smtp',
            'mail.mailers.smtp.host' => '127.0.0.1',
            'mail.mailers.smtp.port' => 1,
        ]);
        $this->actingAsRole('super_admin');

        $this->postJson('/api/admin/agencies', $this->payload(['agency' => ['slug' => 'en-file']]))
            ->assertCreated();

        $this->assertDatabaseHas('agencies', ['slug' => 'en-file']);
        $job = DB::table('jobs')->where('queue', 'notifications-urgent')->sole();
        $this->assertStringContainsString('SendQueuedNotifications', $job->payload);
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
