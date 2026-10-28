<?php

namespace App\Services\Radar;

use App\Http\Resources\Bases\BaseResource;
use App\Models\RadarAdvertiser;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2388 (ADR-0077 §11, modèle d'ADR-0043 §7) — un seul opérateur à la fois sur un annonceur, pour
 * {@see self::DURATION_MINUTES} minutes, renouvelables. La prise vit sur la ligne de l'annonceur : la verrouiller
 * suffit à départager deux prises simultanées (aucune insertion disputée, donc pas d'`insertOrIgnore` ici,
 * contrairement à `moderation_claims`). Une prise expirée d'un autre se reprend.
 *
 * {@see self::assertHeld()} s'appelle DANS la transaction d'un geste, sur l'annonceur que ce geste vient de
 * verrouiller APRÈS ses annonces (ordre : annonces → annonceur → message → réponse).
 */
final class AdvertiserClaim
{
    public const DURATION_MINUTES = 10;

    public function claim(RadarAdvertiser $advertiser, User $by): RadarAdvertiser
    {
        return DB::transaction(function () use ($advertiser, $by): RadarAdvertiser {
            $locked = RadarAdvertiser::query()->whereKey($advertiser->getKey())->lockForUpdate()->firstOrFail();
            $this->refuseIfHeldByOther($locked, $by);
            $this->stamp($locked, $by);

            return $locked->load('claimer:id,first_name,last_name,username');
        });
    }

    /** Rendre sa prise. Celle d'un autre, encore active : 409. Aucune prise : rien. */
    public function release(RadarAdvertiser $advertiser, User $by): void
    {
        DB::transaction(function () use ($advertiser, $by): void {
            $locked = RadarAdvertiser::query()->whereKey($advertiser->getKey())->lockForUpdate()->firstOrFail();
            abort_code_if($this->heldByOther($locked, $by), 409, 'radar.advertiser.claim_not_held');
            $this->persist($locked->forceFill(['claimed_by_id' => null, 'claimed_at' => null, 'claim_expires_at' => null]));
        });
    }

    /** Sur un annonceur DÉJÀ verrouillé par l'appelant : tenue par lui, sinon 409 ; renouvelée. */
    public function assertHeld(RadarAdvertiser $locked, User $by): void
    {
        $this->refuseIfHeldByOther($locked, $by);
        abort_code_unless(
            $locked->claimed_by_id === $by->id && $locked->claim_expires_at?->isFuture() === true,
            409,
            'radar.advertiser.claim_required',
        );
        $this->stamp($locked, $by);
    }

    private function refuseIfHeldByOther(RadarAdvertiser $locked, User $by): void
    {
        abort_code_if($this->heldByOther($locked, $by), 409, 'radar.advertiser.claimed_by_other', [
            'claimed_until' => BaseResource::instantOnWire($locked->claim_expires_at),
        ]);
    }

    private function heldByOther(RadarAdvertiser $a, User $by): bool
    {
        return $a->claimed_by_id !== null && $a->claimed_by_id !== $by->id && $a->claim_expires_at?->isFuture() === true;
    }

    private function stamp(RadarAdvertiser $a, User $by): void
    {
        $now = now();
        $this->persist($a->forceFill([
            'claimed_by_id' => $by->id,
            'claimed_at' => $now,
            'claim_expires_at' => $now->copy()->addMinutes(self::DURATION_MINUTES),
        ]));
    }

    /**
     * La prise n'est pas une activité de l'annonceur : l'écrire ne touche pas `updated_at`, que la liste des
     * annonceurs trie (`-updated_at`). Sans cela, prendre ou rendre une fiche la ferait remonter en tête.
     */
    private function persist(RadarAdvertiser $advertiser): void
    {
        $advertiser->timestamps = false;
        try {
            $advertiser->save();
        } finally {
            $advertiser->timestamps = true;
        }
    }
}
