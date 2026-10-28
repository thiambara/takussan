<?php

namespace App\Services\Radar;

use App\Ai\Usages\RadarConsentMessageUsage;
use App\Models\AiSuggestion;
use App\Models\Enums\AiSuggestionDecision;
use App\Models\Enums\RadarListingStage;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Models\User;
use App\Services\Ai\SuggestionRecorder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2388 (ADR-0077 §3, §4, §11) — les trois gestes qui font vivre un message d'accord : le préparer, le retoucher,
 * le marquer envoyé. Aucun n'envoie quoi que ce soit : l'opérateur ouvre `wa.me` et envoie lui-même.
 *
 * **Chaque geste exige la prise en charge de l'annonceur** ({@see AdvertiserClaim::assertHeld()}) et rejuge ses règles
 * SOUS verrou. Ordre des verrous, partout : annonces (par identifiant croissant) → annonceur → message → réponse.
 *
 * **Le modèle n'est jamais appelé sous verrou ni dans une transaction** : `prepare()` juge d'abord sur des lectures
 * libres (échouer avant de payer l'appel), appelle le modèle, puis relit et rejuge TOUT sous verrou — ce qui a changé
 * pendant l'appel (un STOP, une annonce écartée, une prise qui expire) est vu là.
 *
 * **Le texte enregistré est celui du lien `wa.me`** : `message` ne s'écrit que par `ConsentMessageComposer::compose()`,
 * avec les deux parties déjà ramenées à une ligne, et la version de clauses enregistrée avec lui.
 *
 * **Le journal nomme les gestes et les identifiants, jamais le texte ni un numéro.**
 */
final class RadarOutreachWorkflow
{
    public function __construct(
        private readonly AdvertiserClaim $claim,
        private readonly ConsentMessageComposer $composer,
        private readonly RadarConsentCoverage $coverage,
        private readonly RadarFollowUps $followUps,
        private readonly SuggestionRecorder $recorder,
    ) {}

    /**
     * Prépare un message — pour des annonces, ou comme relance d'un message envoyé. Les messages DÉJÀ préparés (jamais
     * envoyés) de l'annonceur sont remplacés, avec leur suggestion en attente : il n'y a qu'un brouillon à la fois.
     *
     * @param  list<int>|null  $listingIds  `null` pour une relance (les annonces sont celles du message relancé)
     * @return array{outreach: RadarOutreach, generated: bool, ai_error: ?string}
     */
    public function prepare(RadarAdvertiser $advertiser, ?array $listingIds, ?int $followUpOfId, string $locale, User $by): array
    {
        // 1. Lectures libres, aucun verrou : on échoue avant de payer l'appel au modèle.
        $this->refuseIfDoNotContact($advertiser);
        $this->claim->check($advertiser, $by);
        $target = $followUpOfId === null ? null : RadarOutreach::query()->findOrFail($followUpOfId);
        if ($target !== null) {
            $this->judgeTarget($advertiser, $target);
        }
        $ids = $target === null ? array_values(array_unique($listingIds ?? [])) : $target->listings()->pluck('radar_listings.id')->map(fn ($id) => (int) $id)->sort()->values()->all();
        sort($ids);
        $listings = $this->judgeListings($advertiser, $ids, $this->fetch($ids, lock: false), $target);
        $rank = $target === null ? 0 : $target->follow_up_rank + 1;

        // 2. Le modèle, hors de toute transaction.
        $generated = $this->composer->generate($advertiser, $listings, $locale, $rank, $by);

        // 3. Sous verrou : tout est relu, tout est rejugé.
        $outreach = DB::transaction(function () use ($advertiser, $ids, $followUpOfId, $locale, $by, $generated, $rank): RadarOutreach {
            $locked = $this->fetch($ids, lock: true);
            $lockedAdvertiser = RadarAdvertiser::query()->whereKey($advertiser->getKey())->lockForUpdate()->firstOrFail();
            $this->claim->assertHeld($lockedAdvertiser, $by);
            $this->refuseIfDoNotContact($lockedAdvertiser);

            // Le message relancé se verrouille et se juge AVANT le nettoyage : un brouillon ne se relance pas.
            $target = $followUpOfId === null ? null : RadarOutreach::query()->whereKey($followUpOfId)->lockForUpdate()->first();
            abort_code_if($followUpOfId !== null && $target === null, 422, 'radar.outreach.follow_up_invalid');
            if ($target !== null) {
                $this->judgeTarget($lockedAdvertiser, $target);
            }
            $this->discardPrepared($lockedAdvertiser);
            $judged = $this->judgeListings($lockedAdvertiser, $ids, $locked, $target);

            $outreach = RadarOutreach::query()->create([
                'radar_advertiser_id' => $lockedAdvertiser->id,
                'locale' => $locale,
                'clauses_version' => ConsentMessageComposer::CLAUSES_VERSION,
                'salutation' => $generated['salutation'],
                'summary' => $generated['summary'],
                'message' => $this->composer->compose($locale, $generated['salutation'], $generated['summary']),
                'follow_up_of_id' => $target?->id,
                'follow_up_rank' => $rank,
                'created_by_id' => $by->id,
            ]);
            $outreach->listings()->attach($judged->pluck('id')->all());

            if ($generated['result'] !== null) {
                $this->recorder->record($generated['result'], $outreach, proposal: ['salutation' => $generated['salutation'], 'resume' => $generated['summary']]);
            }

            $this->journal('radar_outreach_prepared', 'Message d\'accord du Radar préparé', $outreach, $by, [
                'outreach_id' => $outreach->id,
                'listing_ids' => $outreach->listings()->pluck('radar_listings.id')->map(fn ($id) => (int) $id)->sort()->values()->all(),
                'locale' => $locale,
                'follow_up_rank' => $rank,
                'generated' => $generated['error'] === null,
                'ai_error' => $generated['error'],
            ]);

            return $outreach;
        });

        return ['outreach' => $outreach, 'generated' => $generated['error'] === null, 'ai_error' => $generated['error']];
    }

    /**
     * Retoucher la salutation et/ou le résumé d'un message préparé. Le texte est recomposé avec la version de clauses
     * ENREGISTRÉE : une version publiée depuis ne réécrit pas un message préparé.
     *
     * @param  array{salutation?: string, resume?: string}  $changes
     */
    public function retouch(RadarOutreach $outreach, array $changes, User $by): RadarOutreach
    {
        return DB::transaction(function () use ($outreach, $changes, $by): RadarOutreach {
            $advertiser = RadarAdvertiser::query()->whereKey($outreach->radar_advertiser_id)->lockForUpdate()->firstOrFail();
            $locked = RadarOutreach::query()->whereKey($outreach->getKey())->lockForUpdate()->firstOrFail();
            $this->claim->assertHeld($advertiser, $by);
            abort_code_if($locked->isSent(), 409, 'radar.outreach.not_prepared');

            if (array_key_exists('salutation', $changes)) {
                $locked->salutation = ConsentMessageComposer::part($changes['salutation'], ConsentMessageComposer::SALUTATION_MAX);
            }
            if (array_key_exists('resume', $changes)) {
                $locked->summary = ConsentMessageComposer::part($changes['resume'], ConsentMessageComposer::SUMMARY_MAX);
            }
            // Une partie qui se réduit à rien une fois ramenée à une ligne (que des caractères invisibles) est refusée ICI :
            // sinon l'opérateur ne l'apprendrait qu'à l'envoi.
            $empty = array_keys(array_filter(
                ['salutation' => $locked->salutation, 'resume' => $locked->summary],
                fn (string $part, string $field) => array_key_exists($field, $changes) && $part === '',
                ARRAY_FILTER_USE_BOTH,
            ));
            abort_code_if($empty !== [], 422, 'radar.outreach.parts_missing', ['fields' => $empty]);
            $locked->message = $this->composer->compose($locked->locale, $locked->salutation, $locked->summary, $locked->clauses_version);
            $locked->save();

            $this->journal('radar_outreach_retouched', 'Message d\'accord du Radar retouché', $locked, $by, [
                'outreach_id' => $locked->id,
                'fields' => array_keys($changes),
            ]);

            return $locked;
        });
    }

    /**
     * L'opérateur a envoyé le message : ses annonces passent `reviewed` → `contacted`, et la suggestion du modèle est
     * décidée UNE fois — acceptée telle quelle, ou éditée avec le différentiel exact (ADR-0076 §7).
     */
    public function markSent(RadarOutreach $outreach, User $by): RadarOutreach
    {
        $ids = $outreach->listings()->pluck('radar_listings.id')->map(fn ($id) => (int) $id)->sort()->values()->all();

        return DB::transaction(function () use ($outreach, $ids, $by): RadarOutreach {
            $listings = $this->fetch($ids, lock: true);
            $advertiser = RadarAdvertiser::query()->whereKey($outreach->radar_advertiser_id)->lockForUpdate()->firstOrFail();
            $this->claim->assertHeld($advertiser, $by);
            $locked = RadarOutreach::query()->whereKey($outreach->getKey())->lockForUpdate()->firstOrFail();

            $this->refuseIfDoNotContact($advertiser);
            abort_code_if($locked->isSent(), 409, 'radar.outreach.not_prepared');
            abort_code_if(trim($locked->salutation) === '' || trim($locked->summary) === '', 422, 'radar.outreach.parts_missing');
            foreach ($listings as $listing) {
                abort_code_unless(
                    in_array($listing->stage, [RadarListingStage::Reviewed, RadarListingStage::Contacted], true),
                    409,
                    'radar.listing.stage_conflict',
                    ['stage' => $listing->stage->value, 'listing_id' => $listing->id],
                );
            }

            $locked->forceFill(['sent_at' => now(), 'sent_by_id' => $by->id])->save();
            foreach ($listings->where('stage', RadarListingStage::Reviewed) as $listing) {
                $listing->stage = RadarListingStage::Contacted;
                $listing->save();
            }

            $suggestion = $this->pendingSuggestion($locked);
            if ($suggestion !== null) {
                $suggestion = $this->recorder->edit($suggestion, ['salutation' => $locked->salutation, 'resume' => $locked->summary], $by);
            }

            $this->journal('radar_outreach_sent', 'Message d\'accord du Radar envoyé', $locked, $by, [
                'outreach_id' => $locked->id,
                'listing_ids' => $ids,
                'suggestion_decision' => $suggestion?->decision->value,
            ]);

            return $locked;
        });
    }

    private function refuseIfDoNotContact(RadarAdvertiser $advertiser): void
    {
        abort_code_if($advertiser->do_not_contact_at !== null, 422, 'radar.advertiser.do_not_contact');
    }

    /**
     * @param  list<int>  $ids
     * @return Collection<int, RadarListing>
     */
    private function fetch(array $ids, bool $lock): Collection
    {
        $query = RadarListing::query()->whereIn('id', $ids)->orderBy('id');

        return ($lock ? $query->lockForUpdate() : $query)->get();
    }

    /**
     * Les règles des annonces : celles de l'annonceur, validées (ou déjà contactées), sans chaîne ouverte pour un premier
     * message, pas déjà couvertes par un accord valide. Pour une relance, seules les annonces du message relancé qui sont ENCORE contactées comptent.
     *
     * @param  list<int>  $ids
     * @param  Collection<int, RadarListing>  $listings
     * @return Collection<int, RadarListing>
     */
    private function judgeListings(RadarAdvertiser $advertiser, array $ids, Collection $listings, ?RadarOutreach $target): Collection
    {
        $foreign = collect($ids)
            ->reject(fn (int $id) => $listings->firstWhere('id', $id)?->radar_advertiser_id === $advertiser->id)
            ->sort()->values()->all();
        abort_code_if($foreign !== [], 422, 'radar.outreach.listing_foreign', ['listing_ids' => $foreign]);

        if ($target !== null) {
            $listings = $listings->filter(fn (RadarListing $l) => $l->stage === RadarListingStage::Contacted)->values();
            abort_code_if($listings->isEmpty(), 422, 'radar.outreach.listing_not_ready', ['listing_ids' => $ids]);
        } else {
            $notReady = $listings
                ->reject(fn (RadarListing $l) => in_array($l->stage, [RadarListingStage::Reviewed, RadarListingStage::Contacted], true))
                ->pluck('id')->map(fn ($id) => (int) $id)->all();
            abort_code_if($notReady !== [], 422, 'radar.outreach.listing_not_ready', ['listing_ids' => $notReady]);

            // Un PREMIER message n'écrase pas une chaîne OUVERTE (envoyée, sans issue — la définition de la file « à relancer »,
            // `RadarFollowUps::constrainOpen()`) : avant une issue, la seule façon d'écrire de nouveau est une relance, qui
            // garde le plafond de `radar.follow_ups.max`. Une issue `question` ou `no_answer` ferme la chaîne.
            $pending = RadarListing::query()
                ->whereIn('id', $listings->where('stage', RadarListingStage::Contacted)->pluck('id')->all())
                ->whereHas('outreaches', fn ($q) => $this->followUps->constrainOpen($q))
                ->orderBy('id')
                ->value('id');
            abort_code_if($pending !== null, 422, 'radar.outreach.listing_pending', ['listing_id' => (int) $pending]);
        }

        $covered = $this->coverage->coveredAmong($listings->pluck('id')->map(fn ($id) => (int) $id)->all());
        abort_code_if($covered !== [], 422, 'radar.outreach.listing_consented', ['listing_ids' => $covered]);

        return $listings;
    }

    /** Le message relancé : de cet annonceur, envoyé, sans issue, dernier de sa chaîne, et pas au bout des relances. */
    private function judgeTarget(RadarAdvertiser $advertiser, RadarOutreach $target): void
    {
        abort_code_unless(
            $target->radar_advertiser_id === $advertiser->id
                && $target->isSent()
                && $target->outcome === null
                && ! RadarOutreach::query()->where('follow_up_of_id', $target->id)->whereNotNull('sent_at')->exists(),
            422,
            'radar.outreach.follow_up_invalid',
        );
        abort_code_if($this->followUps->atLimit($target), 422, 'radar.outreach.follow_up_limit');
    }

    /** Les messages préparés de l'annonceur (jamais envoyés), avec leur suggestion en attente : un seul brouillon. */
    private function discardPrepared(RadarAdvertiser $advertiser): void
    {
        $prepared = RadarOutreach::query()
            ->where('radar_advertiser_id', $advertiser->id)
            ->whereNull('sent_at')
            ->orderBy('id')
            ->lockForUpdate()
            ->get();
        if ($prepared->isEmpty()) {
            return;
        }

        AiSuggestion::query()
            ->where('usage_key', RadarConsentMessageUsage::KEY)
            ->where('subject_type', $prepared->first()->getMorphClass())
            ->whereIn('subject_id', $prepared->modelKeys())
            ->where('decision', AiSuggestionDecision::Pending->value)
            ->delete();
        RadarOutreach::query()->whereKey($prepared->modelKeys())->delete();
    }

    private function pendingSuggestion(RadarOutreach $outreach): ?AiSuggestion
    {
        return AiSuggestion::query()
            ->where('usage_key', RadarConsentMessageUsage::KEY)
            ->where('subject_type', $outreach->getMorphClass())
            ->where('subject_id', $outreach->getKey())
            ->where('decision', AiSuggestionDecision::Pending->value)
            ->latest('id')
            ->first();
    }

    /** @param  array<string, mixed>  $properties */
    private function journal(string $event, string $message, RadarOutreach $outreach, User $by, array $properties): void
    {
        activity('Admin')
            ->causedBy($by)
            ->performedOn($outreach)
            ->withProperties($properties)
            ->event($event)
            ->log($message);
    }
}
