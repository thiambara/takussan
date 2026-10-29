<?php

namespace App\Jobs\Radar;

use App\Exceptions\ApiError;
use App\Models\Agency;
use App\Models\Enums\RadarListingStage;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\User;
use App\Services\Radar\RadarClaims;
use App\Services\Radar\RadarPhotoReserve;
use App\Services\Radar\RadarPublisher;
use DateTimeInterface;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Support\Facades\Log;

/**
 * TCK-2390 (ADR-0077 §3, §6) — la publication des annonces qu'un annonceur vient de réclamer ({@see RadarClaims}), dans son
 * espace, par {@see RadarPublisher::publishClaimed()}. Mis en file APRÈS le commit de la réclamation : les photos d'une
 * annonce-URL ne se lisent qu'une fois l'accord donné ({@see PrepareRadarListingPhotos}, décision 3a), le job attend donc la
 * fin de leur préparation en se relâchant.
 *
 * Publie ce qui est prêt — `consented`, une photo en réserve au moins, aucun champ requis manquant —, par lots sous
 * `radar.publish.max_photos`. Ce qui ne l'est pas (aucune photo à la source, un champ effacé) reste `consented` : le
 * super-admin le reprend par l'écran de publication. Un refus de la publication (quota de l'espace, compte devenu
 * indisponible, STOP entre-temps) se journalise par son code, jamais par un numéro, et n'est pas rejoué : l'état de départ
 * reste lisible par l'opérateur.
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
        if ($listings->isEmpty() || $advertiser === null || $user === null || $agency === null) {
            return;
        }

        if ($listings->contains(fn (RadarListing $listing) => $listing->photoPreparationStatus()['status'] === 'pending')) {
            $this->release(self::WAIT_SECONDS);

            return;
        }

        $ready = $listings->filter(fn (RadarListing $listing) => $reserve->count($listing) > 0 && RadarPublisher::missingFields($listing) === []);

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
        }
    }
}
