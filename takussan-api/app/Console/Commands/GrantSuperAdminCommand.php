<?php

namespace App\Console\Commands;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\Profiles\PlatformProfile;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\PermissionRegistrar;

/**
 * TCK-278 — Octroie un PlatformProfile(level = super_admin) à un user
 * existant, à partir de son email. Idempotent : si le user a déjà un
 * profil plateforme, on le promeut au niveau super_admin et on lève le
 * `revoked_at` éventuel.
 *
 * Pendant la fenêtre de coexistence (P1 → P3), assigne aussi le rôle
 * spatie `super_admin` sous `team_id = null` pour que les checks
 * `User::isSuperAdmin()` historiques restent vrais.
 */
class GrantSuperAdminCommand extends Command
{
    protected $signature = 'platform:grant-super-admin {email : Email du user à promouvoir}';

    protected $description = 'Crée ou réactive un PlatformProfile super_admin pour un user existant (idempotent).';

    public function handle(): int
    {
        $email = strtolower(trim((string) $this->argument('email')));

        $user = User::query()->where('email', $email)->first();
        if ($user === null) {
            $this->error("Aucun user trouvé pour l'email {$email}.");

            return self::FAILURE;
        }

        DB::transaction(function () use ($user): void {
            /** @var PlatformProfile $profile */
            $profile = PlatformProfile::query()->firstOrNew(['user_id' => $user->id]);
            $profile->level = PlatformProfileLevel::SuperAdmin;
            $profile->revoked_at = null;
            if (! $profile->exists) {
                $profile->granted_at = now();
            }
            $profile->save();

            // Coexistence P1/P2 : conserver le rôle spatie super_admin pour
            // que les sites d'appel encore basés sur `hasRole('super_admin')`
            // continuent à passer. Le cutover P3 droppera ces tables.
            if (method_exists($user, 'assignRole')) {
                $registrar = app(PermissionRegistrar::class);
                $previous = $registrar->getPermissionsTeamId();
                $registrar->setPermissionsTeamId(null);
                try {
                    if (! $user->hasRole('super_admin')) {
                        $user->assignRole('super_admin');
                    }
                } finally {
                    $registrar->setPermissionsTeamId($previous);
                    $user->unsetRelation('roles');
                }
            }
        });

        $this->info("PlatformProfile super_admin actif pour {$email}.");

        return self::SUCCESS;
    }
}
