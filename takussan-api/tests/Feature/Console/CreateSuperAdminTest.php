<?php

namespace Tests\Feature\Console;

use App\Models\Enums\UserStatus;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-263 — `platform:create-super-admin` artisan command (renommée depuis
 * `takussan:create-super-admin` par TCK-309 ; l'ancien nom reste un alias déprécié).
 *
 * Covers AC1–AC5: interactive flow, --no-interaction flow, duplicate
 * email refusal, weak password refusal, 2FA secret + 8 recovery codes
 * shown once, super_admin spatie role attached globally, activity log
 * `super_admin_bootstrapped` written.
 */
class CreateSuperAdminTest extends TestCase
{
    use RefreshDatabase;

    private const STRONG_PASSWORD = 'Str0ng!Pass-word42';

    protected function setUp(): void
    {
        parent::setUp();
        // Reset the spatie team scope between tests so role lookups
        // happen on the global (null-team) bucket the command targets.
    }

    public function test_interactive_mode_creates_super_admin(): void
    {
        // `--locale` defaults to 'fr' from the signature, so the
        // prompt loop short-circuits on that field — only the four
        // genuinely-empty questions are asked.
        $this->artisan('platform:create-super-admin')
            ->expectsQuestion('Email', 'boss@takussan.test')
            ->expectsQuestion('Password (12+ chars, 1 upper, 1 lower, 1 digit, 1 special)', self::STRONG_PASSWORD)
            ->expectsQuestion('First name', 'Aminata')
            ->expectsQuestion('Last name', 'Diop')
            ->assertSuccessful();

        $user = User::query()->where('email', 'boss@takussan.test')->first();

        $this->assertNotNull($user);
        $this->assertSame('Aminata', $user->first_name);
        $this->assertSame('fr', $user->preferred_language);
        $this->assertNotNull($user->email_verified_at);
        $this->assertSame(UserStatus::Active->value, $user->status->value);
        $this->assertTrue($user->two_factor_enabled);
        $this->assertNotNull($user->two_factor_secret);
        $this->assertTrue((bool) $user->force_2fa_at_first_login);
        $this->assertTrue($user->isSuperAdmin());
    }

    public function test_no_interaction_mode_creates_super_admin(): void
    {
        $this->artisan('platform:create-super-admin', [
            '--email' => 'ops@takussan.test',
            '--password' => self::STRONG_PASSWORD,
            '--first-name' => 'Ops',
            '--last-name' => 'Engineer',
            '--no-interaction' => true,
        ])->assertSuccessful();

        $user = User::query()->where('email', 'ops@takussan.test')->first();
        $this->assertNotNull($user);
        $this->assertTrue($user->isSuperAdmin());
        $this->assertTrue($user->two_factor_enabled);
        $this->assertNotNull($user->two_factor_secret);
        $this->assertTrue((bool) $user->force_2fa_at_first_login);
    }

    public function test_no_interaction_fails_when_required_flag_missing(): void
    {
        $this->artisan('platform:create-super-admin', [
            '--email' => 'incomplete@takussan.test',
            // password missing
            '--first-name' => 'No',
            '--last-name' => 'Pass',
            '--no-interaction' => true,
        ])->assertFailed();

        $this->assertDatabaseMissing('users', ['email' => 'incomplete@takussan.test']);
    }

    public function test_duplicate_email_is_refused(): void
    {
        User::factory()->create(['email' => 'taken@takussan.test']);

        $this->artisan('platform:create-super-admin', [
            '--email' => 'taken@takussan.test',
            '--password' => self::STRONG_PASSWORD,
            '--first-name' => 'Dup',
            '--last-name' => 'Email',
            '--no-interaction' => true,
        ])->assertFailed();

        $this->assertSame(1, User::query()->where('email', 'taken@takussan.test')->count());
    }

    public function test_weak_password_is_refused(): void
    {
        $this->artisan('platform:create-super-admin', [
            '--email' => 'weak@takussan.test',
            '--password' => 'short',
            '--first-name' => 'Weak',
            '--last-name' => 'Password',
            '--no-interaction' => true,
        ])->assertFailed();

        $this->assertDatabaseMissing('users', ['email' => 'weak@takussan.test']);
    }

    public function test_recovery_codes_are_displayed_and_persisted_hashed(): void
    {
        $this->artisan('platform:create-super-admin', [
            '--email' => 'codes@takussan.test',
            '--password' => self::STRONG_PASSWORD,
            '--first-name' => 'Codes',
            '--last-name' => 'Owner',
            '--no-interaction' => true,
        ])
            ->expectsOutputToContain('STORE THESE RECOVERY CODES NOW')
            ->assertSuccessful();

        $user = User::query()->where('email', 'codes@takussan.test')->first();
        $this->assertNotNull($user->two_factor_recovery_codes);

        $codes = json_decode($user->two_factor_recovery_codes, true);
        $this->assertIsArray($codes);
        $this->assertCount(8, $codes);

        // Persisted codes are bcrypt hashes, not the plain values shown
        // in the terminal — proving the "shown once" contract holds.
        foreach ($codes as $hashed) {
            $this->assertStringStartsWith('$2y$', $hashed);
        }
    }

    public function test_super_admin_role_is_attached_globally(): void
    {
        $this->artisan('platform:create-super-admin', [
            '--email' => 'role@takussan.test',
            '--password' => self::STRONG_PASSWORD,
            '--first-name' => 'Role',
            '--last-name' => 'Check',
            '--no-interaction' => true,
        ])->assertSuccessful();

        $user = User::query()->where('email', 'role@takussan.test')->first();

        // TCK-278 — super_admin se matérialise via PlatformProfile, plus
        // par une ligne dans la table spatie roles.
        $this->assertTrue($user->isSuperAdmin());
    }

    public function test_activity_log_super_admin_bootstrapped_is_written(): void
    {
        $this->artisan('platform:create-super-admin', [
            '--email' => 'audit@takussan.test',
            '--password' => self::STRONG_PASSWORD,
            '--first-name' => 'Audit',
            '--last-name' => 'Log',
            '--no-interaction' => true,
        ])->assertSuccessful();

        $log = Activity::query()
            ->where('event', 'super_admin_bootstrapped')
            ->latest('id')
            ->first();

        $this->assertNotNull($log);
        $this->assertSame('artisan', $log->properties->get('source'));
        $this->assertTrue($log->properties->get('two_factor_enabled'));
        $this->assertTrue($log->properties->get('force_2fa_at_first_login'));
    }

    public function test_password_is_hashed_in_database(): void
    {
        $this->artisan('platform:create-super-admin', [
            '--email' => 'hashed@takussan.test',
            '--password' => self::STRONG_PASSWORD,
            '--first-name' => 'Hashed',
            '--last-name' => 'Password',
            '--no-interaction' => true,
        ])->assertSuccessful();

        $user = User::query()->where('email', 'hashed@takussan.test')->first();
        $this->assertNotSame(self::STRONG_PASSWORD, $user->password);
        $this->assertTrue(Hash::check(self::STRONG_PASSWORD, $user->password));
    }

    /**
     * TCK-309 — l'ancien nom doit continuer de RÉSOUDRE, pas seulement
     * d'apparaître dans `artisan list` : `docs/features.md` §2.1 le
     * prescrit encore, et un opérateur qui suit ce document à
     * l'installation d'un environnement n'a aucun autre recours.
     */
    public function test_deprecated_takussan_alias_still_resolves(): void
    {
        $this->artisan('takussan:create-super-admin', [
            '--email' => 'legacy@takussan.test',
            '--password' => self::STRONG_PASSWORD,
            '--first-name' => 'Legacy',
            '--last-name' => 'Alias',
            '--no-interaction' => true,
        ])->assertSuccessful();

        $user = User::query()->where('email', 'legacy@takussan.test')->first();

        $this->assertNotNull($user);
        $this->assertTrue($user->isSuperAdmin());
    }

    /**
     * L'alias est déclaré sur la commande elle-même, pas seulement toléré
     * par le résolveur de Symfony — c'est cette déclaration que lit
     * `scripts/check-command-prefixes.mjs`, et c'est elle qui doit
     * disparaître le jour où l'on retirera l'alias.
     */
    public function test_canonical_name_is_platform_prefixed_and_declares_the_legacy_alias(): void
    {
        $command = $this->app->make(Kernel::class)
            ->all()['platform:create-super-admin'];

        $this->assertSame('platform:create-super-admin', $command->getName());
        $this->assertSame(['takussan:create-super-admin'], $command->getAliases());
    }
}
