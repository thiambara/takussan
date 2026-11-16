<?php

namespace App\Services\Auth;

use App\Models\CalendarFeed;
use App\Models\User;
use App\Services\Calendar\CalendarFeedService;
use Illuminate\Support\Facades\DB;

/**
 * TCK-617 (ADR-0034, amendement du 2026-11-16) — LE point par lequel un geste de révocation coupe
 * les jetons Sanctum d'un compte : il coupe aussi, dans la même transaction, ses liens d'agenda.
 *
 * Un lien `.ics` ne porte pas de session : créé avec un jeton volé, il livrait l'agenda (clients,
 * adresses, horaires) bien après que le titulaire eut réinitialisé son mot de passe ou révoqué la
 * session. Le lien ne dit pas quelle session l'a créé : toute révocation les emporte tous, et le
 * titulaire en recrée un d'un geste.
 *
 * `tests/Feature/Auth/AccountTokenRevokerGuardTest` rougit sur toute suppression de jetons écrite
 * hors d'ici (décision du porteur, 2026-11-16 : TOUS les gestes de révocation coupent l'agenda).
 * Seuls la déconnexion (le titulaire ferme SA session) et la fin d'une impersonation (lecture seule,
 * ADR-0055 § 3 : elle ne peut créer aucun lien) n'y passent pas, et la garde le dit.
 */
class AccountTokenRevoker
{
    /**
     * Tous les jetons du compte, sauf `$exceptTokenId` (la session de l'opérateur qui agit sur son
     * propre compte), et tous ses liens d'agenda. Rend le nombre de jetons supprimés.
     */
    public function revokeAll(User $user, ?int $exceptTokenId = null): int
    {
        return DB::transaction(function () use ($user, $exceptTokenId): int {
            $tokens = $user->tokens();
            if ($exceptTokenId !== null) {
                $tokens->where('id', '!=', $exceptTokenId);
            }
            $revoked = $tokens->delete();

            $this->revokeFeeds($user);

            return $revoked;
        });
    }

    /**
     * Un seul jeton du compte — la session qu'on sait volée — et tous ses liens d'agenda : on ne sait
     * pas laquelle a créé le lien. Rend le nombre de jetons supprimés (0 : jeton inconnu du compte,
     * et rien n'est touché).
     */
    public function revokeOne(User $user, int $tokenId): int
    {
        return DB::transaction(function () use ($user, $tokenId): int {
            $revoked = $user->tokens()->whereKey($tokenId)->delete();
            if ($revoked > 0) {
                $this->revokeFeeds($user);
            }

            return $revoked;
        });
    }

    /** Les liens d'agenda actifs du compte, toutes agences : l'écriture commune de toute révocation. */
    public function revokeFeeds(User $user): int
    {
        return CalendarFeed::query()->active()->where('user_id', $user->id)->update(CalendarFeedService::revocation());
    }
}
