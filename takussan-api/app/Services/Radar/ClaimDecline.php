<?php

namespace App\Services\Radar;

use App\Models\Enums\RadarOutreachOutcome;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Services\Radar\Whatsapp\RadarWhatsappInbox;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2511 — l'annonceur dit non depuis le lien de réclamation, sans code ni compte : « Ce n'est pas moi » (`not_me`) ou
 * « Ne plus me contacter » (`stop_contact`). **L'effet est exactement celui d'un STOP** : le corps commun du retrait,
 * {@see AdvertiserRevocation::apply()} (annonceur `do_not_contact` avec l'empreinte de son numéro, annonces ouvertes
 * fermées, accords retirés, biens publiés hors du public, purge en file après le commit — qui efface le numéro quand il ne
 * reste aucune annonce publiée). C'en est la quatrième entrée, après le STOP de l'opérateur
 * ({@see RadarConsentWorkflow::recordOutcome()}), la révocation et le STOP reçu par WhatsApp ({@see RadarWhatsappInbox}) :
 * aucune seconde implémentation du retrait.
 *
 * Calquée sur le STOP reçu, qui n'a pas d'opérateur non plus : `recordOutcome()` exige un opérateur qui tient
 * l'annonceur. Le dernier message envoyé de la chaîne prend l'issue `stop`, sans auteur ; le motif est journalisé
 * (`radar_claim_declined`) pour la console. Ordre des verrous du Radar : annonces (par id) → annonceur → message ; une
 * annonce qui rejoint l'annonceur pendant la lecture fait REPRENDRE.
 *
 * Aucun SMS, aucun message : le refus n'envoie rien.
 */
final class ClaimDecline
{
    public const REASONS = ['not_me', 'stop_contact'];

    /** Combien de fois le refus reprend quand une annonce rejoint l'annonceur pendant sa lecture. */
    private const ATTEMPTS = 3;

    public function __construct(private readonly AdvertiserRevocation $revocation) {}

    public function decline(RadarAdvertiser $advertiser, string $reason): void
    {
        for ($attempt = 1; $attempt <= self::ATTEMPTS; $attempt++) {
            if (DB::transaction(fn (): ?bool => $this->declineOnce($advertiser, $reason)) !== null) {
                return;
            }
        }

        abort_code(409, 'radar.advertiser.busy');
    }

    /** @return bool|null null : les annonces de l'annonceur ont changé pendant la lecture, rien n'a été écrit */
    private function declineOnce(RadarAdvertiser $advertiser, string $reason): ?bool
    {
        $listings = RadarListing::query()->where('radar_advertiser_id', $advertiser->getKey())->orderBy('id')->lockForUpdate()->get();
        $locked = RadarAdvertiser::query()->whereKey($advertiser->getKey())->lockForUpdate()->firstOrFail();
        // Deux refus simultanés : le second voit le premier sous le verrou, et le lien était déjà mort pour lui.
        abort_code_if(ClaimLinks::revoked($locked), 410, 'radar.claim.revoked');
        if ($this->revocation->listingIds($locked) !== $listings->pluck('id')->map(fn ($id) => (int) $id)->sort()->values()->all()) {
            return null;
        }

        $outreach = $this->lastSent($locked);
        $applied = $this->revocation->apply($locked, $listings);
        if ($outreach !== null && $outreach->outcome?->isFinal() !== true) {
            $outreach->forceFill(['outcome' => RadarOutreachOutcome::Stop, 'outcome_at' => now(), 'outcome_by_id' => null])->save();
        }

        activity('Admin')
            ->performedOn($outreach ?? $locked)
            ->withProperties(array_filter([
                'advertiser_id' => $locked->id,
                'outreach_id' => $outreach?->id,
                'reason' => $reason,
                'listing_ids' => $applied['closed'],
                'revoked_consent_ids' => $applied['revoked_consents'],
                'property_ids' => $applied['retired_properties'],
            ], fn (mixed $value) => $value !== null && $value !== []))
            ->event('radar_claim_declined')
            ->log('Refus de l\'annonceur depuis le lien de réclamation : annonceur révoqué');

        return true;
    }

    /** Le dernier message envoyé à l'annonceur, au bout de sa chaîne de relances, verrouillé ; null s'il n'y en a pas. */
    private function lastSent(RadarAdvertiser $advertiser): ?RadarOutreach
    {
        $outreach = RadarOutreach::query()
            ->where('radar_advertiser_id', $advertiser->id)
            ->whereNotNull('sent_at')
            ->orderByDesc('sent_at')
            ->orderByDesc('id')
            ->first();
        while ($outreach !== null && ($next = RadarOutreach::query()->where('follow_up_of_id', $outreach->id)->whereNotNull('sent_at')->first()) !== null) {
            $outreach = $next;
        }

        return $outreach === null ? null : RadarOutreach::query()->whereKey($outreach->id)->lockForUpdate()->first();
    }
}
