<?php

namespace Database\Seeders\Support;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\UserStatus;
use App\Models\Lease;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * TCK-2684 (AC8) — un compte de démonstration LOCATAIRE, à adresse stable.
 *
 * `customer@agency1.demo.takussan.sn` n'a aucun bail : la coque de `/app` lui donne le menu d'un
 * client (« Favoris · Visites »). Les comptes qui ont un bail actif dans le jeu de démo ont des
 * adresses tirées au hasard, qu'aucun outil ne peut citer. Ce seeder rattache un compte
 * `locataire@agency<id>.demo.takussan.sn` (mot de passe de démo) au locataire d'un bail ACTIF de la
 * première agence standard, dont le dossier client n'a pas de compte. Le bail, ses échéances, ses
 * interventions et ses états des lieux sont ceux du jeu de démo : rien n'est inventé.
 *
 * Le compte ne reçoit AUCUN profil d'agence : ses types sont `customer` et `tenant`, et la coque
 * résout la persona `locataire` (« Paiements · Maintenance »).
 *
 * Idempotent et ciblé : `php artisan db:seed --class='Database\Seeders\Support\DemoTenantSeeder'`
 * se rejoue sur la base de démo, sans `migrate:fresh`. Un compte qui a déjà un bail en cours ne
 * bouge pas ; sans bail éligible, rien n'est créé.
 */
class DemoTenantSeeder extends Seeder
{
    public const EMAIL = 'locataire@agency%d.demo.takussan.sn';

    public function run(): void
    {
        $agency = Agency::query()->where('kind', AgencyKind::Standard)->orderBy('id')->first();
        if ($agency === null) {
            $this->command?->warn('  > DemoTenantSeeder : aucune agence standard, rien à faire.');

            return;
        }

        $email = sprintf(self::EMAIL, $agency->id);
        $user = User::query()->where('email', $email)->first();
        if ($user !== null && $user->hasActiveTenantLease()) {
            $this->command?->getOutput()?->writeln("  > Locataire de démo déjà en place : {$email}");

            return;
        }

        $lease = Lease::query()
            ->where('agency_id', $agency->id)
            ->where('status', LeaseStatus::Active->value)
            ->whereHas('tenant', fn ($q) => $q->whereNull('user_id'))
            // Le bail le plus fourni d'abord : les écrans du locataire (paiements, interventions)
            // ont de quoi s'afficher. L'id départage, pour qu'un semis donné rende toujours le même.
            ->withCount(['payments', 'maintenanceRequests'])
            ->orderByDesc('payments_count')
            ->orderByDesc('maintenance_requests_count')
            ->orderBy('id')
            ->first();
        if ($lease === null) {
            $this->command?->warn("  > DemoTenantSeeder : aucun bail actif sans compte dans l'agence {$agency->id}.");

            return;
        }

        /** @var Customer $customer */
        $customer = $lease->tenant;
        $user ??= User::query()->create([
            'email' => $email,
            'username' => 'locataire.agency'.$agency->id,
            'first_name' => $customer->first_name ?: 'Locataire',
            'last_name' => $customer->last_name ?: 'Démo',
            'status' => UserStatus::Active,
            'email_verified_at' => now(),
            'password' => Hash::make(DemoUsersSeeder::DEFAULT_PASSWORD),
            'preferred_language' => 'fr',
            'timezone' => 'Africa/Dakar',
        ]);
        $customer->forceFill(['user_id' => $user->id])->save();

        $this->command?->getOutput()?->writeln("  > Locataire de démo : {$email} (bail {$lease->reference_number})");
    }
}
