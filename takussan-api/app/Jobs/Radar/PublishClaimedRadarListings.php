<?php

namespace App\Jobs\Radar;

use App\Exceptions\ApiError;
use App\Models\Agency;
use App\Models\Enums\RadarListingStage;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\User;
use App\Services\Radar\AdvertiserProvisioner;
use App\Services\Radar\ClaimLinks;
use App\Services\Radar\RadarClaims;
use App\Services\Radar\RadarPhotoReserve;
use App\Services\Radar\RadarPublisher;
use DateTimeInterface;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * TCK-2390 (ADR-0077 §3, §6) — la publication des annonces qu'un annonceur vient de réclamer ({@see RadarClaims}), dans son
 * espace, par {@see RadarPublisher::publishClaimed()}. Mis en file APRÈS le commit de la réclamation : les photos d'une
 * annonce-URL ne se lisent qu'une fois l'accord donné ({@see PrepareRadarListingPhotos}, décision 3a), le job attend donc la
 * fin de leur préparation en se relâchant.
 *
 * **Idempotent** : seules les annonces encore `consented` se lisent, l'étape se rejuge sous verrou dans
 * {@see RadarPublisher::publishClaimed()}, et deux exécutions ne se chevauchent pas pour un annonceur — rejoué, le job ne publie
 * rien deux fois. **Jamais sans l'accord `otp`** valide de l'annonceur au moment où il s'exécute (décision 2a) : un STOP ou une
 * révocation arrête tout.
 *
 * Publie ce qui est prêt — `consented`, une photo en réserve au moins, aucun champ requis manquant —, par lots sous
 * `radar.publish.max_photos`. Ce qui ne l'est pas (aucune photo à la source, un champ effacé) reste `consented` : le
 * super-admin le reprend par l'écran de publication. Un refus de la publication (quota de l'espace, compte devenu
 * indisponible, STOP entre-temps) se journalise par son code, jamais par un numéro, et n'est pas rejoué : l'état de départ
 * reste lisible par l'opérateur.
 *
 * TCK-2413 — **ce qu'il laisse porte sa raison** dans `stage_reason` (un code : `radar.publish.no_photo`,
 * `radar.publish.missing_field`, le code du refus, ou {@see self::FAILED} quand le job abandonne) : la page de réclamation
 * cesse de la dire « en cours de publication », et la file `left_to_operator` de la console la montre. La publication par
 * l'opérateur remet le motif à `null`. Rien n'est posé après un STOP ou une révocation : l'annonce s'y ferme.
 *
 * ADR-0078 : `$timeout` + 5 s ≤ `retry_after` de `database` (90 s) ; `$failOnTimeout` faux.
 */
final class PublishClaimedRadarListings implements ShouldQueue
{
    use Queueable;

    /** L'attente entre deux regards sur la préparation des photos. */
    public const WAIT_SECONDS = 60;

    /** Au-delà de la fenêtre de la préparation des photos (qui finit `done`, abandon compris), plus rien n'est attendu. */
    public const WINDOW_SECONDS = PrepareRadarListingPhotos::WINDOW_SECONDS + 3600;

    /** TCK-2413 — le job a abandonné (fenêtre écoulée, échec) sans pouvoir dire mieux : l'annonce revient à l'opérateur. */
    public const FAILED = 'radar.claim.publish_failed';

    public int $timeout = 85;

    public bool $failOnTimeout = false;

    /** @param  list<int>  $listingIds */
    public function __construct(
        public readonly int $advertiserId,
        public readonly int $userId,
        public readonly int $agencyId,
        public readonly array $listingIds,
    ) {}

    public function retryUntil(): DateTimeInterface
    {
        return now()->addSeconds(self::WINDOW_SECONDS);
    }

    /** @return list<object> */
    public function middleware(): array
    {
        return [(new WithoutOverlapping('radar-claim-'.$this->advertiserId))->releaseAfter(30)->expireAfter($this->timeout + 30)];
    }

    public function handle(RadarPublisher $publisher, RadarPhotoReserve $reserve): void
    {
        $listings = RadarListing::query()
            ->whereIn('id', $this->listingIds)
            ->where('radar_advertiser_id', $this->advertiserId)
            ->where('stage', RadarListingStage::Consented->value)
            ->orderBy('id')
            ->get();
        $advertiser = RadarAdvertiser::query()->find($this->advertiserId);
        $user = User::query()->find($this->userId);
        $agency = Agency::query()->find($this->agencyId);
        // Un STOP, un accord retiré ou un numéro purgé depuis la réclamation : plus rien ne s'attend ni ne se publie (décision 2a).
        if ($listings->isEmpty() || $advertiser === null || ClaimLinks::revoked($advertiser)) {
            return;
        }
        // Le compte ou l'espace de la réclamation a disparu depuis : rien ne s'y publie, l'opérateur reprend.
        if ($user === null || $agency === null) {
            $this->leave($listings->pluck('id')->all(), AdvertiserProvisioner::ACCOUNT_UNAVAILABLE);

            return;
        }

        if ($listings->contains(fn (RadarListing $listing) => $listing->photoPreparationStatus()['status'] === 'pending')) {
            $this->release(self::WAIT_SECONDS);

            return;
        }

        $ready = $listings->filter(fn (RadarListing $listing) => $reserve->count($listing) > 0 && RadarPublisher::missingFields($listing) === []);
        foreach ($listings->diff($ready) as $listing) {
            $this->leave([$listing->id], $reserve->count($listing) === 0 ? 'radar.publish.no_photo' : 'radar.publish.missing_field');
        }

        $max = (int) config('radar.publish.max_photos');
        $batch = [];
        $photos = 0;
        foreach ($ready as $listing) {
            $count = $reserve->count($listing);
            if ($batch !== [] && $photos + $count > $max) {
                $this->publish($publisher, $advertiser, $batch, $user, $agency);
                [$batch, $photos] = [[], 0];
            }
            $batch[] = (int) $listing->id;
            $photos += $count;
        }
        if ($batch !== []) {
            $this->publish($publisher, $advertiser, $batch, $user, $agency);
        }
    }

    /** @param  list<int>  $ids */
    private function publish(RadarPublisher $publisher, RadarAdvertiser $advertiser, array $ids, User $user, Agency $agency): void
    {
        try {
            $publisher->publishClaimed($advertiser, $ids, $user, $agency);
        } catch (ApiError $e) {
            Log::warning('radar.claim.publish_refused', [
                'advertiser_id' => $advertiser->id,
                'listing_ids' => $ids,
                'code' => $e->errorCode,
            ]);
            $this->leave($ids, $e->errorCode);
        }
    }

    /**
     * TCK-2413 — le job abandonne (sa fenêtre s'écoule pendant que des photos se préparent encore, ou une erreur) : ce qu'il
     * n'a ni publié ni déjà laissé revient à l'opérateur, sauf après un STOP ou une révocation.
     */
    public function failed(?Throwable $exception = null): void
    {
        $advertiser = RadarAdvertiser::query()->find($this->advertiserId);
        if ($advertiser === null || ClaimLinks::revoked($advertiser)) {
            return;
        }

        $left = RadarListing::query()
            ->whereIn('id', $this->listingIds)
            ->where('radar_advertiser_id', $this->advertiserId)
            ->where('stage', RadarListingStage::Consented->value)
            ->whereNull('stage_reason')
            ->get();
        foreach ($left as $listing) {
            $this->leave([$listing->id], $listing->photoPreparationStatus()['status'] === 'pending' ? 'radar.publish.photos_pending' : self::FAILED);
        }
    }

    /**
     * Laisse ces annonces à l'opérateur avec la raison : seulement si elles sont encore `consented` (une publication par
     * l'opérateur entre-temps les a fait passer `published`, motif effacé).
     *
     * @param  list<int>  $ids
     */
    private function leave(array $ids, string $reason): void
    {
        RadarListing::query()
            ->whereIn('id', $ids)
            ->where('stage', RadarListingStage::Consented->value)
            ->update(['stage_reason' => $reason]);
    }
}
