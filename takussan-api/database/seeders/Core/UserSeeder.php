<?php

namespace Database\Seeders\Core;

use App\Models\Agency;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\UserStatus;
use App\Models\Enums\UserType;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\BrokerAgencyCollaboration;
use App\Models\Profiles\BrokerProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Spatie\Permission\Exceptions\RoleDoesNotExist;
use Spatie\Permission\PermissionRegistrar;

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
                'type' => UserType::Admin,
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
        // Super admin is not tied to an agency. Assign the role with a null
        // team context so it resolves regardless of the active team.
        app(PermissionRegistrar::class)->setPermissionsTeamId(null);
        try {
            $user->syncRoles(['super_admin']);
        } catch (RoleDoesNotExist) {
            // RolesAndPermissionsSeeder must run before UserSeeder.
        }
        $this->ctx->registerUser($user);

        $avatarUrl = 'https://api.dicebear.com/7.x/avataaars/png?seed='.urlencode($user->username);
        $this->ctx->downloadMedia($user, $avatarUrl, 'avatar');
    }

    private function seedAgencyTeam(Agency $agency): void
    {
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);

        $slug = $agency->slug;
        $domain = parse_url((string) $agency->website, PHP_URL_HOST) ?? ($slug.'.sn');

        $admin = $this->createUser($agency, [
            'email' => "admin@{$domain}",
            'username' => "{$slug}-admin",
            'first_name' => 'Admin',
            'last_name' => $agency->name,
            'type' => UserType::Admin,
            'role' => 'agency_admin',
        ]);

        $agency->forceFill(['primary_admin_id' => $admin->id])->save();

        foreach (range(1, 4) as $i) {
            $this->createUser($agency, [
                'email' => "agent{$i}@{$domain}",
                'username' => "{$slug}-agent-{$i}",
                'first_name' => $this->ctx->faker()->senegaleseFirstName(),
                'last_name' => $this->ctx->faker()->senegaleseLastName(),
                'type' => UserType::Agent,
                'role' => 'agent',
            ]);
        }

        foreach (range(1, 10) as $i) {
            $this->createUser($agency, [
                'email' => "owner{$i}@{$domain}",
                'username' => "{$slug}-owner-{$i}",
                'first_name' => $this->ctx->faker()->senegaleseFirstName(),
                'last_name' => $this->ctx->faker()->senegaleseLastName(),
                'type' => UserType::Individual,
                'role' => 'owner',
            ]);
        }

        foreach (range(1, 5) as $i) {
            $this->createUser($agency, [
                'email' => "provider{$i}@{$domain}",
                'username' => "{$slug}-provider-{$i}",
                'first_name' => $this->ctx->faker()->senegaleseFirstName(),
                'last_name' => $this->ctx->faker()->senegaleseLastName(),
                'type' => UserType::ServiceProvider,
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
        unset($data['role']);

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
                'agency_id' => $agency->id,
                'remember_token' => Str::random(10),
                'created_at' => $createdAt,
                'updated_at' => $createdAt,
            ]),
        );
        $user->forceFill(['email_verified_at' => $createdAt])->save();

        if ($role) {
            try {
                $user->syncRoles([$role]);
            } catch (RoleDoesNotExist) {
                // Role not defined for this team — safe to skip in the seeder.
            }
        }

        $this->ctx->registerUser($user);

        $this->seedProfileFor($user, $agency);

        $avatarUrl = 'https://api.dicebear.com/7.x/avataaars/png?seed='.urlencode($user->username);
        $this->ctx->downloadMedia($user, $avatarUrl, 'avatar');

        return $user;
    }

    /**
     * TCK-140 — projects the legacy `type` + `agency_id` onto the new
     * polymorphic profiles in addition to the legacy columns. Admins get
     * no profile; their authority is fully represented by spatie roles.
     */
    private function seedProfileFor(User $user, Agency $agency): void
    {
        match ($user->type) {
            UserType::Individual => OwnerProfile::query()->firstOrCreate(
                ['user_id' => $user->id, 'agency_id' => $agency->id],
                ['status' => OwnerProfileStatus::Active->value],
            ),
            UserType::Agent => AgentProfile::query()->firstOrCreate(
                ['user_id' => $user->id, 'agency_id' => $agency->id],
                ['status' => AgentProfileStatus::Active->value],
            ),
            UserType::Broker => $this->seedBrokerProfile($user, $agency),
            UserType::ServiceProvider => $this->seedServiceProviderProfile($user, $agency),
            UserType::Admin, null => null,
        };
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
