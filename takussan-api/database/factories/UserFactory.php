<?php

namespace Database\Factories;

use App\Models\Agency;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\BrokerProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    protected static ?string $password;

    public function definition(): array
    {
        return [
            'username' => fake()->unique()->userName(),
            'first_name' => fake()->firstName(),
            'last_name' => fake()->lastName(),
            'status' => UserStatus::Active,
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'phone' => '+221'.fake()->numerify('7########'),
            'password' => static::$password ??= Hash::make('password'),
            'remember_token' => Str::random(10),
            'preferred_language' => 'fr',
            'timezone' => 'Africa/Dakar',
            'notifications_email_enabled' => true,
            'notifications_push_enabled' => true,
            'notifications_sms_enabled' => true,
        ];
    }

    /**
     * Stash for legacy `agency_id` overrides — populated either by
     * `User::setAgencyIdAttribute` during make (when the model intercepts
     * the legacy assignment) or by the `afterMaking` fallback below. Keyed
     * by the user's spl_object_id so concurrent factory builds don't collide.
     *
     * @var array<int, int>
     */
    private static array $legacyAgencyOverrides = [];

    public static function stashLegacyAgency(User $user, ?int $value): void
    {
        if ($value === null) {
            unset(self::$legacyAgencyOverrides[spl_object_id($user)]);

            return;
        }
        self::$legacyAgencyOverrides[spl_object_id($user)] = $value;
    }

    public static function popLegacyAgency(User $user): ?int
    {
        $key = spl_object_id($user);
        $value = self::$legacyAgencyOverrides[$key] ?? null;
        unset(self::$legacyAgencyOverrides[$key]);

        return $value;
    }

    /**
     * TCK-142 — Backward-compat shim for the legacy `User::factory()->create([
     * 'agency_id' => $a->id])` pattern that lives in dozens of tests. Strips
     * the now-dropped column from the attributes and queues an OwnerProfile
     * on that agency in `afterCreating`. Tests that need a different profile
     * type should call the explicit `withAgentProfile()` / `withBrokerProfile()`
     * states instead.
     */
    public function configure(): static
    {
        return $this->afterMaking(function (User $user): void {
            // Belt-and-suspenders: if the state-merge bypassed the User
            // mutator (some flows go through forceFill→setRawAttributes
            // directly) the legacy `agency_id` may still sit in the raw
            // attribute bag. Pull it out, stash it, and strip it before
            // save() tries to INSERT a missing column.
            $raw = $user->getAttributes();
            if (isset($raw['agency_id']) && $raw['agency_id'] !== null) {
                self::$legacyAgencyOverrides[spl_object_id($user)] = (int) $raw['agency_id'];
            }
            unset($raw['agency_id'], $raw['type']);
            $user->setRawAttributes($raw);
        });
        // The User model's `created` observer handles the actual profile
        // creation from the stash, so factory afterCreating no longer needs
        // a duplicate hook.
    }

    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }

    public function withOwnerProfile(Agency|int $agency): static
    {
        $agencyId = $agency instanceof Agency ? $agency->id : $agency;

        return $this->afterCreating(function (User $user) use ($agencyId): void {
            OwnerProfile::factory()->create([
                'user_id' => $user->id,
                'agency_id' => $agencyId,
            ]);
        });
    }

    public function withAgentProfile(Agency|int $agency): static
    {
        $agencyId = $agency instanceof Agency ? $agency->id : $agency;

        return $this->afterCreating(function (User $user) use ($agencyId): void {
            AgentProfile::factory()->create([
                'user_id' => $user->id,
                'agency_id' => $agencyId,
            ]);
        });
    }

    public function withBrokerProfile(): static
    {
        return $this->afterCreating(function (User $user): void {
            BrokerProfile::factory()->create(['user_id' => $user->id]);
        });
    }

    public function withServiceProviderProfile(): static
    {
        return $this->afterCreating(function (User $user): void {
            ServiceProviderProfile::factory()->create(['user_id' => $user->id]);
        });
    }
}
