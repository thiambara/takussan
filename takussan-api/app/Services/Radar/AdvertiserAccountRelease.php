<?php

namespace App\Services\Radar;

use App\Models\Enums\RadarConsentProof;
use App\Models\RadarAdvertiser;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2413 (ADR-0077 §3, §11) — délier l'annonceur du compte qui lui est rattaché, une fois ce compte supprimé : celui que
 * le Radar a créé pour lui (« Publier pour lui »), ou celui avec lequel il a réclamé ses annonces ({@see self::claimedWith()}).
 * Tant que `user_id` vise un compte supprimé, la réclamation rend `support` (un autre compte a vérifié le numéro : le compte
 * supprimé n'est pas « jamais servi », {@see RadarClaims::state()}) ou `unavailable` (personne d'autre) — et rien ne le remet
 * à zéro. Délié, l'annonceur réclame comme s'il n'avait jamais eu de compte : par le compte qui a vérifié son numéro, ou par
 * un compte neuf.
 *
 * **Ne passe jamais outre un retrait** : un annonceur révoqué ({@see ClaimLinks::revoked()} — STOP, `do_not_contact`, accord
 * retiré, numéro purgé) ne se délie pas. **Ne délie qu'un compte supprimé** : un compte bloqué, ou dont l'espace est suspendu,
 * est une décision du support que le geste ne défait pas. Le compte supprimé reste supprimé, ses biens où ils sont.
 *
 * Pas de prise en charge exigée, comme la révocation ({@see AdvertiserRevocation}) : le geste n'est pas un démarchage.
 */
final class AdvertiserAccountRelease
{
    /** @return array{advertiser: RadarAdvertiser, previous_user_id: int} */
    public function release(RadarAdvertiser $advertiser, ?string $reason, User $by): array
    {
        return DB::transaction(function () use ($advertiser, $reason, $by): array {
            $locked = RadarAdvertiser::query()->whereKey($advertiser->getKey())->lockForUpdate()->firstOrFail();
            abort_code_if(ClaimLinks::revoked($locked), 409, 'radar.advertiser.do_not_contact');
            abort_code_unless(self::deletedAccount($locked), 409, 'radar.advertiser.account_not_deleted');

            $previous = (int) $locked->user_id;
            $locked->forceFill(['user_id' => null])->save();

            activity('Admin')
                ->causedBy($by)
                ->performedOn($locked)
                ->withProperties(array_filter([
                    'advertiser_id' => $locked->id,
                    'previous_user_id' => $previous,
                    'reason' => $reason,
                ], fn (mixed $value) => $value !== null))
                ->event('radar_account_released')
                ->log('Annonceur du Radar délié de son compte supprimé');

            return ['advertiser' => $locked, 'previous_user_id' => $previous];
        });
    }

    /** Le compte rattaché est supprimé (doucement) : le seul cas que le geste défait. */
    public static function deletedAccount(RadarAdvertiser $advertiser): bool
    {
        return $advertiser->user_id !== null
            && User::onlyTrashed()->whereKey($advertiser->user_id)->exists();
    }

    /**
     * Le compte rattaché est celui avec lequel l'annonceur a réclamé ses annonces : un accord `otp` qu'il a déposé
     * ({@see RadarClaims::recordProof()}). Sinon, c'est le compte que le Radar a créé ({@see AdvertiserProvisioner}) : seuls
     * ces deux chemins écrivent `user_id`. La purge efface le contenu d'un accord, jamais sa ligne ni son déposant ({@see RadarPurger}).
     */
    public static function claimedWith(RadarAdvertiser $advertiser): bool
    {
        return $advertiser->user_id !== null
            && $advertiser->consents()
                ->where('proof', RadarConsentProof::Otp->value)
                ->where('deposited_by_id', $advertiser->user_id)
                ->exists();
    }

    /** Ce que la fiche offre : un compte supprimé, sur un annonceur qu'aucun retrait ne ferme. */
    public static function releasable(RadarAdvertiser $advertiser): bool
    {
        return self::deletedAccount($advertiser) && ! ClaimLinks::revoked($advertiser);
    }
}
