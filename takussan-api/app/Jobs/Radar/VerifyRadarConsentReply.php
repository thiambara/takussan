<?php

namespace App\Jobs\Radar;

use App\Ai\Agents\RadarConsentVerification;
use App\Ai\Usages\RadarConsentVerificationUsage;
use App\Jobs\Concerns\RunsOnAiQueue;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiRefusalReason;
use App\Models\Enums\RadarVerificationStatus;
use App\Models\RadarConsent;
use App\Services\Ai\AiErrorCode;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiRequest;
use App\Services\Ai\AiResult;
use App\Services\Ai\Exceptions\AiRefused;
use App\Services\Ai\Exceptions\AiUnavailable;
use App\Services\Ai\SuggestionRecorder;
use App\Services\Radar\ConsentMessageComposer;
use App\Services\Radar\RadarConsentVerdict;
use App\Services\Radar\RadarVerificationDecision;
use DateTimeInterface;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;
use Laravel\Ai\Files\Image;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Throwable;

/**
 * TCK-2388 (ADR-0077 §3, ADR-0076 §7) — la vérification par l'IA d'une réponse d'annonceur déposée. Mise en file par
 * `RadarConsentWorkflow::depositReply()` après le commit ; le dépôt n'attend jamais ce job.
 *
 * **Le verdict n'est jamais une confirmation** : le job écrit `ai_verdict`, `transcript` et `done`, et rien d'autre.
 * Aucune étape d'annonce ne bouge, aucun accord ne devient valide : seule la confirmation d'un humain
 * (`confirmed_at`, tâche suivante) le fait. Les données envoyées au modèle sont les seules utiles : le texte EXACT
 * envoyé, le numéro et le nom attendus, les captures.
 *
 * **Idempotent** : rien si la réponse n'est plus `pending` ; toute écriture d'issue relit la réponse sous
 * `lockForUpdate` dans une transaction courte, et n'écrit que si elle est encore `pending`. Deux exécutions ne se
 * chevauchent pas (`WithoutOverlapping` par réponse).
 *
 * **Une réponse purgée n'est plus écrite** (TCK-2391) : le modèle répond après plusieurs secondes, et un STOP ou une révocation a pu effacer
 * la réponse entre-temps. Relue sous verrou, une réponse dont `purged_at` est posé ne reçoit ni verdict, ni transcription, ni suggestion, ni
 * motif : le job le journalise (identifiant seulement) et s'arrête. La purge la sort aussi de `pending` ({@see self::REASON_PURGED}).
 *
 * **Jamais de « pending » éternel** (le front interroge l'état) : le verdict, un échec (`failed`, motif dans
 * `verification_reason`), ou une attente dont le motif est lu (`pending` + code, reprise espacée) dans la fenêtre de
 * `retryUntil()` (24 h), au-delà de laquelle `failed()` passe la réponse en `failed` avec le dernier motif.
 *
 *  - **En attente** : plafond ou coupe-circuit (`ai.budget`, `ai.kill_switch`, reprise à 30 min), panne
 *    (`AiUnavailable` et erreurs passagères du fournisseur, reprises à 1, 5, 15 puis 60 min selon le rang du passage).
 *  - **En échec** : tout autre refus de la passerelle (`ai.forbidden`…), erreur déterministe du fournisseur,
 *    `\Error` (`radar.verification.error`, rapportée), sortie invalide (`radar.verification.invalid_output`),
 *    réponse sans capture ou sans numéro attendu.
 *
 * **Délais** (ADR-0078) : `$timeout` sous le `retry_after` de `database` (90 s) ; le délai d'un appel est borné par
 * l'agent (`RadarConsentVerification::timeout()`) pour que tous les maillons tiennent dans
 * {@see self::AI_CALL_BUDGET_SECONDS}. Un dépassement ne fait pas échouer le job (`$failOnTimeout` faux) : la file
 * le reprend, et seule la fenêtre de 24 h est terminale.
 */
final class VerifyRadarConsentReply implements ShouldQueue
{
    use Queueable, RunsOnAiQueue;

    public const REASON_ERROR = 'radar.verification.error';

    public const REASON_INVALID_OUTPUT = 'radar.verification.invalid_output';

    public const REASON_TIMEOUT = 'radar.verification.timeout';

    public const REASON_NO_CAPTURE = 'radar.verification.no_capture';

    public const REASON_NO_NUMBER = 'radar.verification.no_number';

    /** Un imprévu hors de l'appel (lecture des captures, des clauses, base) : passager, il attend comme une panne. */
    public const REASON_UNEXPECTED = 'radar.verification.unexpected';

    /** TCK-2391 : la réponse a été purgée (STOP, retrait) pendant ou avant la vérification ; la purge la sort de `pending` avec ce motif. */
    public const REASON_PURGED = 'radar.verification.purged';

    /** Erreurs du fournisseur qu'une reprise ne corrige pas : la requête ou la clé est refusée. */
    public const DETERMINISTIC_PROVIDER_ERRORS = ['ai.request_rejected', 'ai.provider_auth'];

    /** Reprise après un plafond atteint ou un coupe-circuit, en secondes. */
    public const PAUSED_RETRY_SECONDS = 1800;

    /** Reprises après une panne, selon le rang du passage : 1, 5, 15, puis 60 min. */
    public const OUTAGE_RETRY_SECONDS = [60, 300, 900, 3600];

    /** ADR-0078 : sous le `retry_after` de `database` (90 s), à 5 s de marge. */
    public const TIMEOUT_SECONDS = 85;

    /** Le temps laissé à l'appel, tous maillons compris : le `$timeout` moins 10 s pour le reste du passage. */
    public const AI_CALL_BUDGET_SECONDS = self::TIMEOUT_SECONDS - 10;

    public int $timeout = self::TIMEOUT_SECONDS;

    public bool $failOnTimeout = false;

    public function __construct(public readonly int $replyId)
    {
        $this->onAiQueue();
    }

    public function retryUntil(): DateTimeInterface
    {
        return now()->addHours(24);
    }

    /** @return list<int> */
    public function backoff(): array
    {
        return self::OUTAGE_RETRY_SECONDS;
    }

    /** @return list<object> */
    public function middleware(): array
    {
        return [(new WithoutOverlapping((string) $this->replyId))->releaseAfter(30)->expireAfter($this->timeout + 30)];
    }

    /** Vrai dès que `AiGateway::run()` a rendu : l'appel est payé, une reprise le repaierait. Jamais sérialisé utilement : propre à CE passage. */
    private bool $paid = false;

    public function handle(AiGateway $gateway, SuggestionRecorder $recorder, ConsentMessageComposer $composer, RadarVerificationDecision $decision): void
    {
        $this->paid = false;
        try {
            $this->verify($gateway, $recorder, $composer, $decision);
        } catch (Throwable $e) {
            // Tout ce qui échappe à la classification de l'appel (médias, clauses, suggestion, base) : une erreur de
            // programmation échoue ; un imprévu attend, espacé, avec SON motif — jamais le `timeout` de la fenêtre.
            // Mais APRÈS l'appel payé, attendre le repaierait à chaque reprise et viderait le budget du jour de l'usage
            // pour toutes les autres vérifications : la réponse échoue, l'opérateur tranche sur les captures.
            report($e);
            match (true) {
                $e instanceof \Error => $this->markFailed(self::REASON_ERROR),
                $this->paid => $this->markFailed(self::REASON_UNEXPECTED),
                default => $this->pending(self::REASON_UNEXPECTED, $this->outageDelay()),
            };
        }
    }

    private function verify(AiGateway $gateway, SuggestionRecorder $recorder, ConsentMessageComposer $composer, RadarVerificationDecision $decision): void
    {
        $reply = RadarConsent::query()->with(['outreach', 'advertiser', 'depositor'])->find($this->replyId);
        if ($reply === null || $reply->verification_status !== RadarVerificationStatus::Pending || $reply->purged_at !== null) {
            return;
        }

        $attachments = $reply->getMedia('radar_consent_captures')
            ->map(fn (Media $media) => Image::fromStorage($media->getPathRelativeToRoot(), $media->disk)->withMimeType((string) $media->mime_type))
            ->values()->all();
        if ($attachments === []) {
            $this->markFailed(self::REASON_NO_CAPTURE);

            return;
        }
        $advertiser = $reply->advertiser;
        if ($advertiser->phone === null) {
            // L'annonceur a dit STOP depuis le dépôt : son numéro est purgé, il n'y a plus rien à comparer ni à vérifier.
            $this->markFailed(self::REASON_NO_NUMBER);

            return;
        }

        $clauseCount = $composer->clauseCount($reply->outreach->clauses_version);
        $input = RadarConsentVerification::input($reply->outreach->message, $advertiser->phone, $advertiser->display_name, $clauseCount);
        try {
            $result = $gateway->run(new AiRequest(
                RadarConsentVerificationUsage::KEY,
                $input,
                [AiDataClass::Personnelle],
                actor: $reply->depositor,
                subject: $reply,
                attachments: $attachments,
            ));
            $this->paid = true;
        } catch (AiRefused $e) {
            // Refusé avant le fournisseur : le plafond et le coupe-circuit attendent, le reste échoue.
            if (in_array($e->reason, [AiRefusalReason::Budget, AiRefusalReason::KillSwitch], true)) {
                $this->pending('ai.'.$e->reason->value, self::PAUSED_RETRY_SECONDS);
            } else {
                $this->markFailed('ai.'.$e->reason->value);
            }

            return;
        } catch (AiUnavailable $e) {
            $this->pending($e->getMessage(), $this->outageDelay());

            return;
        } catch (Throwable $e) {
            // Une erreur que la passerelle ne bascule pas : journalisée par elle. Seule une `\Error` est un bug à rapporter ;
            // une panne passagère du fournisseur n'en est pas un.
            if ($e instanceof \Error) {
                report($e);
            }
            $code = AiErrorCode::fromThrowable($e);
            match (true) {
                $e instanceof \Error => $this->markFailed(self::REASON_ERROR),
                in_array($code, self::DETERMINISTIC_PROVIDER_ERRORS, true) => $this->markFailed($code),
                default => $this->pending($code, $this->outageDelay()),
            };

            return;
        }

        try {
            if (! is_array($result->structured)) {
                throw new InvalidArgumentException('sortie non structurée');
            }
            $verdict = RadarConsentVerdict::from($result->structured, $advertiser->phone, $clauseCount);
        } catch (InvalidArgumentException) {
            $this->markFailed(self::REASON_INVALID_OUTPUT);

            return;
        }

        $this->settle(function (RadarConsent $locked) use ($verdict, $result, $recorder, $decision): void {
            $locked->forceFill([
                'ai_verdict' => $verdict,
                'transcript' => $verdict['transcript'],
                'verification_status' => RadarVerificationStatus::Done,
                'verification_reason' => null,
            ]);
            $this->record($recorder, $result, $locked, $verdict);
            // L'humain a pu trancher PENDANT l'appel : sa décision n'est jamais réécrite, mais la suggestion qu'on vient
            // d'écrire se décide contre elle, sous le verrou de la réponse que `recordOutcome()` tient aussi.
            $decision->decideIfOutcomeKnown($locked);
        });
    }

    /**
     * Appelé par le worker quand la fenêtre de 24 h est passée : la réponse encore `pending` passe en `failed` avec son
     * dernier motif, à défaut `radar.verification.timeout`. Une issue déjà écrite n'est jamais réécrite.
     */
    public function failed(?Throwable $e): void
    {
        RadarConsent::query()
            ->whereKey($this->replyId)
            ->where('verification_status', RadarVerificationStatus::Pending->value)
            ->update([
                'verification_status' => RadarVerificationStatus::Failed->value,
                'verification_reason' => DB::raw("coalesce(verification_reason, '".self::REASON_TIMEOUT."')"),
                'updated_at' => now(),
            ]);
    }

    /**
     * La suggestion de l'usage (ADR-0076 §7) : la proposition est la classification et ce que le code a vérifié, ni
     * transcription ni numéro. Elle se décidera avec l'issue humaine du message.
     *
     * @param  array<string, mixed>  $verdict
     */
    private function record(SuggestionRecorder $recorder, AiResult $result, RadarConsent $reply, array $verdict): void
    {
        $recorder->record($result, $reply, proposal: [
            'classification' => $verdict['classification'],
            'number_matches' => $verdict['number_matches'],
            'clauses_found' => $verdict['clauses_found'],
        ]);
    }

    private function outageDelay(): int
    {
        $delays = self::OUTAGE_RETRY_SECONDS;

        return $delays[min(max($this->attempts(), 1), count($delays)) - 1];
    }

    /** `failed` avec ce motif, si la réponse est encore `pending`. */
    private function markFailed(string $reason): void
    {
        $this->settle(fn (RadarConsent $r) => $r->forceFill(['verification_status' => RadarVerificationStatus::Failed, 'verification_reason' => $reason]));
    }

    /** En attente : la réponse reste `pending`, son motif posé, et le job revient plus tard. */
    private function pending(string $reason, int $delaySeconds): void
    {
        if ($this->settle(fn (RadarConsent $r) => $r->forceFill(['verification_reason' => $reason]))) {
            $this->release($delaySeconds);
        }
    }

    /**
     * Écrit une issue SEULEMENT si la réponse est encore `pending` et n'a pas été purgée : relue sous verrou, dans une transaction courte
     * (la réponse seule : aucun autre verrou). Rend faux si elle a changé d'état entre-temps (rien n'est écrit).
     *
     * @param  callable(RadarConsent): mixed  $apply
     */
    private function settle(callable $apply): bool
    {
        return DB::transaction(function () use ($apply): bool {
            $fresh = RadarConsent::query()->whereKey($this->replyId)->lockForUpdate()->first();
            if ($fresh === null || $fresh->verification_status !== RadarVerificationStatus::Pending) {
                return false;
            }
            if ($fresh->purged_at !== null) {
                // Aucune donnée de la réponse dans le journal : son identifiant seulement.
                Log::info('radar.verification.abandoned_purged', ['reply_id' => $fresh->id]);

                return false;
            }
            $apply($fresh);
            $fresh->save();

            return true;
        });
    }
}
