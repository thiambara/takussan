<?php

namespace Database\Seeders\Core;

use App\Models\Agency;
use App\Models\Enums\UserStatus;
use App\Models\Enums\UserType;
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
                'email_verified_at' => Timeline::seedStart(),
                'preferred_language' => 'fr',
                'timezone' => 'Africa/Dakar',
                'created_at' => Timeline::seedStart(),
                'updated_at' => Timeline::seedStart(),
            ],
        );
        // Super admin is global and not tied to a team; skip Spatie role
        // assignment (which requires an agency_id pivot).
        $this->ctx->registerUser($user);
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
                'type' => UserType::Owner,
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
                'email_verified_at' => $createdAt,
                'preferred_language' => 'fr',
                'timezone' => 'Africa/Dakar',
                'agency_id' => $agency->id,
                'remember_token' => Str::random(10),
                'created_at' => $createdAt,
                'updated_at' => $createdAt,
            ]),
        );

        if ($role) {
            try {
                $user->syncRoles([$role]);
            } catch (RoleDoesNotExist) {
                // Role not defined for this team — safe to skip in the seeder.
            }
        }

        $this->ctx->registerUser($user);

        return $user;
    }
}
