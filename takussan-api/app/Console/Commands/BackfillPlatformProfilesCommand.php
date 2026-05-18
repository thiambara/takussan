<?php

namespace App\Console\Commands;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\Profiles\PlatformProfile;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\PermissionRegistrar;

/**
 * TCK-278 — Pre-deploy backfill : pour chaque user portant le rôle spatie
 * `super_admin` (assigné sous `team_id = null`), crée un PlatformProfile
 * actif niveau `super_admin` si absent. Idempotent : ne touche pas les
 * profils existants.
 *
 * Audit additionnel : compte les users portant les rôles spatie agence
 * (`agency_admin`, `agent`, `owner`, `service_provider`) qui n'ont pas le
 * profil polymorphe correspondant. **Le rapport n'auto-corrige pas** —
 * il alerte l'opérateur sur des écarts à investiguer avant le cutover P3.
 */
class BackfillPlatformProfilesCommand extends Command
{
    protected $signature = 'platform:backfill-from-spatie {--dry-run : N\'écrit rien, affiche seulement le rapport}';

    protected $description = 'Backfill des PlatformProfile depuis les rôles spatie super_admin + audit de cohérence rôles/profils.';

    public function handle(): int
    {
        $registrar = app(PermissionRegistrar::class);
        $previous = $registrar->getPermissionsTeamId();
        $registrar->setPermissionsTeamId(null);

        $dryRun = (bool) $this->option('dry-run');
        $created = 0;
        $skipped = 0;

        try {
            $superAdmins = User::query()
                ->whereHas('roles', fn ($q) => $q->where('name', 'super_admin'))
                ->get();

            foreach ($superAdmins as $user) {
                $existing = PlatformProfile::query()->where('user_id', $user->id)->first();
                if ($existing !== null) {
                    $skipped++;

                    continue;
                }

                if (! $dryRun) {
                    DB::transaction(fn () => PlatformProfile::create([
                        'user_id' => $user->id,
                        'level' => PlatformProfileLevel::SuperAdmin,
                        'granted_at' => now(),
                        'notes' => 'Backfill TCK-278 depuis rôle spatie super_admin',
                    ]));
                }
                $created++;
            }
        } finally {
            $registrar->setPermissionsTeamId($previous);
        }

        $this->info(sprintf(
            'Backfill super_admin : %d créés, %d déjà présents%s.',
            $created,
            $skipped,
            $dryRun ? ' (dry-run, rien n\'a été écrit)' : '',
        ));

        $this->auditAgencyRoleCoherence();

        return self::SUCCESS;
    }

    /**
     * Compte les users portant un rôle spatie agence sans le profil
     * polymorphe correspondant. Indicateur pour l'opérateur — le cutover
     * P3 supposera ces écarts résolus.
     */
    private function auditAgencyRoleCoherence(): void
    {
        $checks = [
            ['role' => 'agency_admin', 'relation' => 'agencyAdminProfiles'],
            ['role' => 'agent', 'relation' => 'agentProfiles'],
            ['role' => 'owner', 'relation' => 'ownerProfiles'],
        ];

        $this->line('');
        $this->line('Audit cohérence rôles spatie → profils polymorphes :');

        foreach ($checks as $check) {
            $orphans = User::query()
                ->whereHas('roles', fn ($q) => $q->where('name', $check['role']))
                ->whereDoesntHave($check['relation'])
                ->count();

            $this->line(sprintf(
                '  - rôle « %s » sans profil correspondant : %d user%s',
                $check['role'],
                $orphans,
                $orphans > 1 ? 's' : '',
            ));
        }
    }
}
