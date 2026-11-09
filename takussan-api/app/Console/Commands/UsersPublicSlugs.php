<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Public\PublicProfileFacts;
use App\Services\Public\PublicSlugService;
use Illuminate\Console\Command;

/**
 * TCK-2519 — pose (ou recalcule) le slug au nom de chaque fiche publique `/agents/{slug}`.
 *
 * Idempotente : {@see PublicSlugService::appliquer()} garde un slug déjà juste, donc une seconde
 * passe n'écrit rien. Elle sert trois fois :
 *
 * · le REMPLISSAGE des fiches existantes, une fois, après la migration `2026_11_09_100010` ;
 * · la PREMIÈRE fiche d'un compte (première annonce publique, inscription à l'annuaire, profil
 *   d'agent) : jusqu'à ce passage, la fiche se résout par `username`, puis redirige en 301 ;
 * · le CHANGEMENT DE RÔLE (un propriétaire devient agent : `awa-d` → `awa-diop`), que le crochet
 *   de nom de `User` ne voit pas.
 *
 * Le rôle de chaque lot est lu en UNE requête ({@see PublicProfileFacts::rolesPublics()}).
 */
class UsersPublicSlugs extends Command
{
    protected $signature = 'users:public-slugs {--dry-run : Compter sans écrire}';

    protected $description = 'Pose ou recalcule le slug au nom des fiches publiques /agents/{slug} (idempotente).';

    public function handle(PublicSlugService $slugs): int
    {
        $ecrits = 0;
        $vus = 0;
        $dry = (bool) $this->option('dry-run');

        $slugs->comptesAvecFiche()->chunkById(200, function ($lot) use ($slugs, $dry, &$ecrits, &$vus) {
            $roles = PublicProfileFacts::rolesPublics($lot->map(fn (User $u) => (int) $u->id)->all());
            foreach ($lot as $user) {
                /** @var User $user */
                $vus++;
                $role = $roles[(int) $user->id] ?? 'owner';
                $change = $dry ? $slugs->appliquer($user, $role) : $slugs->assigner($user, $role);
                if ($change) {
                    $ecrits++;
                }
            }
        }, 'users.id', 'id');

        $this->info("users:public-slugs — {$vus} fiche(s) vue(s), {$ecrits} slug(s) ".($dry ? 'à écrire' : 'écrit(s)').'.');

        return self::SUCCESS;
    }
}
