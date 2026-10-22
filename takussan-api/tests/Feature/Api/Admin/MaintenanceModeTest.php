<?php

namespace Tests\Feature\Api\Admin;

use App\Models\MaintenanceWindow;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

class MaintenanceModeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    public function test_down_mode_blocks_non_admin_api_but_not_admin_namespace(): void
    {
        $this->window('down', now()->subMinute(), now()->addHour());

        $this->actingAsRole('agency_admin');
        $this->getJson('/api/properties')->assertStatus(503);

        $this->actingAsRole('super_admin');
        $this->getJson('/api/admin/maintenance')->assertOk();
    }

    public function test_read_only_blocks_mutations_but_allows_reads(): void
    {
        $this->window('read_only', now()->subMinute(), now()->addHour());
        $this->actingAsRole('agency_admin');

        $this->postJson('/api/properties', [])->assertStatus(503);
        $this->getJson('/api/properties')->assertOk();
    }

    /**
     * P98.09 (TCK-1174) — la connexion et `GET /api/auth/me` échappent à la fenêtre, dans les deux
     * modes : l'opérateur qui doit la lever se connecte, et la console, qui lit `/auth/me` avant de
     * se rendre, se charge. Avant, `down` rendait 503 aux deux, `read_only` à la connexion.
     */
    public function test_a_super_admin_signs_in_and_loads_the_console_during_a_window(): void
    {
        foreach (['down', 'read_only'] as $mode) {
            MaintenanceWindow::query()->delete();
            Cache::flush();
            $this->window($mode, now()->subMinute(), now()->addHour());

            $operator = $this->actingAsRole('super_admin', ['password' => bcrypt('motdepasse-98-09')]);
            $this->app['auth']->forgetGuards();

            // La connexion passe la fenêtre : 200, le jeton ou la demande du second facteur du compte.
            $login = $this->postJson('/api/auth/login', ['email' => $operator->email, 'password' => 'motdepasse-98-09'])
                ->assertOk();
            $this->assertTrue($login->json('token') !== null || $login->json('requires_2fa') === true, $mode);

            $token = $operator->createToken('p98-09')->plainTextToken;
            $this->app['auth']->forgetGuards();
            $this->withToken($token)->getJson('/api/auth/me')->assertOk();
            if ($mode === 'down') {
                $this->withToken($token)->getJson('/api/properties')->assertStatus(503);
            }
        }
    }

    public function test_public_status_shows_banner_30_minutes_before_window(): void
    {
        $this->window('banner', now()->addMinutes(20), now()->addHour());

        $this->getJson('/api/maintenance/status')
            ->assertOk()
            ->assertHeader('Cache-Control', 'max-age=60, public')
            ->assertJsonPath('data.active', false)
            ->assertJsonPath('data.show_banner', true)
            ->assertJsonPath('data.window.mode', 'banner');
    }

    public function test_schedule_validates_dates_and_agency_admin_is_forbidden(): void
    {
        $this->actingAsRole('super_admin');

        $this->postJson('/api/admin/maintenance', [
            'starts_at' => now()->subMinute()->toISOString(),
            'ends_at' => now()->addHour()->toISOString(),
            'mode' => 'banner',
            'severity' => 'scheduled',
            'messages' => ['fr' => 'Maintenance planifiée'],
        ])->assertUnprocessable();

        $this->actingAsRole('agency_admin');
        $this->postJson('/api/admin/maintenance', [
            'starts_at' => now()->addHour()->toISOString(),
            'ends_at' => now()->addHours(2)->toISOString(),
            'mode' => 'banner',
            'severity' => 'scheduled',
            'messages' => ['fr' => 'Maintenance planifiée'],
        ])->assertForbidden();
    }

    public function test_schedule_and_cancel_are_audited(): void
    {
        $this->actingAsRole('super_admin');

        $this->postJson('/api/admin/maintenance', [
            'starts_at' => now()->addMinutes(10)->toISOString(),
            'ends_at' => now()->addHour()->toISOString(),
            'mode' => 'banner',
            'severity' => 'scheduled',
            'messages' => ['fr' => 'Maintenance planifiée', 'en' => 'Scheduled maintenance'],
        ])->assertCreated()
            ->assertJsonPath('data.window.mode', 'banner');

        $this->deleteJson('/api/admin/maintenance')
            ->assertOk()
            ->assertJsonPath('data.window', null);

        $this->assertTrue(Activity::query()->where('event', 'super_admin_maintenance_scheduled')->exists());
        $this->assertTrue(Activity::query()->where('event', 'super_admin_maintenance_cancelled')->exists());
    }

    private function window(string $mode, mixed $startsAt, mixed $endsAt): MaintenanceWindow
    {
        return MaintenanceWindow::create([
            'starts_at' => $startsAt,
            'ends_at' => $endsAt,
            'mode' => $mode,
            'severity' => $mode === 'down' ? 'interruption' : 'scheduled',
            'messages' => ['fr' => 'Maintenance planifiée', 'en' => 'Scheduled maintenance', 'wo' => 'Maintenance'],
            'banner_lead_minutes' => 30,
        ]);
    }
}
