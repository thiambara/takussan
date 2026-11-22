<?php

namespace Tests\Feature\Agency;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2926 (ADR-0124 § 6) — `POST /api/agencies/{agency}/team/{user}/two-factor-reminder` : l'avis
 * `account.two_factor_reminder` au membre, une fois par 24 h ; 409 si sa 2FA est active ; 403 pour un agent.
 */
class TwoFactorReminderTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create(['name' => 'Agence Teranga']);
        $this->admin = $this->agencyAdmin($this->agency);
        $this->agent = $this->agencyAgent($this->agency);
    }

    private function remind(User $member, ?Agency $agency = null): TestResponse
    {
        $agency ??= $this->agency;

        return $this->postJson("/api/agencies/{$agency->id}/team/{$member->id}/two-factor-reminder");
    }

    private function reminders(User $member): int
    {
        return AppNotification::query()->where('user_id', $member->id)
            ->where('code', NotificationCode::AccountTwoFactorReminder->value)->count();
    }

    public function test_ac4_un_membre_sans_2fa_recoit_un_avis_puis_429_dans_les_24_h(): void
    {
        $this->actingAsApi($this->admin);

        $this->remind($this->agent)->assertOk()->assertJsonPath('data.sent', true);
        $this->assertSame(1, $this->reminders($this->agent));
        $avis = AppNotification::query()->where('user_id', $this->agent->id)->firstOrFail();
        $this->assertSame(['agency' => 'Agence Teranga'], $avis->params);
        $this->assertSame('profile_security', $avis->target['kind']);

        $this->remind($this->agent)->assertStatus(429)->assertJsonPath('code', 'team.two_factor_reminder_throttled');
        $this->assertSame(1, $this->reminders($this->agent));

        // Passé 24 h, un nouveau rappel part.
        $this->travel(25)->hours();
        $this->remind($this->agent)->assertOk();
        $this->assertSame(2, $this->reminders($this->agent));
    }

    public function test_ac4_un_membre_avec_2fa_rend_409(): void
    {
        $this->agent->forceFill(['two_factor_enabled' => true])->save();
        $this->actingAsApi($this->admin);

        $this->remind($this->agent)->assertStatus(409)->assertJsonPath('code', 'team.two_factor_already_enabled');
        $this->assertSame(0, $this->reminders($this->agent));
    }

    public function test_ac4_un_agent_appelant_rend_403(): void
    {
        $autre = $this->agencyAgent($this->agency);
        $this->actingAsApi($this->agent);

        $this->remind($autre)->assertForbidden();
        $this->assertSame(0, $this->reminders($autre));
    }

    public function test_une_personne_hors_de_l_agence_rend_404(): void
    {
        $ailleurs = $this->agencyAgent(Agency::factory()->create());
        $this->actingAsApi($this->admin);

        $this->remind($ailleurs)->assertNotFound();
        $this->assertSame(0, $this->reminders($ailleurs));
    }
}
