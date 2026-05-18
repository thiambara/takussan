<?php

namespace Database\Seeders\Core;

use App\Models\Agency;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\BrokerAgencyCollaboration;
use App\Models\Profiles\BrokerProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class UserSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        $this->seedSuperAdmin();

        foreach ($this->ctx->agencies as $agency) {
            $this->seedAgencyTeam($agency);
        }
    }

    private function seedSuperAdmin(): void
    {
        $user = User::updateOrCreate(
            ['email' => 'super@takussan.sn'],
            [
                'username' => 'super_admin',
                'first_name' => 'Takussan',
                'last_name' => 'SuperAdmin',
                'status' => UserStatus::Active,
                'phone' => '+221770000000',
                'password' => Hash::make('password'),
                'preferred_language' => 'fr',
                'timezone' => 'Africa/Dakar',
                'created_at' => Timeline::seedStart(),
                'updated_at' => Timeline::seedStart(),
            ],
        );
        $user->forceFill(['email_verified_at' => Timeline::seedStart()])->save();
        // TCK-278 — super_admin matérialisé via PlatformProfile (source de
        // vérité unique post-cutover).
        PlatformProfile::query()->firstOrCreate(
            ['user_id' => $user->id],
            [
                'level' => PlatformProfileLevel::SuperAdmin,
                'granted_at' => Timeline::seedStart(),
            ],
        );
        $this->ctx->registerUser($user);

        $avatarUrl = 'https://api.dicebear.com/7.x/avataaars/png?seed='.urlencode($user->username);
        $this->ctx->downloadMedia($user, $avatarUrl, 'avatar');
    }

    private function seedAgencyTeam(Agency $agency): void
    {
        $slug = $agency->slug;
        $domain = parse_url((string) $agency->website, PHP_URL_HOST) ?? ($slug.'.sn');

        $admin = $this->createUser($agency, [
            'email' => "admin@{$domain}",
            'username' => "{$slug}-admin",
            'first_name' => 'Admin',
            'last_name' => $agency->name,
            'persona' => 'admin',
            'role' => 'agency_admin',
        ]);

        $agency->forceFill(['primary_admin_id' => $admin->id])->save();

        foreach (range(1, 4) as $i) {
            $this->createUser($agency, [
                'email' => "agent{$i}@{$domain}",
                'username' => "{$slug}-agent-{$i}",
                'first_name' => $this->ctx->faker()->senegaleseFirstName(),
                'last_name' => $this->ctx->faker()->senegaleseLastName(),
                'persona' => 'agent',
                'role' => 'agent',
            ]);
        }

        foreach (range(1, 10) as $i) {
            $this->createUser($agency, [
                'email' => "owner{$i}@{$domain}",
                'username' => "{$slug}-owner-{$i}",
                'first_name' => $this->ctx->faker()->senegaleseFirstName(),
                'last_name' => $this->ctx->faker()->senegaleseLastName(),
                'persona' => 'owner',
                'role' => 'owner',
            ]);
        }

        foreach (range(1, 5) as $i) {
            $this->createUser($agency, [
                'email' => "provider{$i}@{$domain}",
                'username' => "{$slug}-provider-{$i}",
                'first_name' => $this->ctx->faker()->senegaleseFirstName(),
                'last_name' => $this->ctx->faker()->senegaleseLastName(),
                'persona' => 'service_provider',
                'role' => 'service_provider',
            ]);
        }
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function createUser(Agency $agency, array $data): User
    {
        $role = $data['role'] ?? null;
        $persona = $data['persona'] ?? null;
        unset($data['role'], $data['persona']);

        $createdAt = Timeline::randomDateBetween(
            Timeline::seedStart(),
            Timeline::seedStart()->addMonth(),
        );

        $user = User::updateOrCreate(
            ['email' => $data['email']],
            array_merge($data, [
                'status' => UserStatus::Active,
                'phone' => $this->ctx->faker()->senegalesePhoneNumber(),
                'password' => Hash::make('password'),
                'preferred_language' => 'fr',
                'timezone' => 'Africa/Dakar',
                'remember_token' => Str::random(10),
                'created_at' => $createdAt,
                'updated_at' => $createdAt,
            ]),
        );
        $user->forceFill(['email_verified_at' => $createdAt])->save();

        // TCK-278 — Le rôle est matérialisé via le profil polymorphe
        // (cf. seedProfileFor + Règle 5). Plus de spatie syncRoles ici.
        unset($role);
        $this->seedProfileFor($user, $agency, $persona);
        $this->ctx->registerUser($user, $persona, $agency->id);

        $avatarUrl = 'https://api.dicebear.com/7.x/avataaars/png?seed='.urlencode($user->username);
        $this->ctx->downloadMedia($user, $avatarUrl, 'avatar');

        return $user;
    }

    /**
     * Polymorphic profile creation driven by the persona string carried in the
     * seed payload. Since TCK-271, agency admins also get a materialized
     * {@see AgencyAdminProfile} so the cookie-based active profile resolver
     * can pin the agency context unambiguously and policies reading
     * `$user->agency_id` keep returning the correct value. Brokers and
     * service providers are user-scoped, so the agency only enters via the
     * collaboration pivot.
     */
    private function seedProfileFor(User $user, Agency $agency, ?string $persona): void
    {
        match ($persona) {
            'owner' => OwnerProfile::query()->firstOrCreate(
                ['user_id' => $user->id, 'agency_id' => $agency->id],
                ['status' => OwnerProfileStatus::Active->value],
            ),
            'agent' => AgentProfile::query()->firstOrCreate(
                ['user_id' => $user->id, 'agency_id' => $agency->id],
                ['status' => AgentProfileStatus::Active->value],
            ),
            'broker' => $this->seedBrokerProfile($user, $agency),
            'service_provider' => $this->seedServiceProviderProfile($user, $agency),
            'admin' => $this->seedAgencyAdminProfile($user, $agency),
            null => null,
            default => null,
        };
    }

    private function seedAgencyAdminProfile(User $user, Agency $agency): AgencyAdminProfile
    {
        return AgencyAdminProfile::query()->firstOrCreate(
            ['user_id' => $user->id, 'agency_id' => $agency->id],
            ['status' => AgencyAdminProfileStatus::Active->value],
        );
    }

    private function seedBrokerProfile(User $user, Agency $agency): void
    {
        $broker = BrokerProfile::query()->firstOrCreate(
            ['user_id' => $user->id],
            ['license_number' => 'BRK-'.strtoupper(Str::random(8)).'-'.$user->id],
        );
        BrokerAgencyCollaboration::query()->firstOrCreate(
            ['broker_profile_id' => $broker->id, 'agency_id' => $agency->id],
            [
                'status' => CollaborationStatus::Active->value,
                'started_at' => $user->created_at?->toDateString() ?? now()->toDateString(),
            ],
        );
    }

    private function seedServiceProviderProfile(User $user, Agency $agency): void
    {
        $sp = ServiceProviderProfile::query()->firstOrCreate(
            ['user_id' => $user->id],
            [],
        );
        ServiceProviderAgencyCollaboration::query()->firstOrCreate(
            ['service_provider_profile_id' => $sp->id, 'agency_id' => $agency->id],
            [
                'status' => CollaborationStatus::Active->value,
                'started_at' => $user->created_at?->toDateString() ?? now()->toDateString(),
            ],
        );
    }
}
