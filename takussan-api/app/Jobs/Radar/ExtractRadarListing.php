<?php

namespace App\Jobs\Radar;

use App\Ai\Agents\RadarExtraction;
use App\Ai\Usages\RadarExtractionUsage;
use App\Jobs\Concerns\RunsOnAiQueue;
use App\Models\AiSuggestion;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiRefusalReason;
use App\Models\Enums\AiSuggestionDecision;
use App\Models\Enums\RadarAdvertiserNature;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Services\Ai\AiErrorCode;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiRequest;
use App\Services\Ai\Evaluation\EvalCaseAnonymizer;
use App\Services\Ai\Exceptions\AiRefused;
use App\Services\Ai\Exceptions\AiUnavailable;
use App\Services\Ai\ExternalContent;
use App\Services\Ai\SuggestionRecorder;
use App\Services\Radar\Exceptions\RadarFetchDeferred;
use App\Services\Radar\Exceptions\RadarFetchRefused;
use App\Services\Radar\ExtractionNormalizer;
use App\Services\Radar\HtmlCleaner;
use App\Services\Radar\RadarAdvertiserDirectory;
use App\Services\Radar\RadarReviewFields;
use App\Services\Radar\UrlFetcher;
use App\Support\RadarPhone;
use DateTimeInterface;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Support\Facades\DB;
use Laravel\Ai\Files\Image;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Throwable;

/**
 * TCK-2386 (ADR-0077 §5) — l'extraction d'une annonce saisie. Mise en file par
 * `RadarListingIntake` après le commit de la saisie, jamais pour une annonce déjà connue ni pour un
 * annonceur qui a dit STOP. La saisie n'attend jamais ce job.
 *
 * Dans l'ordre :
 *  1. **idempotent** : rien si l'annonce n'est plus `captured` ;
 *  2. **une URL sans texte est lue, et ce passage s'arrête là** (`UrlFetcher` + `HtmlCleaner`) :
 *     `raw_text` et `photo_urls` sont gardés, le refus STOP et la page vide sont jugés, puis le job
 *     se relâche (`release(0)`) — l'appel au modèle a son propre passage, donc tout le `$timeout`
 *     pour lui, et la reprise ne relit pas la page. Lecture remise à plus tard → `release()` ;
 *     refusée → `extraction_failed` avec son code `radar.fetch.*` ;
 *  3. **refus STOP** : un numéro du texte chez un annonceur qui a dit STOP → `do_not_contact`, sans
 *     appel IA (`RadarAdvertiserDirectory::refusedAmong()`, la même lecture qu'à la saisie) ;
 *  4. **l'appel** `radar.extraction` par la passerelle, le texte délimité par `ExternalContent`, les
 *     captures en pièces jointes lues par leur disque (`Image::fromStorage`, jamais `getPath()`) —
 *     la passerelle joue alors le rôle `vision` ;
 *  5. **la sortie relue** par `ExtractionNormalizer`. Le refus STOP est rejugé sur TOUS les numéros
 *     (ceux du texte et ceux de la sortie, même écartés) ; sinon l'annonceur du premier numéro est
 *     rattaché — ceux de la sortie que le texte porte d'abord, dans l'ordre du modèle, puis ceux du
 *     texte (pour une source texte ou URL, un numéro que le modèle est seul à donner ne désigne
 *     personne). Il est trouvé
 *     ou créé SOUS le verrou de l'annonce, puis son refus relu sous le sien (ordre : l'annonce,
 *     puis l'annonceur). Un STOP → `do_not_contact`, l'extraction n'est pas gardée et l'annonceur
 *     n'est pas enrichi ; l'enrichissement ne lit que des champs sans drapeau.
 *  6. **la suggestion** (TCK-2387, ADR-0076 §7) : sur la branche du succès, dans la même transaction que
 *     le passage en `extracted`, UNE suggestion `radar.extraction` — la proposition est
 *     {@see RadarReviewFields::values()} (valeurs normalisées, ni téléphone ni nom), l'`input_snapshot` l'entrée
 *     délimitée envoyée au modèle (composée une fois), anonymisée à l'écriture par `EvalCaseAnonymizer` avec le
 *     nom et les numéros lus (retenus et écartés) pour aiguilles ; `null` pour des captures. Son seul lecteur
 *     est l'export des cas d'évaluation, dont les aiguilles (la proposition, la valeur retenue) n'ont ni nom ni
 *     numéro. Une suggestion précédente encore en attente s'efface dans la même transaction. Une annonce lue avec des `photo_urls` met ensuite
 *     `FingerprintRadarSourcePhotos` en file, après le commit.
 *
 * **En attente, pas en échec** (étape `captured`, motif dans `stage_reason`) : plafond ou
 * coupe-circuit (`ai.budget`, `ai.kill_switch`, reprise à 30 min), panne (`ai.providers_unavailable`
 * et les erreurs passagères du fournisseur, reprises à 1, 5, 15 puis 60 min), lecture d'URL
 * différée, première sortie invalide ou coupée. Le tout dans la fenêtre de `retryUntil()` (48 h),
 * au-delà de laquelle `failed()` passe l'annonce en `extraction_failed` avec le dernier motif.
 *
 * **En échec sans attendre** : refus de la passerelle autre que le plafond (`ai.forbidden`…),
 * erreur déterministe du fournisseur (`ai.request_rejected`, `ai.provider_auth` : la rejouer rendrait
 * la même), erreur de programmation (`\Error` : `radar.extraction.error`, rapportée), seconde
 * sortie invalide, illisible ou coupée, source vide. Un imprévu qui n'est pas une `\Error`
 * (`ai.unexpected` : lecture R2, base…) est passager : il attend, espacé.
 *
 * **Une tentative** (`extraction_attempts`) = un passage où la passerelle a passé ses refus et
 * cherché un modèle : le fournisseur a été appelé (réponse, panne, erreur), ou aucun modèle n'est
 * affecté. Une pause (plafond, coupe-circuit), une lecture d'URL, un refus STOP n'en sont pas. Le
 * rang de la tentative espace les reprises après panne.
 *
 * **Une seule nouvelle tentative** pour une sortie invalide (structurée nulle, clé de premier niveau
 * manquante, normalisation qui lève), illisible (`ai.response_invalid`, JSON du fournisseur) ou
 * coupée sur tous les maillons (`ai.response_truncated`, `ai.response_filtered`). « Déjà retentée » se lit sans colonne de plus : le motif vaut ce code à
 * l'entrée du passage. Un autre motif posé entre-temps remet ce compte à zéro — au pire, un appel
 * de plus.
 *
 * **Délais** : `$timeout` reste sous le `retry_after` de `database` (90 s, ADR-0078). Le délai d'un
 * appel est borné par l'agent (`RadarExtraction::timeout()`) pour que TOUS les maillons de la
 * chaîne jouée, nouvelle tentative du SDK comprise, tiennent dans
 * {@see self::AI_CALL_BUDGET_SECONDS} : un
 * fournisseur muet lève alors une erreur de connexion, la passerelle bascule sur le maillon suivant,
 * et le dernier rend `AiUnavailable` — une attente espacée, pas un job tué. Un dépassement reste
 * possible (lecture des captures, base lente) : il ne fait pas échouer le job (`$failOnTimeout`
 * faux, pas de `$maxExceptions`), la file le reprend, et seule la fenêtre de 48 h est terminale.
 * Le coût d'une boucle d'exceptions imprévues est borné par le plafond de l'usage.
 *
 * **Concurrence** : deux exécutions du même job ne se chevauchent pas (`WithoutOverlapping` par
 * annonce, la seconde est relâchée puis ne trouve plus l'annonce `captured`) ; et toute écriture
 * d'issue relit l'annonce sous `lockForUpdate`, dans une transaction courte, et n'écrit que si elle
 * est encore `captured`. Aucune transaction ne reste ouverte pendant la lecture d'URL ni l'appel.
 */
final class ExtractRadarListing implements ShouldQueue
{
    use Queueable, RunsOnAiQueue;

    public const REASON_INVALID_OUTPUT = 'radar.extraction.invalid_output';

    public const REASON_EMPTY_SOURCE = 'radar.extraction.empty_source';

    public const REASON_TIMEOUT = 'radar.extraction.timeout';

    public const REASON_ERROR = 'radar.extraction.error';

    public const REASON_FETCH_DEFERRED = 'radar.fetch.deferred';

    /** Les motifs qui n'ont droit qu'à une nouvelle tentative : la rejouer rend souvent la même. */
    public const RETRY_ONCE_REASONS = [self::REASON_INVALID_OUTPUT, 'ai.response_invalid', 'ai.response_truncated', 'ai.response_filtered'];

    /** Erreurs du fournisseur qu'une reprise ne corrige pas : la requête ou la clé est refusée. */
    public const DETERMINISTIC_PROVIDER_ERRORS = ['ai.request_rejected', 'ai.provider_auth'];

    /** Reprise après un plafond atteint ou un coupe-circuit, en secondes. */
    public const PAUSED_RETRY_SECONDS = 1800;

    /** Reprises après une panne, selon le rang de la tentative : 1, 5, 15, puis 60 min. */
    public const OUTAGE_RETRY_SECONDS = [60, 300, 900, 3600];

    /** Reprise après une première sortie invalide ou coupée. */
    public const RETRY_ONCE_SECONDS = 60;

    /** ADR-0078 : sous le `retry_after` de `database` (90 s), à 5 s de marge. */
    public const TIMEOUT_SECONDS = 85;

    /**
     * Le temps laissé à l'appel, tous maillons compris : le `$timeout` moins 10 s pour le reste du
     * passage (lecture de l'annonce et des captures, journal, écriture). `RadarExtraction::timeout()`
     * le partage entre les maillons de la chaîne jouée.
     */
    public const AI_CALL_BUDGET_SECONDS = self::TIMEOUT_SECONDS - 10;

    public int $timeout = self::TIMEOUT_SECONDS;

    public bool $failOnTimeout = false;

    public function __construct(public readonly int $listingId)
    {
        $this->onAiQueue();
    }

    public function retryUntil(): DateTimeInterface
    {
        return now()->addHours(48);
    }

    /** @return list<int> */
    public function backoff(): array
    {
        return self::OUTAGE_RETRY_SECONDS;
    }

    /** @return list<object> */
    public function middleware(): array
    {
        return [(new WithoutOverlapping((string) $this->listingId))->releaseAfter(30)->expireAfter($this->timeout + 30)];
    }

    public function handle(
        UrlFetcher $fetcher,
        HtmlCleaner $cleaner,
        AiGateway $gateway,
        ExtractionNormalizer $normalizer,
        RadarAdvertiserDirectory $directory,
        SuggestionRecorder $recorder,
        EvalCaseAnonymizer $anonymizer,
    ): void {
        $listing = RadarListing::query()->find($this->listingId);
        if ($listing === null || $listing->stage !== RadarListingStage::Captured) {
            return;
        }
        $enteredWith = $listing->stage_reason;

        // 2. Une URL sans texte : ce passage lit la page, et rien d'autre.
        if ($listing->source_kind === RadarSourceKind::Url && $listing->raw_text === null) {
            $this->readPage($listing, $fetcher, $cleaner, $directory);

            return;
        }

        $text = trim((string) $listing->raw_text);

        // 3. Un numéro qui a dit STOP : aucun appel au modèle.
        if ($this->refuseIfStopped($directory, RadarPhone::fromText($text))) {
            return;
        }

        $attachments = $listing->source_kind === RadarSourceKind::Captures
            ? $listing->getMedia('radar_captures')->map(fn (Media $media) => Image::fromStorage($media->getPathRelativeToRoot(), $media->disk)
                ->withMimeType((string) $media->mime_type))->values()->all()
            : [];
        if ($text === '' && $attachments === []) {
            $this->markFailed(self::REASON_EMPTY_SOURCE);

            return;
        }

        // 4. L'appel, hors de toute transaction. L'entrée délimitée se compose UNE fois : celle qui part au
        // modèle est, par construction, celle dont la suggestion garde la trace.
        $input = ExternalContent::wrap($listing->source_site->value, $text);
        try {
            $result = $gateway->run(new AiRequest(
                RadarExtractionUsage::KEY,
                $input,
                [AiDataClass::Personnelle],
                actor: $listing->capturer,
                subject: $listing,
                attachments: $attachments,
            ));
        } catch (AiRefused $e) {
            // Refusé avant le fournisseur : pas une tentative.
            if (in_array($e->reason, [AiRefusalReason::Budget, AiRefusalReason::KillSwitch], true)) {
                $this->pending('ai.'.$e->reason->value, self::PAUSED_RETRY_SECONDS);
            } else {
                $this->markFailed('ai.'.$e->reason->value);
            }

            return;
        } catch (AiUnavailable $e) {
            $attempts = $this->countAttempt();
            $previous = $e->getPrevious();
            $code = $previous instanceof AiUnavailable && in_array($previous->getMessage(), self::RETRY_ONCE_REASONS, true)
                ? $previous->getMessage()
                : $e->getMessage();
            in_array($code, self::RETRY_ONCE_REASONS, true)
                ? $this->retryOnce($code, $enteredWith)
                : $this->pending($code, $this->outageDelay($attempts));

            return;
        } catch (Throwable $e) {
            // Une erreur que la passerelle ne bascule pas : journalisée par elle, rangée ici.
            report($e);
            $attempts = $this->countAttempt();
            $code = AiErrorCode::fromThrowable($e);
            match (true) {
                $e instanceof \Error => $this->markFailed(self::REASON_ERROR),
                in_array($code, self::DETERMINISTIC_PROVIDER_ERRORS, true) => $this->markFailed($code),
                in_array($code, self::RETRY_ONCE_REASONS, true) => $this->retryOnce($code, $enteredWith),
                default => $this->pending($code, $this->outageDelay($attempts)),
            };

            return;
        }
        $this->countAttempt();

        // 5. La sortie relue par du code.
        $normalized = null;
        if (is_array($result->structured) && self::hasEveryKey($result->structured)) {
            try {
                $normalized = $normalizer->normalize($result->structured, $listing->source_kind === RadarSourceKind::Captures ? null : $text);
            } catch (Throwable $e) {
                report($e);
            }
        }
        if ($normalized === null) {
            $this->retryOnce(self::REASON_INVALID_OUTPUT, $enteredWith);

            return;
        }

        // L'annonceur se choisit d'abord parmi les numéros que le modèle a rendus ET que la
        // normalisation a gardés (présents dans le texte, sauf pour des captures), dans son ordre :
        // le choix du contact principal lui revient (décision du porteur, 2026-10-27). Les numéros
        // du texte suivent, pour le cas où il n'en a gardé aucun.
        $phones = self::canonicalPhones([...(array) ($normalized['phones'] ?? []), ...RadarPhone::fromText($text)]);
        // Le refus se juge sur chaque numéro, pas sur le seul premier — y compris ceux du modèle
        // que la normalisation a écartés : prudence.
        if ($this->refuseIfStopped($directory, self::canonicalPhones([...$phones, ...(array) ($result->structured['phones'] ?? [])]))) {
            return;
        }

        // L'instantané garde l'entrée envoyée, anonymisée DÈS L'ÉCRITURE par le masqueur de l'export : le nom
        // et les numéros que la lecture a trouvés (retenus et écartés) deviennent [NOM] et [TELEPHONE].
        // L'export n'a pour aiguilles que la proposition et la valeur retenue, qui n'ont ni nom ni numéro.
        $snapshot = $listing->source_kind === RadarSourceKind::Captures ? null : $anonymizer->anonymize($input, [
            'advertiser_name' => $normalized['advertiser_name']['value'] ?? null,
            'phones' => [...(array) ($normalized['phones'] ?? []), ...(array) ($normalized['phones_dropped'] ?? [])],
        ])['input'];

        $fingerprintPhotos = false;
        $this->settle(function (RadarListing $l) use ($normalized, $phones, $directory, $recorder, $result, $snapshot, &$fingerprintPhotos): void {
            // Sous le verrou de l'annonce (encore `captured`) : aucun annonceur n'est créé pour une
            // annonce passée à autre chose. Ordre des verrous : l'annonce, puis l'annonceur.
            $advertiser = $phones !== [] ? $directory->findOrCreate($phones[0]) : null;
            // Relu sous verrou : un STOP dit depuis la lecture ci-dessus l'emporte.
            $locked = $advertiser !== null ? RadarAdvertiser::query()->whereKey($advertiser->id)->lockForUpdate()->first() : null;
            if ($locked?->do_not_contact_at !== null) {
                $l->fill(['stage' => RadarListingStage::DoNotContact, 'stage_reason' => null, 'radar_advertiser_id' => $locked->id]);
                // TCK-2391 : un numéro qui a dit STOP ne garde pas la matière de l'annonce jusqu'au passage quotidien.
                PurgeRadarAdvertiser::dispatch($locked->id)->afterCommit();

                return;
            }
            // Une purge entre `findOrCreate()` et le verrou ne voyait pas encore cette annonce : elle a pu effacer le numéro rendu.
            if ($locked !== null) {
                $directory->restorePhone($locked, $phones[0]);
            }

            $l->fill([
                'stage' => RadarListingStage::Extracted,
                'stage_reason' => null,
                'extracted' => $normalized,
                'extracted_at' => now(),
                'radar_advertiser_id' => $locked?->id,
            ]);
            // TCK-2387 (ADR-0076 §7) — au plus une suggestion en attente par annonce ; une précédente,
            // jamais jugée, s'efface (la rejeter compterait un échec du modèle dans le taux d'acceptation).
            AiSuggestion::query()
                ->where('usage_key', RadarExtractionUsage::KEY)
                ->where('subject_type', $l->getMorphClass())->where('subject_id', $l->getKey())
                ->where('decision', AiSuggestionDecision::Pending->value)
                ->delete();
            $recorder->record(
                $result,
                $l,
                inputSnapshot: $snapshot,
                proposal: RadarReviewFields::values($normalized),
            );
            if ($locked !== null) {
                $this->enrich($locked, $normalized);
            }
            $fingerprintPhotos = $l->fingerprintable() && ($l->photo_urls ?? []) !== [];
        });

        // Seulement pour une fiche lue qui a des photos, et après le commit : une annonce STOP ne fait
        // télécharger aucune photo.
        if ($fingerprintPhotos) {
            FingerprintRadarSourcePhotos::dispatch($this->listingId)->afterCommit();
        }
    }

    /**
     * Appelé par le worker quand la fenêtre de 48 h est passée : l'annonce encore `captured` passe
     * en `extraction_failed` avec son dernier motif, à défaut `radar.extraction.timeout`. Une issue
     * déjà écrite n'est jamais réécrite.
     */
    public function failed(?Throwable $e): void
    {
        RadarListing::query()
            ->whereKey($this->listingId)
            ->where('stage', RadarListingStage::Captured->value)
            ->update([
                'stage' => RadarListingStage::ExtractionFailed->value,
                'stage_reason' => DB::raw("coalesce(stage_reason, '".self::REASON_TIMEOUT."')"),
                'updated_at' => now(),
            ]);
    }

    /**
     * La page est lue, nettoyée et gardée ; le STOP et la page vide sont jugés sur son texte ; puis
     * le job se relâche pour que l'appel ait son propre passage.
     */
    private function readPage(RadarListing $listing, UrlFetcher $fetcher, HtmlCleaner $cleaner, RadarAdvertiserDirectory $directory): void
    {
        try {
            $page = $fetcher->fetch((string) $listing->source_url);
        } catch (RadarFetchDeferred $e) {
            $this->pending(self::REASON_FETCH_DEFERRED, $e->retryAfterSeconds);

            return;
        } catch (RadarFetchRefused $e) {
            $this->markFailed($e->code);

            return;
        }

        $clean = $cleaner->clean($page->body, $page->url);
        $text = $clean->title !== null && ! str_contains($clean->text, $clean->title)
            ? trim($clean->title."\n".$clean->text)
            : trim($clean->text);
        if (! $this->settle(fn (RadarListing $l) => $l->fill(['raw_text' => $text, 'photo_urls' => $clean->photoUrls, 'stage_reason' => null]))) {
            return;
        }

        if ($this->refuseIfStopped($directory, RadarPhone::fromText($text))) {
            return;
        }
        if ($text === '') {
            $this->markFailed(self::REASON_EMPTY_SOURCE);

            return;
        }

        $this->release(0);
    }

    /**
     * `do_not_contact` si l'un de ces numéros a dit STOP (annonceur rattaché) ; vrai si c'est le cas.
     *
     * @param  list<string>  $phones
     */
    private function refuseIfStopped(RadarAdvertiserDirectory $directory, array $phones): bool
    {
        $stop = $directory->refusedAmong($phones);
        if ($stop === null) {
            return false;
        }

        $this->settle(function (RadarListing $l) use ($stop): void {
            $l->fill(['stage' => RadarListingStage::DoNotContact, 'stage_reason' => null, 'radar_advertiser_id' => $stop->id]);
            // TCK-2391 : la matière de l'annonce part « dès un STOP », pas au passage quotidien.
            PurgeRadarAdvertiser::dispatch($stop->id)->afterCommit();
        });

        return true;
    }

    /** Une nouvelle tentative si ce motif n'était pas déjà celui de l'entrée, sinon l'échec. */
    private function retryOnce(string $reason, ?string $enteredWith): void
    {
        $enteredWith === $reason ? $this->markFailed($reason) : $this->pending($reason, self::RETRY_ONCE_SECONDS);
    }

    /** Les clés de premier niveau du schéma : une sortie qui en manque n'est pas celle du schéma. */
    private static function hasEveryKey(array $structured): bool
    {
        $expected = [...RadarExtraction::PROPERTY_FIELDS, ...RadarExtraction::ADVERTISER_FIELDS, 'phones', 'nature_signals'];

        return array_diff($expected, array_keys($structured)) === [];
    }

    /**
     * Les numéros valides, en E.164, dédoublonnés, dans l'ordre.
     *
     * @param  list<mixed>  $candidates
     * @return list<string>
     */
    private static function canonicalPhones(array $candidates): array
    {
        $phones = [];
        foreach ($candidates as $candidate) {
            $e164 = is_string($candidate) ? RadarPhone::canonical($candidate) : null;
            if ($e164 !== null) {
                $phones[$e164] = true;
            }
        }

        return array_keys($phones);
    }

    private function countAttempt(): int
    {
        RadarListing::query()->whereKey($this->listingId)->increment('extraction_attempts');

        return (int) RadarListing::query()->whereKey($this->listingId)->value('extraction_attempts');
    }

    private function outageDelay(int $attempts): int
    {
        $delays = self::OUTAGE_RETRY_SECONDS;

        return $delays[min(max($attempts, 1), count($delays)) - 1];
    }

    /** `extraction_failed` avec ce motif, si l'annonce est encore `captured`. */
    private function markFailed(string $reason): void
    {
        $this->settle(fn (RadarListing $l) => $l->fill(['stage' => RadarListingStage::ExtractionFailed, 'stage_reason' => $reason]));
    }

    /** En attente : l'annonce reste `captured`, son motif posé, et le job revient plus tard. */
    private function pending(string $reason, int $delaySeconds): void
    {
        if ($this->settle(fn (RadarListing $l) => $l->fill(['stage_reason' => $reason]))) {
            $this->release($delaySeconds);
        }
    }

    /**
     * Écrit une issue SEULEMENT si l'annonce est encore `captured` : relue sous verrou, dans une
     * transaction courte. Rend faux si elle a changé d'étape entre-temps (rien n'est écrit).
     *
     * @param  callable(RadarListing): void  $apply
     */
    private function settle(callable $apply): bool
    {
        return DB::transaction(function () use ($apply): bool {
            $fresh = RadarListing::query()->whereKey($this->listingId)->lockForUpdate()->first();
            if ($fresh === null || $fresh->stage !== RadarListingStage::Captured) {
                return false;
            }
            $apply($fresh);
            $fresh->save();

            return true;
        });
    }

    /**
     * Le nom affiché, la nature et ses indices d'un annonceur déjà verrouillé (et qui n'a pas dit
     * STOP), posés s'ils sont vides (nature `unknown`) : la première annonce lue ne les voit pas
     * réécrits par la suivante. Le nom et la nature ne se prennent qu'à un champ sans drapeau.
     *
     * @param  array<string, mixed>  $normalized
     */
    private function enrich(RadarAdvertiser $locked, array $normalized): void
    {
        if ($locked->do_not_contact_at !== null) {
            return;
        }

        // Seulement un champ que la normalisation n'a pas signalé (passage absent ou introuvable,
        // valeur invalide) : ce qui est posé ici ne se réécrit plus.
        $name = self::unflagged($normalized, 'advertiser_name');
        if (($locked->display_name === null || trim($locked->display_name) === '') && is_string($name) && trim($name) !== '') {
            $locked->display_name = mb_substr(trim($name), 0, 120);
        }

        $nature = RadarAdvertiserNature::tryFrom((string) self::unflagged($normalized, 'advertiser_nature'));
        if (($locked->nature ?? RadarAdvertiserNature::Unknown) === RadarAdvertiserNature::Unknown && $nature !== null) {
            $locked->nature = $nature;
        }

        $signals = $normalized['nature_signals'] ?? [];
        if (($locked->nature_signals ?? []) === [] && is_array($signals) && $signals !== []) {
            $locked->nature_signals = $signals;
        }

        if ($locked->isDirty()) {
            $locked->save();
        }
    }

    /**
     * La valeur d'un champ normalisé, s'il ne porte aucun drapeau ; sinon null.
     *
     * @param  array<string, mixed>  $normalized
     */
    private static function unflagged(array $normalized, string $field): mixed
    {
        $entry = $normalized[$field] ?? null;

        return is_array($entry) && ($entry['flags'] ?? null) === [] ? ($entry['value'] ?? null) : null;
    }
}
