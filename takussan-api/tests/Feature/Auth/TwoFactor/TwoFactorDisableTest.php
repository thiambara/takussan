<?php

namespace Tests\Feature\Auth\TwoFactor;

use App\Domain\Alerts\AlertableEvents;
use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use PHPUnit\Framework\Attributes\DataProvider;
use PragmaRX\Google2FA\Google2FA;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-589 AC7 — la 2FA exigée ne se désactive pas (contrainte 10) ; toute
 * désactivation écrit un événement NOMMÉ `two_factor_disabled`.
 *
 * Rouge sur `5f872f1f` : `disable` acceptait le seul mot de passe pour tout le
 * monde, et seule une entrée `updated` générique de `LogsActivity` en restait.
 */
class TwoFactorDisableTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
    }

    /** @return array<string, array{0: string}> */
    public static function preuves(): array
    {
        return ['mot de passe' => ['password'], 'code TOTP' => ['code']];
    }

    #[DataProvider('preuves')]
    public function test_un_super_admin_ne_desactive_pas_sa_2fa(string $preuve): void
    {
        $user = $this->actingAsRole('super_admin', ['password' => 'password123']);

        $this->postJson('/api/auth/two-factor/disable', $this->preuve($user, $preuve))
            ->assertStatus(422)
            ->assertJsonPath('code', 'two_factor_mandatory');

        $this->assertTrue($user->fresh()->two_factor_enabled);
    }

    public function test_un_admin_d_agence_ne_desactive_pas_sa_2fa(): void
    {
        $user = $this->actingAsRole('agency_admin', ['password' => 'password123']);

        $this->postJson('/api/auth/two-factor/disable', ['password' => 'password123'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'two_factor_mandatory');
        $this->assertTrue($user->fresh()->two_factor_enabled);
    }

    public function test_un_agent_d_une_agence_qui_l_exige_ne_la_desactive_pas(): void
    {
        $agency = Agency::factory()->create(['settings' => ['require_team_two_factor' => true]]);
        $user = $this->actingAsRole('agent', [
            'agency' => $agency,
            'password' => 'password123',
            'two_factor_enabled' => true,
            'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET,
        ]);

        $this->postJson('/api/auth/two-factor/disable', ['password' => 'password123'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'two_factor_mandatory');
        $this->assertTrue($user->fresh()->two_factor_enabled);
    }

    #[DataProvider('preuves')]
    public function test_un_client_desactive_et_l_evenement_nomme_est_ecrit(string $preuve): void
    {
        $user = $this->actingAsRole('customer', [
            'password' => 'password123',
            'two_factor_enabled' => true,
            'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET,
        ]);

        $this->postJson('/api/auth/two-factor/disable', $this->preuve($user, $preuve))
            ->assertOk()
            ->assertJsonPath('data.disabled', true);

        $this->assertFalse($user->fresh()->two_factor_enabled);
        $this->assertTrue(Activity::query()
            ->where('event', 'two_factor_disabled')
            ->where('subject_id', $user->id)
            ->where('causer_id', $user->id)
            ->exists());
    }

    public function test_l_evenement_est_alertable(): void
    {
        $this->assertTrue(AlertableEvents::has('two_factor_disabled'));
    }

    /** @return array<string, string> */
    private function preuve(User $user, string $preuve): array
    {
        return $preuve === 'password'
            ? ['password' => 'password123']
            : ['code' => (new Google2FA)->getCurrentOtp((string) $user->fresh()->two_factor_secret)];
    }
}
