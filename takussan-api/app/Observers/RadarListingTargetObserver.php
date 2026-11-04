<?php

namespace App\Observers;

use App\Models\RadarListing;
use App\Services\Radar\Targets\RadarTargetLinker;
use Illuminate\Contracts\Events\ShouldHandleEventsAfterCommit;
use Throwable;

/**
 * TCK-2468 (ADR-0087 §5) — une annonce qui ENTRE à l'étape `extracted` (fin de `ExtractRadarListing`) ou `reviewed`
 * (relecture validée) est rattachée aux cibles actives dont elle remplit les critères ({@see RadarTargetLinker}).
 *
 * Après le commit (`ShouldHandleEventsAfterCommit`) : la transaction courte de l'extraction n'est pas élargie, et une
 * extraction annulée ne rattache rien. Un échec du rattachement est rapporté et n'atteint pas l'appelant : l'annonce est
 * déjà écrite, et la relecture la rattachera de nouveau.
 */
class RadarListingTargetObserver implements ShouldHandleEventsAfterCommit
{
    public function __construct(private readonly RadarTargetLinker $linker) {}

    public function saved(RadarListing $listing): void
    {
        if (! $listing->wasChanged('stage') && ! $listing->wasRecentlyCreated) {
            return;
        }
        if (! in_array($listing->stage, RadarTargetLinker::STAGES, true)) {
            return;
        }

        try {
            $this->linker->link($listing);
        } catch (Throwable $e) {
            report($e);
        }
    }
}
