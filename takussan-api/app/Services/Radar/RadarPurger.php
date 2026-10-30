<?php

namespace App\Services\Radar;

use App\Jobs\Radar\VerifyRadarConsentReply;
use App\Models\AiSuggestion;
use App\Models\Enums\RadarAdvertiserNature;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarVerificationStatus;
use App\Models\Property;
use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2391 (ADR-0077 §9) — la purge. Ce que `privacy.ts` § 6 annonce, le code le tient, ici et nulle part ailleurs :
 *
 * 1. **Une annonce jamais publiée** (ni `published`, ni `property_id`) s'efface 90 jours après la saisie (`purge_at`, posé
 *    une fois à la création : une relance par recollage ne le repousse pas), ou dès que son annonceur a dit STOP : texte
 *    brut, captures, réserve de photos, champs extraits (numéros écartés et passages cités compris), adresse de la source.
 *    Restent l'étape (`purged`), le site d'origine, les dates, l'empreinte du contenu (la recoller rend la fiche `purged`),
 *    celles des photos et les rapprochements. Les suggestions de l'IA qui portent sur elle perdent leurs champs
 *    (`proposal`, `input_snapshot`, `final_value`, `correction_diff`), pas leur ligne : le taux d'acceptation lit
 *    `usage_key`, `decision` et `decided_at`.
 * 2. **Un message** dont toutes les annonces sont purgées perd sa salutation, son résumé et son texte ; **une réponse non
 *    confirmée**, ses captures, sa transcription et son verdict. Une réponse CONFIRMÉE est la preuve de l'accord : elle reste
 *    avec le message qu'elle prouve (3).
 * 3. **La preuve d'un accord confirmé** vit tant qu'une annonce qu'elle couvre attend sa publication ou est en ligne, puis
 *    `radar.consent_retention_years` ans à compter du retrait ({@see self::observeRetention()}).
 * 4. **Un annonceur sans annonce restante** perd son numéro en clair, son nom et ses indices ; **l'empreinte à clé de son
 *    numéro reste s'il a dit STOP** : sans elle, le Radar le retrouverait sur la prochaine annonce. Sans refus ni message, la
 *    ligne elle-même s'en va.
 *
 * 3 bis. **La matière collectée d'une annonce PUBLIÉE** (TCK-2406, `radar.purge_published_material`, éteint par défaut) part
 *    avec la dernière preuve qui la couvre, trois ans après le retrait de son bien, et seulement si ce bien n'est pas revenu en
 *    ligne ({@see self::purgePublishedListings()}). Le numéro de l'annonceur suit par (4).
 *
 * 5. **Les fichiers sans ligne** que la réserve ou une réponse a pu laisser sur le disque privé, et ceux qu'une publication
 *    coupée a laissés sous le préfixe des copies, sur les deux disques ({@see RadarOrphanFiles}, TCK-2406).
 *
 * **Idempotente** : chaque étape ne choisit que ce qui est encore dû, relu sous verrou. Ordre des verrous : annonces →
 * annonceur (celui de tout le Radar). Les fichiers partent avec leur ligne, en DERNIER geste de la transaction : une
 * transaction défaite les rend à la reprise suivante, jamais sans eux.
 */
final class RadarPurger
{
    /** @var list<string> les compteurs rendus par {@see self::run()}, dans l'ordre */
    private const COUNTERS = [
        'listings', 'media', 'suggestions', 'outreaches', 'replies', 'proofs', 'advertisers_cleared', 'advertisers_deleted',
        'retention_started', 'retention_reset', 'orphan_dirs', 'orphan_copies', 'published_listings',
    ];

    public function __construct(private readonly RadarOrphanFiles $orphans) {}

    /**
     * @param  int|null  $advertiserId  null : toute la table (la commande planifiée) ; sinon un seul annonceur, sans la rétention
     * @return array<string, int> ce qui a été effacé, par compteur
     */
    public function run(?int $advertiserId = null, ?CarbonInterface $now = null): array
    {
        $now ??= now();
        $counts = array_fill_keys(self::COUNTERS, 0);

        $this->purgeListings($advertiserId, $now, $counts);
        if ($advertiserId === null) {
            $this->observeRetention($now, $counts);
            $this->purgeExpiredProofs($now, $counts);
            if (config('radar.purge_published_material') === true) {
                $this->purgePublishedListings($counts);
            }
            $counts['orphan_dirs'] += $this->orphans->sweep($now);
            $counts['orphan_copies'] += $this->orphans->sweepPublicationCopies($now);
        }
        $this->purgeUnconfirmedReplies($advertiserId, $counts);
        $this->purgeOutreaches($advertiserId, $counts);
        $this->clearAdvertisers($advertiserId, $counts);

        if (array_sum($counts) > 0) {
            // Les comptes, jamais un numéro, un nom ni une phrase.
            activity('Admin')->event('radar_purged')->withProperties($counts)->log('Purge du Radar');
        }

        return $counts;
    }

    // --- 1. Les annonces jamais publiées -----------------------------------------------------------

    /** @param  array<string, int>  $counts */
    private function purgeListings(?int $advertiserId, CarbonInterface $now, array &$counts): void
    {
        $ids = $this->dueListings($now)
            ->when($advertiserId !== null, fn ($query) => $query->where('radar_advertiser_id', $advertiserId))
            ->orderBy('id')
            ->pluck('id');

        foreach ($ids as $id) {
            DB::transaction(function () use ($id, $now, &$counts): void {
                $listing = RadarListing::query()->whereKey($id)->lockForUpdate()->first();
                // Relue sous verrou : publiée, purgée ou rouverte depuis la lecture, elle n'est plus due.
                if ($listing === null || ! $this->dueListings($now)->whereKey($id)->exists()) {
                    return;
                }

                $this->eraseListing($listing, $counts);
                $counts['listings']++;
            });
        }
    }

    /**
     * Texte brut, adresse de la source, extraction, réserve et captures ; l'étape devient `purged`. Le lien au bien (`property_id`)
     * reste : il n'est pas une donnée collectée.
     *
     * @param  array<string, int>  $counts
     */
    private function eraseListing(RadarListing $listing, array &$counts): void
    {
        $listing->forceFill([
            'raw_text' => null,
            'source_url' => null,
            'photo_urls' => [],
            'extracted' => null,
            'photo_preparation' => null,
            'stage' => RadarListingStage::Purged,
            'stage_reason' => null,
        ])->save();
        $counts['suggestions'] += $this->eraseSuggestions('radar.extraction', $listing);

        // Le dernier geste : les fichiers partent avec leurs lignes.
        $counts['media'] += $this->deleteMedia($listing);
    }

    /**
     * Les annonces dues : jamais publiées, pas encore purgées, et soit échues soit à un annonceur qui a dit STOP.
     *
     * @return Builder<RadarListing>
     */
    private function dueListings(CarbonInterface $now)
    {
        return RadarListing::query()
            ->whereNotIn('stage', [RadarListingStage::Published->value, RadarListingStage::Purged->value])
            ->whereNull('property_id')
            ->where(fn ($query) => $query
                ->where('purge_at', '<=', $now)
                ->orWhereIn('radar_advertiser_id', RadarAdvertiser::query()->whereNotNull('do_not_contact_at')->select('id')));
    }

    // --- 2. Les messages et les réponses non confirmées --------------------------------------------

    /** @param  array<string, int>  $counts */
    private function purgeUnconfirmedReplies(?int $advertiserId, array &$counts): void
    {
        $ids = RadarConsent::query()
            ->whereNull('confirmed_at')->whereNull('purged_at')
            ->whereNotExists($this->liveListingsOf('radar_consents.radar_outreach_id'))
            ->when($advertiserId !== null, fn ($query) => $query->where('radar_advertiser_id', $advertiserId))
            ->orderBy('id')
            ->pluck('id');

        foreach ($ids as $id) {
            $this->eraseReply($id, $counts, 'replies', fn (RadarConsent $reply): bool => $reply->confirmed_at === null);
        }
    }

    /** @param  array<string, int>  $counts */
    private function purgeOutreaches(?int $advertiserId, array &$counts): void
    {
        $consents = fn () => RadarConsent::query()->toBase()
            ->select(DB::raw(1))
            ->whereColumn('radar_consents.radar_outreach_id', 'radar_outreaches.id')
            ->whereNotNull('radar_consents.confirmed_at');

        $ids = RadarOutreach::query()
            ->where('message', '!=', '')
            // Le message d'une preuve conservée reste avec elle : c'est lui qu'elle prouve.
            ->whereNotExists($consents()->whereNull('radar_consents.purged_at'))
            // Dû quand toutes ses annonces sont purgées, ou quand sa preuve l'est : une annonce publiée ne se purge jamais, mais
            // son message n'a plus de raison de rester une fois la preuve qu'il portait effacée.
            ->where(fn ($query) => $query
                ->whereNotExists($this->liveListingsOf('radar_outreaches.id'))
                ->orWhereExists($consents()->whereNotNull('radar_consents.purged_at')))
            ->when($advertiserId !== null, fn ($query) => $query->where('radar_advertiser_id', $advertiserId))
            ->orderBy('id')
            ->pluck('id');

        foreach ($ids as $id) {
            DB::transaction(function () use ($id, &$counts): void {
                $outreach = RadarOutreach::query()->whereKey($id)->lockForUpdate()->first();
                if ($outreach === null || $outreach->message === '') {
                    return;
                }
                // Le nom affiché et le résumé de l'annonce y sont recopiés : `text` NOT NULL, d'où la chaîne vide.
                $outreach->forceFill(['salutation' => '', 'summary' => '', 'message' => ''])->save();
                $counts['suggestions'] += $this->eraseSuggestions('radar.message_accord', $outreach);
                $counts['outreaches']++;
            });
        }
    }

    /** Une sous-requête : les annonces non purgées que ce message couvre (`$outreachColumn`, colonne de la requête englobante). */
    private function liveListingsOf(string $outreachColumn): \Illuminate\Database\Query\Builder
    {
        return DB::table('radar_outreach_listing as ol')
            ->join('radar_listings as l', 'l.id', '=', 'ol.radar_listing_id')
            ->select(DB::raw(1))
            ->whereColumn('ol.radar_outreach_id', $outreachColumn)
            ->where('l.stage', '!=', RadarListingStage::Purged->value);
    }

    // --- 3. La preuve d'un accord confirmé ---------------------------------------------------------

    /**
     * « Tant que les annonces concernées sont en ligne, puis 3 ans » : une preuve est VIVANTE quand une annonce qu'elle couvre
     * attend sa publication (`consented`) ou est publiée sur un bien public. Le retrait n'a pas de date en base : la première
     * observation « plus rien en ligne » la pose (`offline_since` : la date de CETTE observation, à un jour près du retrait), et un
     * bien qui revient en ligne l'efface : les trois ans courent du DERNIER retrait, jamais d'une révocation antérieure à une
     * republication (`revoked_at` ne dit que le premier retrait). Limite : une remise en ligne qui n'a pas duré jusqu'au passage
     * quotidien suivant n'est pas vue, et la date du retrait précédent reste.
     *
     * @param  array<string, int>  $counts
     */
    private function observeRetention(CarbonInterface $now, array &$counts): void
    {
        $live = fn (): \Illuminate\Database\Query\Builder => DB::table('radar_outreach_listing as ol')
            ->join('radar_listings as l', 'l.id', '=', 'ol.radar_listing_id')
            ->select(DB::raw(1))
            ->whereColumn('ol.radar_outreach_id', 'radar_consents.radar_outreach_id')
            ->where(fn ($query) => $query
                ->where('l.stage', RadarListingStage::Consented->value)
                ->orWhere(fn ($published) => $published
                    ->where('l.stage', RadarListingStage::Published->value)
                    ->whereIn('l.property_id', Property::query()->public()->select('properties.id'))));

        $stamp = $now->format('Y-m-d H:i:s');
        $counts['retention_started'] += RadarConsent::query()
            ->whereNotNull('confirmed_at')->whereNull('purged_at')->whereNull('offline_since')
            ->whereNotExists($live())
            ->update(['offline_since' => $stamp]);
        $counts['retention_reset'] += RadarConsent::query()
            ->whereNotNull('confirmed_at')->whereNull('purged_at')->whereNotNull('offline_since')
            ->whereExists($live())
            ->update(['offline_since' => null]);
    }

    /** @param  array<string, int>  $counts */
    private function purgeExpiredProofs(CarbonInterface $now, array &$counts): void
    {
        $cutoff = $now->copy()->subYears((int) config('radar.consent_retention_years', 3));

        $ids = RadarConsent::query()
            ->whereNotNull('confirmed_at')->whereNull('purged_at')
            ->whereNotNull('offline_since')->where('offline_since', '<=', $cutoff)
            ->orderBy('id')
            ->pluck('id');

        foreach ($ids as $id) {
            $this->eraseReply($id, $counts, 'proofs', fn (RadarConsent $reply): bool => $reply->offline_since !== null && $reply->offline_since->lte($cutoff));
        }
    }

    // --- 3 bis. La matière d'une annonce publiée (TCK-2406) ----------------------------------------

    /**
     * Une annonce publiée est due quand une preuve confirmée qui la couvre a été effacée ({@see self::purgeExpiredProofs()} : trois
     * ans après le retrait) et qu'aucune autre ne vit encore, et que son bien n'est pas public (ou n'existe plus). Un bien que le
     * compte a remis en ligne après coup retient la matière jusqu'à son prochain retrait — sans nouveau délai : la preuve qui le
     * portait n'est plus.
     *
     * @param  array<string, int>  $counts
     */
    private function purgePublishedListings(array &$counts): void
    {
        $ids = $this->duePublishedListings()->orderBy('id')->pluck('id');

        foreach ($ids as $id) {
            DB::transaction(function () use ($id, &$counts): void {
                $listing = RadarListing::query()->whereKey($id)->lockForUpdate()->first();
                if ($listing === null || ! $this->duePublishedListings()->whereKey($id)->exists()) {
                    return;
                }

                $this->eraseListing($listing, $counts);
                $counts['published_listings']++;
            });
        }
    }

    /** @return Builder<RadarListing> */
    private function duePublishedListings()
    {
        $proofs = fn (): \Illuminate\Database\Query\Builder => DB::table('radar_outreach_listing as ol')
            ->join('radar_consents as c', 'c.radar_outreach_id', '=', 'ol.radar_outreach_id')
            ->select(DB::raw(1))
            ->whereColumn('ol.radar_listing_id', 'radar_listings.id')
            ->whereNotNull('c.confirmed_at');

        return RadarListing::query()
            ->where('stage', RadarListingStage::Published->value)
            ->where(fn ($query) => $query
                ->whereNull('property_id')
                ->orWhereNotIn('property_id', Property::query()->public()->select('properties.id')))
            ->whereExists($proofs()->whereNotNull('c.purged_at'))
            ->whereNotExists($proofs()->whereNull('c.purged_at'));
    }

    /**
     * Efface une réponse : transcription, verdict, captures. La ligne reste, avec les empreintes des captures, son statut et
     * ses dates. `$stillDue` se relit sous verrou.
     *
     * @param  array<string, int>  $counts
     * @param  callable(RadarConsent): bool  $stillDue
     */
    private function eraseReply(int $id, array &$counts, string $counter, callable $stillDue): void
    {
        DB::transaction(function () use ($id, &$counts, $counter, $stillDue): void {
            $reply = RadarConsent::query()->whereKey($id)->lockForUpdate()->first();
            if ($reply === null || $reply->purged_at !== null || ! $stillDue($reply)) {
                return;
            }

            $reply->forceFill(['transcript' => null, 'ai_verdict' => null, 'purged_at' => now()]);
            // Une vérification encore en cours ne doit pas reprendre cette réponse : `failed` est l'état terminal que le front lit déjà
            // (`done` dirait qu'un verdict existe, `pending` que le job doit revenir). Une réponse `done` ou `failed` garde son statut.
            if ($reply->verification_status === RadarVerificationStatus::Pending) {
                $reply->forceFill(['verification_status' => RadarVerificationStatus::Failed, 'verification_reason' => VerifyRadarConsentReply::REASON_PURGED]);
            }
            $reply->save();
            $counts['suggestions'] += $this->eraseSuggestions('radar.verification_accord', $reply);

            $counts['media'] += $this->deleteMedia($reply);
            $counts[$counter]++;
        });
    }

    // --- 4. L'annonceur ----------------------------------------------------------------------------

    /** @param  array<string, int>  $counts */
    private function clearAdvertisers(?int $advertiserId, array &$counts): void
    {
        $ids = RadarAdvertiser::query()
            ->whereNotExists(DB::table('radar_listings as l')
                ->select(DB::raw(1))
                ->whereColumn('l.radar_advertiser_id', 'radar_advertisers.id')
                ->where('l.stage', '!=', RadarListingStage::Purged->value))
            ->when($advertiserId !== null, fn ($query) => $query->whereKey($advertiserId))
            ->orderBy('id')
            ->pluck('id');

        foreach ($ids as $id) {
            DB::transaction(function () use ($id, &$counts): void {
                // Le seul verrou est celui de l'annonceur, et les annonces se relisent APRÈS l'avoir pris : toute annonce qui le
                // rejoint le tient jusqu'à son commit (`ExtractRadarListing`, `PUT …/advertiser`), donc une qui arrive pendant
                // la lecture est vue ici, jamais perdue.
                $advertiser = RadarAdvertiser::query()->whereKey($id)->lockForUpdate()->first();
                $remaining = $advertiser !== null && RadarListing::query()
                    ->where('radar_advertiser_id', $id)->where('stage', '!=', RadarListingStage::Purged->value)->exists();
                if ($advertiser === null || $remaining) {
                    return;
                }

                // Rien ne justifie la ligne : ni refus à retenir, ni message, ni accord, ni compte lié.
                $keep = $advertiser->do_not_contact_at !== null || $advertiser->user_id !== null
                    || $advertiser->outreaches()->exists() || $advertiser->consents()->exists();
                if (! $keep) {
                    $advertiser->delete();
                    $counts['advertisers_deleted']++;

                    return;
                }

                $advertiser->forceFill(['phone' => null, 'display_name' => null, 'nature' => RadarAdvertiserNature::Unknown, 'nature_signals' => []]);
                if ($advertiser->isDirty()) {
                    $advertiser->save();
                    $counts['advertisers_cleared']++;
                }
            });
        }
    }

    // --- Outils ------------------------------------------------------------------------------------

    /** @return int les suggestions de cet usage dont ce modèle est le sujet, vidées de leurs champs (la ligne reste) */
    private function eraseSuggestions(string $usageKey, Model $subject): int
    {
        return AiSuggestion::query()
            ->where('usage_key', $usageKey)
            ->where('subject_type', $subject->getMorphClass())->where('subject_id', $subject->getKey())
            ->whereRaw("(proposal <> '[]'::jsonb or input_snapshot is not null or final_value is not null or correction_diff is not null)")
            ->update(['proposal' => '[]', 'input_snapshot' => null, 'final_value' => null, 'correction_diff' => null]);
    }

    /** @return int les médias effacés, lignes ET fichiers (l'observateur de Spatie retire les fichiers avec la ligne) */
    private function deleteMedia(RadarListing|RadarConsent $model): int
    {
        $deleted = 0;
        foreach ($model->media()->orderBy('id')->get() as $media) {
            $media->delete();
            $deleted++;
        }

        return $deleted;
    }
}
