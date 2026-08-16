<?php

namespace App\Console\Commands;

use App\Models\AgencyRole;
use App\Services\Membership\AgencySystemRoleSeeder;
use Illuminate\Console\Command;

/**
 * TCK-317 — aligne les rôles SYSTÈME de toutes les agences sur le catalogue
 * `SystemRoleCapabilities`.
 *
 * **Pourquoi cette commande existe.** TCK-279 a transformé une table de vérité
 * définie en code en lignes persistées, seedées une fois par agence. Le seed
 * n'était jamais rejoué : le jour où un cas est ajouté à `Capability`, les
 * agences créées AVANT ne l'auraient jamais reçu, celles créées APRÈS oui, et
 * rien ne l'aurait signalé. Mesuré le 2026-08-16 : retirer une ligne de
 * capacité puis rejouer `seed()` rendait 42 → 41, la capacité n'était pas
 * récupérée.
 *
 * **À lancer après tout déploiement qui ajoute un cas à `Capability`.** Elle
 * est idempotente et additive : la relancer sans rien à faire ne coûte qu'une
 * requête par rôle et n'écrit rien. `AgencySystemRoleSeeder::systemRoleFor()`
 * réconcilie désormais aussi au fil de l'eau — cette commande est le balayage
 * qui n'attend pas qu'une agence soit touchée par le trafic.
 *
 * ⚠️ Ne touche JAMAIS un rôle personnalisé (`is_system = false`) : s'écarter
 * du catalogue est exactement sa raison d'être.
 */
class MembershipReconcileSystemRoles extends Command
{
    protected $signature = 'membership:reconcile-system-roles
        {--agency= : restreindre à une agence}
        {--dry-run : afficher les écarts sans rien écrire}';

    protected $description = 'Aligne les rôles système des agences sur le catalogue de capacités (TCK-317)';

    public function handle(AgencySystemRoleSeeder $seeder): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $agency = $this->option('agency');

        $query = AgencyRole::query()->where('is_system', true)->orderBy('agency_id');
        if ($agency !== null && $agency !== '') {
            $query->where('agency_id', (int) $agency);
        }

        $rolesTouched = 0;
        $capabilitiesAdded = 0;
        $extras = 0;

        $query->chunkById(200, function ($roles) use ($seeder, $dryRun, &$rolesTouched, &$capabilitiesAdded, &$extras): void {
            foreach ($roles as $role) {
                $diff = $seeder->diff($role);

                if ($diff['extra'] !== []) {
                    $extras++;
                    // Signalé, jamais supprimé : cf. le docblock de
                    // `AgencySystemRoleSeeder::reconcile()`.
                    $this->warn(sprintf(
                        'agence %d · rôle %d (%s) porte %d capacité(s) HORS catalogue : %s',
                        $role->agency_id, $role->id, $role->name,
                        count($diff['extra']), implode(', ', $diff['extra']),
                    ));
                }

                if ($diff['missing'] === []) {
                    continue;
                }

                $rolesTouched++;
                $capabilitiesAdded += count($diff['missing']);
                $this->line(sprintf(
                    'agence %d · rôle %d (%s) · %d manquante(s) : %s',
                    $role->agency_id, $role->id, $role->name,
                    count($diff['missing']), implode(', ', $diff['missing']),
                ));

                if (! $dryRun) {
                    $seeder->reconcile($role);
                }
            }
        });

        $this->info($dryRun
            ? sprintf('[dry-run] %d rôle(s) à réconcilier, %d capacité(s) à ajouter.', $rolesTouched, $capabilitiesAdded)
            : sprintf('%d rôle(s) réconcilié(s), %d capacité(s) ajoutée(s).', $rolesTouched, $capabilitiesAdded));

        if ($extras > 0) {
            $this->warn(sprintf(
                '%d rôle(s) portent des capacités hors catalogue — non supprimées, à instruire.', $extras,
            ));
        }

        return self::SUCCESS;
    }
}
