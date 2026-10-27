<?php

namespace App\Jobs\Radar;

use App\Ai\Agents\RadarExtraction;
use App\Ai\Usages\RadarExtractionUsage;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiRefusalReason;
use App\Models\Enums\RadarAdvertiserNature;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Services\Ai\AiErrorCode;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiRequest;
use App\Services\Ai\Exceptions\AiRefused;
use App\Services\Ai\Exceptions\AiUnavailable;
use App\Services\Ai\ExternalContent;
use App\Services\Radar\Exceptions\RadarFetchDeferred;
use App\Services\Radar\Exceptions\RadarFetchRefused;
use App\Services\Radar\ExtractionNormalizer;
use App\Services\Radar\HtmlCleaner;
use App\Services\Radar\RadarAdvertiserDirectory;
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
 *  2. **une URL sans texte est lue** (`UrlFetcher` + `HtmlCleaner`) : `raw_text` et `photo_urls`
 *     sont gardés dès la lecture, une reprise ne relit pas la page. Lecture remise à plus tard →
 *     `release()` ; refusée → `extraction_failed` avec son code `radar.fetch.*` ;
 *  3. **refus STOP** : un numéro du texte chez un annonceur qui a dit STOP → `do_not_contact`, sans
 *     appel IA (`RadarAdvertiserDirectory::refusedAmong()`, la même lecture qu'à la saisie) ;
 *  4. **l'appel** `radar.extraction` par la passerelle, le texte délimité par `ExternalContent`, les
 *     captures en pièces jointes lues par leur disque (`Image::fromStorage`, jamais `getPath()`) —
 *     la passerelle joue alors le rôle `vision` ;
 *  5. **la sortie relue** par `ExtractionNormalizer`, puis l'annonceur rattaché (premier numéro
 *     valide de la sortie, à défaut du texte) ; un annonceur qui a dit STOP → `do_not_contact`, et
 *     l'extraction n'est pas gardée.
 *
 * **En attente, pas en échec** (étape `captured`, motif dans `stage_reason`) : plafond ou
 * coupe-circuit (`ai.budget`, `ai.kill_switch`, reprise à 30 min), panne de tous les maillons
 * (`ai.providers_unavailable`, reprises à 1, 5, 15 puis 60 min selon `extraction_attempts`),
 * lecture d'URL différée, première sortie invalide. Le tout dans la fenêtre de `retryUntil()`
 * (48 h), au-delà de laquelle `failed()` passe l'annonce en `extraction_failed` avec le dernier
 * motif.
 *
 * **Une tentative** (`extraction_attempts`) = un passage qui atteint la lecture de l'URL ou l'appel
 * au modèle, compté une fois par passage, avant l'un ou l'autre. Un passage qui ne fait rien
 * (annonce déjà traitée) ou qui s'arrête au refus STOP ne compte pas.
 *
 * **Sortie invalide** (sortie structurée nulle, clé de premier niveau manquante, normalisation qui
 * lève) : une seule nouvelle tentative, puis `extraction_failed`. « Déjà retentée » se lit sans
 * colonne de plus : le motif vaut `radar.extraction.invalid_output` à l'entrée du passage. Un autre
 * motif posé entre-temps (une panne) remet ce compte à zéro — au pire, un appel de plus.
 *
 * **Concurrence** : deux exécutions du même job ne se chevauchent pas (`WithoutOverlapping` par
 * annonce, la seconde est relâchée puis ne trouve plus l'annonce `captured`) ; et toute écriture
 * d'issue relit l'annonce sous `lockForUpdate`, dans une transaction courte, et n'écrit que si elle
 * est encore `captured`. Aucune transaction ne reste ouverte pendant la lecture d'URL ni l'appel.
 *
 * **File** : `database` (ADR-0078), un seul appel au modèle par passage. `$timeout` reste sous le
 * délai de reprise de la connexion (90 s) ; un dépassement ne fait pas échouer le job, la file le
 * reprend (`$failOnTimeout` faux) dans la fenêtre de 48 h.
 */
final class ExtractRadarListing implements ShouldQueue
{
    use Queueable;

    public const REASON_INVALID_OUTPUT = 'radar.extraction.invalid_output';

    public const REASON_EMPTY_SOURCE = 'radar.extraction.empty_source';

    public const REASON_TIMEOUT = 'radar.extraction.timeout';

    public const REASON_FETCH_DEFERRED = 'radar.fetch.deferred';

    /** Reprise après un plafond atteint ou un coupe-circuit, en secondes. */
    public const PAUSED_RETRY_SECONDS = 1800;

    /** Reprises après une panne, selon le rang de la tentative : 1, 5, 15, puis 60 min. */
    public const OUTAGE_RETRY_SECONDS = [60, 300, 900, 3600];

    /** Reprise après une première sortie invalide. */
    public const INVALID_OUTPUT_RETRY_SECONDS = 60;

    /** ADR-0078 : sous le `retry_after` de `database` (90 s), à 5 s de marge. */
    public int $timeout = 85;

    public bool $failOnTimeout = false;

    /**
     * Une exception imprévue (ni refus ni panne, déjà rangés) n'est pas rejouée 48 h durant : au
     * cinquième, `failed()` passe l'annonce en `extraction_failed` avec son dernier motif.
     */
    public int $maxExceptions = 5;

    public function __construct(public readonly int $listingId) {}

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
    ): void {
        $listing = RadarListing::query()->find($this->listingId);
        if ($listing === null || $listing->stage !== RadarListingStage::Captured) {
            return;
        }
        $retriedInvalidOutput = $listing->stage_reason === self::REASON_INVALID_OUTPUT;
        $counted = false;

        // 2. Une URL sans texte : la page est lue une fois, son texte gardé.
        if ($listing->source_kind === RadarSourceKind::Url && $listing->raw_text === null) {
            $attempts = $this->countAttempt($listing);
            $counted = true;
            try {
                $page = $fetcher->fetch((string) $listing->source_url);
            } catch (RadarFetchDeferred $e) {
                $this->pending(self::REASON_FETCH_DEFERRED, $e->retryAfterSeconds);

                return;
            } catch (RadarFetchRefused $e) {
                $this->settle(fn (RadarListing $l) => $l->fill(['stage' => RadarListingStage::ExtractionFailed, 'stage_reason' => $e->code]));

                return;
            }

            $clean = $cleaner->clean($page->body, $page->url);
            $text = $clean->title !== null && ! str_contains($clean->text, $clean->title)
                ? trim($clean->title."\n".$clean->text)
                : $clean->text;
            if (! $this->settle(fn (RadarListing $l) => $l->fill(['raw_text' => $text, 'photo_urls' => $clean->photoUrls]))) {
                return;
            }
            $listing->forceFill(['raw_text' => $text, 'photo_urls' => $clean->photoUrls, 'extraction_attempts' => $attempts]);
        }

        $text = trim((string) $listing->raw_text);

        // 3. Un numéro qui a dit STOP : aucun appel au modèle.
        $stop = $directory->refusedAmong(RadarPhone::fromText($text));
        if ($stop !== null) {
            $this->settle(fn (RadarListing $l) => $l->fill([
                'stage' => RadarListingStage::DoNotContact, 'stage_reason' => null, 'radar_advertiser_id' => $stop->id,
            ]));

            return;
        }

        $attachments = $listing->source_kind === RadarSourceKind::Captures
            ? $listing->getMedia('radar_captures')->map(fn (Media $media) => Image::fromStorage($media->getPathRelativeToRoot(), $media->disk)
                ->withMimeType((string) $media->mime_type))->values()->all()
            : [];
        if ($text === '' && $attachments === []) {
            $this->settle(fn (RadarListing $l) => $l->fill(['stage' => RadarListingStage::ExtractionFailed, 'stage_reason' => self::REASON_EMPTY_SOURCE]));

            return;
        }

        // 4. L'appel, hors de toute transaction.
        $attempts = $counted ? $listing->extraction_attempts : $this->countAttempt($listing);
        try {
            $result = $gateway->run(new AiRequest(
                RadarExtractionUsage::KEY,
                ExternalContent::wrap($listing->source_site->value, $text),
                [AiDataClass::Personnelle],
                actor: $listing->capturer,
                subject: $listing,
                attachments: $attachments,
            ));
        } catch (AiRefused $e) {
            if (in_array($e->reason, [AiRefusalReason::Budget, AiRefusalReason::KillSwitch], true)) {
                $this->pending('ai.'.$e->reason->value, self::PAUSED_RETRY_SECONDS);
            } else {
                $this->settle(fn (RadarListing $l) => $l->fill(['stage' => RadarListingStage::ExtractionFailed, 'stage_reason' => 'ai.'.$e->reason->value]));
            }

            return;
        } catch (AiUnavailable $e) {
            $this->pending($e->getMessage(), $this->outageDelay($attempts));

            return;
        } catch (Throwable $e) {
            // Une erreur du fournisseur que la passerelle ne bascule pas (401, 400…) : journalisée
            // par elle, rangée ici comme une panne, en attente.
            report($e);
            $this->pending(AiErrorCode::fromThrowable($e), $this->outageDelay($attempts));

            return;
        }

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
            if ($retriedInvalidOutput) {
                $this->settle(fn (RadarListing $l) => $l->fill(['stage' => RadarListingStage::ExtractionFailed, 'stage_reason' => self::REASON_INVALID_OUTPUT]));
            } else {
                $this->pending(self::REASON_INVALID_OUTPUT, self::INVALID_OUTPUT_RETRY_SECONDS);
            }

            return;
        }

        $phone = self::firstPhone([...(array) ($normalized['phones'] ?? []), ...RadarPhone::fromText($text)]);
        $advertiser = $phone !== null ? $directory->findOrCreate($phone) : null;

        if ($advertiser?->do_not_contact_at !== null) {
            $this->settle(fn (RadarListing $l) => $l->fill([
                'stage' => RadarListingStage::DoNotContact, 'stage_reason' => null, 'radar_advertiser_id' => $advertiser->id,
            ]));

            return;
        }

        $this->settle(function (RadarListing $l) use ($normalized, $advertiser): void {
            $l->fill([
                'stage' => RadarListingStage::Extracted,
                'stage_reason' => null,
                'extracted' => $normalized,
                'extracted_at' => now(),
                'radar_advertiser_id' => $advertiser?->id,
            ]);
            if ($advertiser !== null) {
                $this->enrich($advertiser, $normalized);
            }
        });
    }

    /**
     * Appelé par le worker quand la fenêtre de 48 h est passée (ou au cinquième imprévu) : l'annonce
     * encore `captured` passe en `extraction_failed` avec son dernier motif, à défaut
     * `radar.extraction.timeout`. Une issue déjà écrite n'est jamais réécrite.
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

    /** Les clés de premier niveau du schéma : une sortie qui en manque n'est pas celle du schéma. */
    private static function hasEveryKey(array $structured): bool
    {
        $expected = [...RadarExtraction::PROPERTY_FIELDS, ...RadarExtraction::ADVERTISER_FIELDS, 'phones', 'nature_signals'];

        return array_diff($expected, array_keys($structured)) === [];
    }

    /** @param  list<mixed>  $candidates */
    private static function firstPhone(array $candidates): ?string
    {
        foreach ($candidates as $candidate) {
            $e164 = is_string($candidate) ? RadarPhone::canonical($candidate) : null;
            if ($e164 !== null) {
                return $e164;
            }
        }

        return null;
    }

    private function countAttempt(RadarListing $listing): int
    {
        RadarListing::query()->whereKey($listing->id)->increment('extraction_attempts');

        return (int) RadarListing::query()->whereKey($listing->id)->value('extraction_attempts');
    }

    private function outageDelay(int $attempts): int
    {
        $delays = self::OUTAGE_RETRY_SECONDS;

        return $delays[min(max($attempts, 1), count($delays)) - 1];
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
     * Le nom affiché, la nature et ses indices de l'annonceur, posés s'ils sont vides (nature
     * `unknown`) : la première annonce lue ne les voit pas réécrits par la suivante. Sous verrou de
     * la ligne, dans la transaction de l'issue.
     *
     * @param  array<string, mixed>  $normalized
     */
    private function enrich(RadarAdvertiser $advertiser, array $normalized): void
    {
        $locked = RadarAdvertiser::query()->whereKey($advertiser->id)->lockForUpdate()->first();
        if ($locked === null) {
            return;
        }

        $name = $normalized['advertiser_name']['value'] ?? null;
        if (($locked->display_name === null || trim($locked->display_name) === '') && is_string($name) && trim($name) !== '') {
            $locked->display_name = mb_substr(trim($name), 0, 120);
        }

        $nature = RadarAdvertiserNature::tryFrom((string) ($normalized['advertiser_nature']['value'] ?? ''));
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
}
