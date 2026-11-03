<?php

namespace App\Services\Radar;

use App\Jobs\Radar\PrepareRadarListingPhotos;
use App\Jobs\Radar\PurgeRadarAdvertiser;
use App\Jobs\Radar\VerifyRadarConsentReply;
use App\Models\Enums\RadarConsentProof;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarOutreachOutcome;
use App\Models\Enums\RadarVerificationStatus;
use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2388 (ADR-0077 §3, §11) — les gestes qui font vivre la preuve d'un accord : déposer la réponse d'un annonceur
 * puis poser l'issue du message, qui seule confirme un accord. Chaque geste exige la prise en charge de l'annonceur et
 * relit ses règles sous verrou. Ordre des verrous : annonces → annonceur → message → réponse (et, pour un STOP, les biens publiés : {@see AdvertiserRevocation}).
 *
 * **Déposer une réponse n'accorde rien** : la ligne naît `pending`, la vérification par l'IA part en file APRÈS le
 * commit (`VerifyRadarConsentReply`), et seul un humain confirme. Aucune annonce ne change d'étape ici.
 *
 * **Le journal nomme les gestes et les identifiants, jamais la transcription ni un numéro.** Seule exception : le motif
 * écrit par l'opérateur quand il confirme un accord contre un verdict discordant (ADR-0077 §3), texte d'opérateur qu'il
 * lui appartient de garder sans numéro.
 */
final class RadarConsentWorkflow
{
    /** Combien de fois un STOP reprend quand une annonce rejoint l'annonceur pendant sa lecture. */
    private const STOP_ATTEMPTS = 3;

    public function __construct(
        private readonly AdvertiserClaim $claim,
        private readonly RadarCaptureReader $captures,
        private readonly RadarVerificationDecision $verification,
        private readonly AdvertiserRevocation $revocation,
    ) {}

    /**
     * Déposer la réponse d'un annonceur : les captures de la conversation, sur le message ENVOYÉ, sans issue finale,
     * dernier de sa chaîne (la réponse se dépose sur la dernière relance : elle porte les mêmes annonces et les mêmes
     * clauses).
     *
     * @param  list<UploadedFile>  $files
     */
    public function depositReply(RadarOutreach $outreach, array $files, User $by): RadarConsent
    {
        // Lectures libres : on échoue avant de décoder des images, qui coûte.
        $advertiser = RadarAdvertiser::query()->findOrFail($outreach->radar_advertiser_id);
        $this->claim->check($advertiser, $by);

        // Tout se lit et se réencode AVANT la moindre écriture.
        $captures = $this->captures->prepare($files);

        return DB::transaction(function () use ($outreach, $captures, $by): RadarConsent {
            $advertiser = RadarAdvertiser::query()->whereKey($outreach->radar_advertiser_id)->lockForUpdate()->firstOrFail();
            $this->claim->assertHeld($advertiser, $by);
            abort_code_if($advertiser->do_not_contact_at !== null, 422, 'radar.advertiser.do_not_contact');

            $locked = RadarOutreach::query()->whereKey($outreach->getKey())->lockForUpdate()->firstOrFail();
            abort_code_unless($locked->isSent(), 409, 'radar.outreach.not_sent');
            abort_code_if($locked->outcome?->isFinal() === true, 409, 'radar.outreach.outcome_final');
            abort_code_if(
                RadarOutreach::query()->where('follow_up_of_id', $locked->id)->whereNotNull('sent_at')->exists(),
                409,
                'radar.outreach.superseded',
            );
            // Un dépôt = un appel payant : tant qu'une réponse de ce message attend sa vérification, on n'en dépose pas
            // une seconde (le double envoi d'un formulaire). Le message est verrouillé : deux dépôts se sérialisent ici.
            abort_code_if(
                RadarConsent::query()->where('radar_outreach_id', $locked->id)->where('verification_status', RadarVerificationStatus::Pending->value)->exists(),
                409,
                'radar.outreach.reply_pending',
            );

            $consent = RadarConsent::query()->create([
                'radar_outreach_id' => $locked->id,
                'radar_advertiser_id' => $advertiser->id,
                'proof' => RadarConsentProof::Screenshot,
                'capture_hashes' => array_column($captures, 'sha256'),
                'deposited_by_id' => $by->id,
                'verification_status' => RadarVerificationStatus::Pending,
            ]);

            VerifyRadarConsentReply::dispatch($consent->id)->afterCommit();

            activity('Admin')
                ->causedBy($by)
                ->performedOn($locked)
                ->withProperties(['outreach_id' => $locked->id, 'consent_id' => $consent->id, 'captures' => count($captures)])
                ->event('radar_consent_reply_deposited')
                ->log('Réponse d\'annonceur déposée sur un message d\'accord du Radar');

            // Le DERNIER geste avant le commit : la transaction rend les lignes, jamais les fichiers. Si une écriture
            // suivait, son échec laisserait sur le disque privé des captures (des numéros de téléphone) que rien ne
            // référence et que la purge ne trouverait pas. `attach()` efface lui-même ce qu'il a déjà écrit s'il échoue.
            $this->captures->attach($consent, 'radar_consent_captures', $captures, 'reponse');

            return $consent;
        });
    }

    /**
     * TCK-2388 (ADR-0077 §3, §8) — le SEUL geste qui confirme une réponse. Un verdict IA n'ouvre rien : seul ce geste
     * écrit `confirmed_by_id` et `confirmed_at`. `consented` exige une réponse déposée, et un motif écrit (journalisé)
     * quand le verdict est discordant ou absent ({@see RadarConsentVerdict::discordances()}) ; il couvre TOUTES les
     * annonces du message (un accord par message). `refused`, `stop`, `question` et `no_answer` s'enregistrent avec ou
     * sans capture. `stop` ferme l'annonceur entier : voir {@see self::stop()}.
     *
     * Ordre des verrous : les annonces (par id), puis l'annonceur, puis le message, puis la réponse — celui d'`ExtractRadarListing`
     * et de `PUT …/listings/{listing}/advertiser`. Un STOP verrouille TOUTES les annonces de l'annonceur, puisqu'il les ferme
     * toutes. La suggestion de vérification en attente se décide ici, sous le verrou de la réponse que le job prend aussi.
     */
    public function recordOutcome(RadarOutreach $outreach, RadarOutreachOutcome $outcome, ?string $reason, User $by): RadarOutreach
    {
        $reason = self::written($reason);

        // Un STOP lit les annonces de l'annonceur AVANT de verrouiller l'annonceur (annonces → annonceur) : une annonce qui
        // le rejoint entre les deux (`ExtractRadarListing`, `PUT …/advertiser`) échappe à son ensemble. Il le voit sous le
        // verrou de l'annonceur et REPREND, sans renverser l'ordre des verrous — rien n'est écrit avant la dernière vérification.
        for ($attempt = 1; $attempt <= self::STOP_ATTEMPTS; $attempt++) {
            $recorded = DB::transaction(fn (): ?RadarOutreach => $this->recordOnce($outreach, $outcome, $reason, $by));
            if ($recorded !== null) {
                return $recorded;
            }
        }

        abort_code(409, 'radar.advertiser.busy');
    }

    /** @return RadarOutreach|null null : les annonces de l'annonceur ont changé pendant la lecture, rien n'a été écrit (STOP seulement) */
    private function recordOnce(RadarOutreach $outreach, RadarOutreachOutcome $outcome, ?string $reason, User $by): ?RadarOutreach
    {
        $listings = $outcome === RadarOutreachOutcome::Stop
            ? RadarListing::query()->where('radar_advertiser_id', $outreach->radar_advertiser_id)
            : RadarListing::query()->whereIn('id', $outreach->listings()->select('radar_listings.id'));
        $listings = $listings->orderBy('id')->lockForUpdate()->get();

        $advertiser = RadarAdvertiser::query()->whereKey($outreach->radar_advertiser_id)->lockForUpdate()->firstOrFail();
        if ($outcome === RadarOutreachOutcome::Stop && $this->revocation->listingIds($advertiser) !== $listings->pluck('id')->map(fn ($id) => (int) $id)->sort()->values()->all()) {
            return null;
        }
        $this->claim->assertHeld($advertiser, $by);
        abort_code_if($advertiser->do_not_contact_at !== null, 422, 'radar.advertiser.do_not_contact');

        $locked = RadarOutreach::query()->whereKey($outreach->getKey())->lockForUpdate()->firstOrFail();
        abort_code_unless($locked->isSent(), 409, 'radar.outreach.not_sent');
        abort_code_if($locked->outcome?->isFinal() === true, 409, 'radar.outreach.outcome_final', ['outcome' => $locked->outcome?->value]);
        abort_code_if(
            RadarOutreach::query()->where('follow_up_of_id', $locked->id)->whereNotNull('sent_at')->exists(),
            409,
            'radar.outreach.superseded',
        );
        $reply = $locked->consents()->orderByDesc('id')->lockForUpdate()->first();

        $discordances = [];
        $revoked = [];
        $retired = [];
        $moved = match ($outcome) {
            RadarOutreachOutcome::Consented => $this->confirm($reply, $advertiser, $listings, $reason, $by, $discordances),
            RadarOutreachOutcome::Refused => $this->move($listings, RadarListingStage::Refused),
            RadarOutreachOutcome::Stop => $this->stop($advertiser, $listings, $revoked, $retired),
            RadarOutreachOutcome::Question, RadarOutreachOutcome::NoAnswer => [],
        };

        $locked->forceFill(['outcome' => $outcome, 'outcome_at' => now(), 'outcome_by_id' => $by->id])->save();
        $suggestion = $reply === null ? null : $this->verification->decide($reply, $outcome, $by);

        activity('Admin')
            ->causedBy($by)
            ->performedOn($locked)
            ->withProperties(array_filter([
                'outreach_id' => $locked->id,
                'outcome' => $outcome->value,
                'consent_id' => $reply?->id,
                'listing_ids' => $moved,
                'revoked_consent_ids' => $revoked,
                'property_ids' => $retired,
                'discordances' => $discordances,
                'reason' => $reason,
                'suggestion_decision' => $suggestion?->decision->value,
            ], fn (mixed $value) => $value !== null && $value !== []))
            ->event('radar_outreach_outcome')
            ->log('Issue d\'un message d\'accord du Radar posée');

        return $locked->refresh();
    }

    /**
     * Confirmer la réponse : elle devient un accord valide, et toutes les annonces du message — qui doivent encore être
     * `contacted`, et encore à CET annonceur — passent `consented`.
     *
     * @param  Collection<int, RadarListing>  $listings
     * @param  list<string>  $discordances  rempli : ce qui, dans le verdict, ne va pas dans le sens d'un accord
     * @return list<int>
     */
    private function confirm(?RadarConsent $reply, RadarAdvertiser $advertiser, Collection $listings, ?string $reason, User $by, array &$discordances): array
    {
        abort_code_if($reply === null, 422, 'radar.consent.reply_required');
        // Une annonce du message a pu changer d'annonceur depuis l'envoi (`PUT …/listings/{listing}/advertiser`) : l'accord de
        // CET annonceur ne couvre pas l'annonce d'un autre (`RadarConsentCoverage` passe par le pivot du message).
        $foreign = $listings->filter(fn (RadarListing $listing) => $listing->radar_advertiser_id !== $advertiser->id)
            ->pluck('id')->map(fn ($id) => (int) $id)->sort()->values()->all();
        abort_code_if($foreign !== [], 409, 'radar.outreach.listing_foreign', ['listing_ids' => $foreign]);
        $discordances = RadarConsentVerdict::discordances($reply);
        abort_code_if($discordances !== [] && $reason === null, 422, 'radar.consent.reason_required', ['discordances' => $discordances]);
        foreach ($listings as $listing) {
            abort_code_unless(
                $listing->stage === RadarListingStage::Contacted,
                409,
                'radar.listing.stage_conflict',
                ['stage' => $listing->stage->value, 'listing_id' => $listing->id],
            );
        }

        $reply->forceFill([
            'confirmed_by_id' => $by->id,
            'confirmed_at' => now(),
            'confirmation_reason' => $discordances === [] ? null : $reason,
        ])->save();

        $moved = $this->move($listings, RadarListingStage::Consented);

        // TCK-2389 — l'accord ouvre la lecture des photos : seule une annonce-URL en a (texte et captures : la réserve
        // se remplit à la main). Mis en file après le commit par la connexion.
        foreach ($listings->whereIn('id', $moved)->filter(fn (RadarListing $listing) => $listing->photoPreparable()) as $listing) {
            PrepareRadarListingPhotos::dispatch($listing->id);
        }

        return $moved;
    }

    /**
     * Les annonces encore `contacted` passent à cette étape.
     *
     * @param  Collection<int, RadarListing>  $listings
     * @return list<int> celles qui ont bougé
     */
    private function move(Collection $listings, RadarListingStage $to): array
    {
        $moved = [];
        foreach ($listings->where('stage', RadarListingStage::Contacted) as $listing) {
            $listing->stage = $to;
            $listing->save();
            $moved[] = (int) $listing->id;
        }

        return $moved;
    }

    /**
     * STOP : la révocation ({@see AdvertiserRevocation::apply()}, qui réunit ce que le STOP et le geste de l'opérateur font
     * tous deux) : l'annonceur ne se contacte plus (`do_not_contact_at`, avec l'empreinte de son numéro), ses annonces
     * ouvertes passent `do_not_contact`, ses accords valides sont retirés et ses biens publiés quittent le public. Les annonces
     * closes (doublon, écartée, refusée, purgée) restent telles quelles. **La purge part en file après le commit**
     * ({@see PurgeRadarAdvertiser}) : « dès un STOP » (ADR-0077 §9).
     *
     * @param  Collection<int, RadarListing>  $listings  toutes les annonces de l'annonceur, verrouillées
     * @param  list<int>  $revoked  rempli : les accords retirés
     * @param  list<int>  $retired  rempli : les biens retirés du public
     * @return list<int> les annonces fermées
     */
    private function stop(RadarAdvertiser $advertiser, Collection $listings, array &$revoked, array &$retired): array
    {
        $applied = $this->revocation->apply($advertiser, $listings);
        $revoked = $applied['revoked_consents'];
        $retired = $applied['retired_properties'];

        return $applied['closed'];
    }

    /**
     * Le motif écrit, rogné aux deux bouts (espaces, contrôles et caractères de format invisibles, comme
     * {@see ConsentMessageComposer::part()}), ou null : une chaîne qui n'en garde rien n'est pas un motif.
     */
    private static function written(?string $reason): ?string
    {
        $trimmed = $reason === null ? '' : (string) preg_replace('/^[\p{Cc}\p{Cf}\p{Z}\s]+|[\p{Cc}\p{Cf}\p{Z}\s]+$/u', '', $reason);

        return $trimmed === '' ? null : $trimmed;
    }
}
