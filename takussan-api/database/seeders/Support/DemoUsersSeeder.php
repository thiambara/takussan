<?php

namespace Database\Seeders\Support;

use App\Models\Agency;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\PermissionRegistrar;

/**
 * Génère des utilisateurs de test prédéfinis pour faciliter les démonstrations.
 *
 * Crée des comptes avec des identifiants connus pour chaque rôle,
 * permettant aux testeurs/démos de se connecter facilement.
 */
class DemoUsersSeeder extends Seeder
{
    public const DEFAULT_PASSWORD = 'password';

    /** @var array<int, array<string, mixed>> */
    private const DEMO_USERS = [
        [
            'email' => 'super@demo.takussan.sn',
            'username' => 'superadmin',
            'first_name' => 'Super',
            'last_name' => 'Admin',
            'role' => 'super_admin',
            'persona' => 'admin',
        ],
        [
            'email' => 'admin@demo.takussan.sn',
            'username' => 'agencyadmin',
            'first_name' => 'Agency',
            'last_name' => 'Admin',
            'role' => 'agency_admin',
            'persona' => 'admin',
        ],
        [
            'email' => 'agent@demo.takussan.sn',
            'username' => 'agent',
            'first_name' => 'Demo',
            'last_name' => 'Agent',
            'role' => 'agent',
            'persona' => 'agent',
        ],
        [
            'email' => 'owner@demo.takussan.sn',
            'username' => 'owner',
            'first_name' => 'Property',
            'last_name' => 'Owner',
            'role' => 'owner',
            'persona' => 'owner',
        ],
        [
            'email' => 'provider@demo.takussan.sn',
            'username' => 'provider',
            'first_name' => 'Service',
            'last_name' => 'Provider',
            'role' => 'service_provider',
            'persona' => 'service_provider',
        ],
        [
            'email' => 'customer@demo.takussan.sn',
            'username' => 'customer',
            'first_name' => 'Demo',
            'last_name' => 'Customer',
            'role' => 'customer',
            // Customers don't have a profile — their access is purely role-based.
            'persona' => null,
        ],
    ];

    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        if (! $this->ctx->config->includeDemoUsers) {
            return;
        }

        $this->command?->getOutput()?->writeln('  > Création des utilisateurs de démo...');

        $registrar = app(PermissionRegistrar::class);

        foreach ($this->ctx->agencies as $agency) {
            $registrar->setPermissionsTeamId($agency->id);

            foreach (self::DEMO_USERS as $userData) {
                // Ignorer super_admin pour les agences (il est global)
                if ($userData['role'] === 'super_admin') {
                    continue;
                }

                $this->createDemoUser($agency, $userData);
            }
        }

        // Créer le super admin global (sans agence)
        $this->createSuperAdmin();

        $this->command?->getOutput()?->writeln('  > Utilisateurs de démo créés.');
        foreach (self::DEMO_USERS as $userData) {
            $this->command?->getOutput()?->writeln("    Email: {$userData['email']} ({$userData['role']})");
        }
        $this->command?->getOutput()?->writeln('    Mot de passe: '.self::DEFAULT_PASSWORD);
    }

    /**
     * Crée un utilisateur de démo pour une agence.
     *
     * @param  array<string, mixed>  $userData
     */
    private function createDemoUser(Agency $agency, array $userData): void
    {
        $email = str_replace('@demo.takussan.sn', "@agency{$agency->id}.demo.takussan.sn", $userData['email']);

        $user = User::updateOrCreate(
            ['email' => $email],
            [
                'username' => $userData['username'].'.agency'.$agency->id,
                'first_name' => $userData['first_name'],
                'last_name' => $userData['last_name'],
                'status' => UserStatus::Active,
                'email_verified_at' => now(),
                'password' => Hash::make(self::DEFAULT_PASSWORD),
                'preferred_language' => 'fr',
                'timezone' => 'Africa/Dakar',
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        $user->assignRole($userData['role']);

        $this->ensureProfileFor($user, $agency, $userData['persona']);
        $this->ctx->registerUser($user, $userData['persona'], $agency->id);
    }

    /**
     * Crée le super admin global.
     */
    private function createSuperAdmin(): void
    {
        $superAdminData = collect(self::DEMO_USERS)->first(fn ($u) => $u['role'] === 'super_admin');

        if (! $superAdminData) {
            return;
        }

        app(PermissionRegistrar::class)->setPermissionsTeamId(null);

        $user = User::updateOrCreate(
            ['email' => $superAdminData['email']],
            [
                'username' => $superAdminData['username'],
                'first_name' => $superAdminData['first_name'],
                'last_name' => $superAdminData['last_name'],
                'status' => UserStatus::Active,
                'email_verified_at' => now(),
                'password' => Hash::make(self::DEFAULT_PASSWORD),
                'preferred_language' => 'fr',
                'timezone' => 'Africa/Dakar',
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        $user->assignRole('super_admin');
        $this->ctx->systemUsers->push($user);
    }

    private function ensureProfileFor(User $user, Agency $agency, ?string $persona): void
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
            'service_provider' => ServiceProviderProfile::query()->firstOrCreate(
                ['user_id' => $user->id],
            ),
            // TCK-271 — agency_admin demo user needs the materialized profile
            // for the active-profile resolver to pin the agency context. The
            // global super_admin (created via createSuperAdmin) is intentionally
            // skipped: it's not tied to an agency.
            'admin' => AgencyAdminProfile::query()->firstOrCreate(
                ['user_id' => $user->id, 'agency_id' => $agency->id],
                ['status' => AgencyAdminProfileStatus::Active->value],
            ),
            default => null,
        };
    }
}
