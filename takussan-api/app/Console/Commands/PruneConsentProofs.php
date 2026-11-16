<?php

namespace App\Console\Commands;

use App\Models\ConsentProof;
use App\Models\User;
use Illuminate\Console\Command;

/**
 * TCK-537 — la politique de confidentialité (§ 6) garde les consentements « le temps du consentement,
 * puis 5 ans pour pouvoir en justifier ». Le consentement d'un compte court tant que le compte vit ;
 * il prend fin à l'effacement du compte (`users.deleted_at`, posée par `AccountDeletionService`).
 * Au-delà de {@see self::RETENTION_YEARS} ans après cette fin, la preuve (`consent_proofs`, avec son
 * adresse IP) est supprimée ; une preuve sans compte (ligne `users` disparue) se juge sur sa date.
 * Idempotente : une suppression par date, qu'une seconde exécution trouve vide.
 */
class PruneConsentProofs extends Command
{
    public const RETENTION_YEARS = 5;

    protected $signature = 'account:prune-consent-proofs';

    protected $description = 'Supprime les preuves de consentement des comptes effacés depuis plus de 5 ans.';

    public function handle(): int
    {
        $before = now()->subYears(self::RETENTION_YEARS);

        $deleted = ConsentProof::query()
            ->where(fn ($q) => $q
                ->whereIn('user_id', User::onlyTrashed()->where('deleted_at', '<', $before)->select('id'))
                ->orWhere(fn ($orphan) => $orphan->whereNull('user_id')->where('accepted_at', '<', $before)))
            ->delete();

        $this->info("account:prune-consent-proofs — preuves supprimées : {$deleted}");

        return self::SUCCESS;
    }
}
