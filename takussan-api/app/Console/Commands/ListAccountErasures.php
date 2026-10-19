<?php

namespace App\Console\Commands;

use App\Models\AccountDeletionRequest;
use App\Models\Enums\UserStatus;
use App\Models\User;
use App\Services\Account\AccountDeletionService;
use App\Services\Account\ErasureLedger;
use App\Support\Logging\SafeExceptionContext;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * TCK-885 (ADR-0044, amendement du 2026-10-18, § B) — lit la liste des effacements tenue HORS de la
 * base ({@see ErasureLedger}) et dit, pour chaque compte, ce que la base COURANTE en garde :
 *
 *  - `effacé`       : le compte est anonymisé (`status = deleted`) — rien à faire ;
 *  - `absent`       : la base ne connaît pas ce compte (sauvegarde antérieure à sa création) ;
 *  - `à ré-effacer` : le compte est en clair — une restauration l'a ramené.
 *
 * `--execute` ré-efface les comptes `à ré-effacer`, par le même chemin que l'effacement d'origine
 * (`AccountDeletionService::executeDeletion()`), sans renvoyer le courriel de confirmation : le
 * titulaire l'a déjà reçu. La demande d'effacement, que la restauration a pu emporter, est recréée
 * datée de l'effacement d'origine. Idempotent : un second passage ne trouve plus rien à faire.
 *
 * C'est le point 5 de la procédure « Après une restauration » de `docs/infra/hebergement.md`.
 */
class ListAccountErasures extends Command
{
    protected $signature = 'account:list-erasures
        {--since= : Instant restauré (UTC, AAAA-MM-JJ ou ISO 8601) — seuls les effacements à partir de cet instant sont lus}
        {--execute : Ré-efface les comptes que la base courante a en clair}';

    protected $description = 'List account erasures recorded outside the database, and replay them after a restore.';

    public const ETAT_EFFACE = 'effacé';

    public const ETAT_ABSENT = 'absent';

    public const ETAT_A_REEFFACER = 'à ré-effacer';

    public function handle(ErasureLedger $registre, AccountDeletionService $service): int
    {
        $since = null;
        if (($brut = $this->option('since')) !== null) {
            try {
                $since = CarbonImmutable::parse((string) $brut, 'UTC');
            } catch (Throwable) {
                $this->error("--since illisible : {$brut} (attendu : AAAA-MM-JJ ou ISO 8601, UTC).");

                return self::INVALID;
            }
        }

        $lecture = $registre->since($since);
        $executer = (bool) $this->option('execute');

        $lignes = [];
        $aReeffacer = [];
        $echecs = 0;

        foreach ($lecture['effacements'] as $entree) {
            $user = User::withTrashed()->find($entree['user_id']);
            $etat = $this->etat($user);

            if ($etat === self::ETAT_A_REEFFACER) {
                $aReeffacer[] = $entree['user_id'];

                if ($executer) {
                    try {
                        $this->reeffacer($service, $user, $entree['erased_at']);
                        $etat = self::ETAT_EFFACE.' (rejoué)';
                    } catch (Throwable $e) {
                        $echecs++;
                        $etat = 'ÉCHEC du rejeu';
                        Log::error('[account-erasures] rejeu en échec', [
                            'user_id' => $entree['user_id'],
                        ] + SafeExceptionContext::of($e));
                    }
                }
            }

            $lignes[] = [$entree['user_id'], $entree['erased_at']->format('Y-m-d\TH:i:s\Z'), $etat];
        }

        $this->table(['user_id', 'effacé le (UTC)', 'base courante'], $lignes);

        foreach ($lecture['illisibles'] as $cle) {
            $this->error("Objet illisible : {$cle}");
        }

        $this->info(sprintf(
            'account:list-erasures — lus=%d a_reeffacer=%d%s illisibles=%d%s',
            count($lecture['effacements']),
            count($aReeffacer),
            $executer ? ' rejoues='.(count($aReeffacer) - $echecs).' echecs='.$echecs : '',
            count($lecture['illisibles']),
            $since !== null ? ' depuis='.$since->format('Y-m-d\TH:i:s\Z') : '',
        ));

        if (! $executer && $aReeffacer !== []) {
            $this->line('À ré-effacer : '.implode(' ', $aReeffacer));
        }

        // Un objet illisible est un compte qu'on ne sait plus nommer : la procédure s'arrête là.
        return $echecs > 0 || $lecture['illisibles'] !== [] ? self::FAILURE : self::SUCCESS;
    }

    private function etat(?User $user): string
    {
        if ($user === null) {
            return self::ETAT_ABSENT;
        }

        return $user->status === UserStatus::Deleted ? self::ETAT_EFFACE : self::ETAT_A_REEFFACER;
    }

    private function reeffacer(AccountDeletionService $service, User $user, CarbonImmutable $effaceLe): void
    {
        $demande = AccountDeletionRequest::query()->firstOrNew(['user_id' => $user->id]);

        if (! $demande->exists) {
            // La restauration a emporté la demande (créée après l'instant restauré) : elle est
            // recréée, datée de l'effacement d'origine.
            $demande->forceFill([
                'requested_at' => $effaceLe,
                'scheduled_for' => $effaceLe,
            ])->save();
        } elseif ($demande->executed_at !== null) {
            // Demande scellée, compte en clair : la copie est incohérente. On rouvre pour rejouer.
            $demande->forceFill(['executed_at' => null])->save();
        }

        // Le compte peut être supprimé (soft delete) sans avoir été anonymisé : la relation par
        // défaut ne le résoudrait pas, et `executeDeletion()` scellerait sans rien effacer.
        $demande->setRelation('user', $user);

        $service->executeDeletion($demande, notifier: false);
    }
}
