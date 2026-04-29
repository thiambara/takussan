<?php

namespace Database\Seeders\Support;

use App\Models\Agency;
use App\Models\Enums\UserStatus;
use App\Models\Enums\UserType;
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
            'type' => UserType::Admin,
            'agency_id' => null,
        ],
        [
            'email' => 'admin@demo.takussan.sn',
            'username' => 'agencyadmin',
            'first_name' => 'Agency',
            'last_name' => 'Admin',
            'role' => 'agency_admin',
            'type' => UserType::Admin,
        ],
        [
            'email' => 'agent@demo.takussan.sn',
            'username' => 'agent',
            'first_name' => 'Demo',
            'last_name' => 'Agent',
            'role' => 'agent',
            'type' => UserType::Agent,
        ],
        [
            'email' => 'owner@demo.takussan.sn',
            'username' => 'owner',
            'first_name' => 'Property',
            'last_name' => 'Owner',
            'role' => 'owner',
            'type' => UserType::Individual,
        ],
        [
            'email' => 'provider@demo.takussan.sn',
            'username' => 'provider',
            'first_name' => 'Service',
            'last_name' => 'Provider',
            'role' => 'service_provider',
            'type' => UserType::ServiceProvider,
        ],
        [
            'email' => 'customer@demo.takussan.sn',
            'username' => 'customer',
            'first_name' => 'Demo',
            'last_name' => 'Customer',
            'role' => 'customer',
            'type' => UserType::Individual,
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
                'type' => $userData['type'],
                'status' => UserStatus::Active,
                'email_verified_at' => now(),
                'password' => Hash::make(self::DEFAULT_PASSWORD),
                'preferred_language' => 'fr',
                'timezone' => 'Africa/Dakar',
                'agency_id' => $agency->id,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        $user->assignRole($userData['role']);
        $this->ctx->registerUser($user);
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
                'type' => $superAdminData['type'],
                'status' => UserStatus::Active,
                'email_verified_at' => now(),
                'password' => Hash::make(self::DEFAULT_PASSWORD),
                'preferred_language' => 'fr',
                'timezone' => 'Africa/Dakar',
                'agency_id' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        $user->assignRole('super_admin');
        $this->ctx->systemUsers->push($user);
    }
}
