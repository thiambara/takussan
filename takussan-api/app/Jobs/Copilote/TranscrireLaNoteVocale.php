<?php

namespace App\Jobs\Copilote;

use App\Ai\Usages\FilTranscriptionUsage;
use App\Jobs\Concerns\RunsOnAiQueue;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\MessageType;
use App\Models\Message;
use App\Models\User;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiRequest;
use App\Services\Ai\AiResult;
use App\Services\Ai\Exceptions\AiRefused;
use App\Services\Ai\Exceptions\AiUnavailable;
use App\Services\Ai\SuggestionRecorder;
use App\Services\Messaging\Copilote\GardeDuCopilote;
use App\Services\Messaging\Copilote\TranscriptionsDuFil;
use App\Services\Messaging\EquipeDuFil;
use App\Support\TempsReel\CodeDeSignal;
use App\Support\TempsReel\TempsReel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Http\Request;
use Illuminate\Queue\InteractsWithQueue;
use Laravel\Ai\Files\StoredAudio;

/**
 * TCK-2976 (ADR-0131 § 7) — la transcription d'une note vocale, sur la file `ai`.
 *
 *  1. Il reconstruit le contexte du demandeur (son profil actif de la demande), comme {@see DemanderAuCopilote}, et
 *     REJUGE la garde du copilote.
 *  2. Il lit le fichier de la collection privée `attachments` (ADR-0038 : 2 Mo au plus) et appelle
 *     `AiGateway::transcribe()` (acteur = le demandeur, agence du fil, objet = le message).
 *  3. Il enregistre une `AiSuggestion` (sujet = le message, `proposal = {texte, langue}`, `input_snapshot` nul).
 *  4. Il signale `message.updated` aux SEULS lecteurs des notes d'équipe du fil, sur leur canal d'utilisateur, jamais
 *     sur celui du fil. Un refus ou une indisponibilité est absorbé : `ai_calls` porte l'issue, le même signal part.
 */
final class TranscrireLaNoteVocale implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, RunsOnAiQueue;

    /** Sous le `retry_after` de 90 s de la connexion `database` (ADR-0078), et sous 85 s. */
    public const TIMEOUT_SECONDS = 80;

    /** ADR-0038 — une note vocale fait 2 Mo au plus : au-delà, rien ne part. */
    public const TAILLE_MAX_OCTETS = 2 * 1024 * 1024;

    public int $timeout = self::TIMEOUT_SECONDS;

    public int $tries = 1;

    public function __construct(
        public readonly int $lecteurId,
        public readonly int $messageId,
        public readonly ?string $profilType = null,
        public readonly ?int $profilId = null,
    ) {
        $this->onAiQueue();
    }

    public function handle(AiGateway $passerelle, SuggestionRecorder $suggestions, GardeDuCopilote $garde): void
    {
        $lecteur = User::query()->find($this->lecteurId);
        $message = Message::query()->with('conversation')->find($this->messageId);
        $fil = $message?->conversation;

        try {
            if ($lecteur === null || $message === null || $fil === null || $message->type !== MessageType::Audio) {
                return;
            }
            $this->dansLeContexteDe($lecteur, function () use ($lecteur, $message, $fil, $passerelle, $suggestions, $garde): void {
                if (! $garde->peutServir($lecteur, $fil)) {
                    return;
                }
                $media = $message->getFirstMedia('attachments');
                if ($media === null || (int) $media->size > self::TAILLE_MAX_OCTETS) {
                    return;
                }

                try {
                    $resultat = $passerelle->transcribe(new AiRequest(
                        usageKey: FilTranscriptionUsage::KEY,
                        input: '',
                        dataClasses: [AiDataClass::Personnelle],
                        actor: $lecteur,
                        agencyId: EquipeDuFil::agence($fil),
                        subject: $message,
                    ), new StoredAudio($media->getPathRelativeToRoot(), $media->disk));
                } catch (AiRefused|AiUnavailable) {
                    return;
                }

                $suggestions->record(
                    new AiResult($resultat->text, null, $resultat->call, false),
                    $message,
                    proposal: ['texte' => $resultat->text, 'langue' => $resultat->language],
                );
            });
        } finally {
            TranscriptionsDuFil::lever($this->messageId);
            if ($fil !== null) {
                TempsReel::signalerA(EquipeDuFil::idsDesLecteursDesNotes((int) $fil->id), CodeDeSignal::MessageUpdated, $fil);
            }
        }
    }

    /** @param  callable(): void  $travail */
    private function dansLeContexteDe(User $lecteur, callable $travail): void
    {
        $avant = app()->bound('request') ? app('request') : null;
        $requete = Request::create('/api/messages/'.$this->messageId.'/transcription', 'POST');
        $requete->setUserResolver(fn () => $lecteur);
        $requete->attributes->set('active_profile', $this->profil($lecteur));
        app()->instance('request', $requete);

        try {
            $travail();
        } finally {
            if ($avant !== null) {
                app()->instance('request', $avant);
            }
        }
    }

    private function profil(User $lecteur): ?Model
    {
        $classe = $this->profilType !== null ? Relation::getMorphedModel($this->profilType) ?? $this->profilType : null;
        if ($classe === null || ! is_a($classe, Model::class, true) || $this->profilId === null) {
            return null;
        }
        $profil = $classe::query()->find($this->profilId);

        return $profil !== null && (int) $profil->user_id === (int) $lecteur->id ? $profil : null;
    }
}
