<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Commitment\CancelCommitmentRequest;
use App\Http\Requests\Commitment\ConfirmCommitmentRequest;
use App\Http\Requests\Commitment\IndexCommitmentsRequest;
use App\Http\Requests\Commitment\KeepCommitmentRequest;
use App\Http\Requests\Commitment\NotYetCommitmentRequest;
use App\Http\Requests\Commitment\RemindCommitmentRequest;
use App\Http\Requests\Commitment\ReopenCommitmentRequest;
use App\Http\Requests\Commitment\StoreCommitmentRequest;
use App\Http\Requests\Commitment\UpdateCommitmentRequest;
use App\Http\Resources\CommitmentResource;
use App\Models\Commitment;
use App\Models\Conversation;
use App\Models\Enums\CommitmentStatus;
use App\Models\Enums\MessageVisibility;
use App\Models\Message;
use App\Models\User;
use App\Policies\CommitmentPolicy;
use App\Rules\PersonnelDeLAgence;
use App\Services\Messaging\ConversationAccess;
use App\Services\Messaging\EquipeDuFil;
use App\Services\Messaging\EvenementsDuFil;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2969 (ADR-0130 §§ 1 à 3) — noter, lister, confirmer et annuler un engagement. TCK-2970 — reporter,
 * déclarer tenu, rouvrir, répondre « Pas encore » et relancer à la main.
 *
 * Chaque geste passe par la route de l'engagement, jamais par une route de la messagerie (ADR-0128 § 4),
 * et écrit son message dans le fil : la carte `commitment.noted` (posée par qui note, par
 * `EvenementsDuFil::carte`), puis les événements `commitment.confirmed` et `commitment.cancelled`. Le
 * signal `message.created` rafraîchit la carte chez les autres lecteurs : rien de neuf en temps réel.
 *
 * L'autorisation (qui) est jugée par les FormRequest, avant la validation ; l'état et les règles de
 * l'ADR (qui note pour qui, depuis quel message, quand) sont refusés ici en 422 avec leur code.
 */
class CommitmentController extends Controller
{
    public function index(IndexCommitmentsRequest $request, Conversation $conversation): JsonResponse
    {
        $lecteur = $request->user();
        $maintenant = now();

        // « En retard, puis par échéance, puis clos » : en retard d'abord, puis les engagements en cours,
        // puis tenus et annulés ; dans chaque groupe par échéance.
        $engagements = Commitment::query()
            ->where('conversation_id', $conversation->id)
            ->with(['conversation', 'holder', 'beneficiary'])
            ->orderByRaw(
                'CASE WHEN status = ? AND due_at < ? THEN 0 WHEN status IN (?, ?) THEN 1 ELSE 2 END',
                [CommitmentStatus::Open->value, $maintenant, CommitmentStatus::Proposed->value, CommitmentStatus::Open->value],
            )
            ->orderBy('due_at')
            ->orderBy('id')
            ->get();

        return $this->json([
            'data' => $engagements->map(fn (Commitment $e) => CommitmentResource::make($e)->forViewer($lecteur)->resolve($request))->all(),
        ]);
    }

    public function store(StoreCommitmentRequest $request, Conversation $conversation, EvenementsDuFil $evenements): JsonResponse
    {
        $auteur = $request->user();
        $donnees = $request->validatedAvecInstants();

        $agence = EquipeDuFil::agence($conversation);
        abort_code_if($agence === null, 422, 'commitment.no_agency');

        $sourceId = $donnees['source_message_id'] ?? null;
        if ($sourceId !== null) {
            $source = Message::query()->whereKey((int) $sourceId)->first(['id', 'conversation_id', 'visibility']);
            abort_code_if($source === null || (int) $source->conversation_id !== (int) $conversation->id, 422, 'commitment.source_elsewhere');
            abort_code_if(self::visibilite($source) !== MessageVisibility::All->value, 422, 'commitment.team_note_source');
        }

        $participants = ConversationAccess::idsDesParticipantsActifs((int) $conversation->id);
        $porteurId = (int) $donnees['holder_id'];
        abort_code_unless(in_array($porteurId, $participants, true), 422, 'commitment.holder_not_participant');
        $beneficiaireId = isset($donnees['beneficiary_id']) ? (int) $donnees['beneficiary_id'] : null;
        abort_code_if($beneficiaireId !== null && ! in_array($beneficiaireId, $participants, true), 422, 'commitment.beneficiary_not_participant');

        // ADR-0130 § 2 — le personnel actif de l'agence du fil note pour tout participant ; tout autre
        // participant ne note que sa propre promesse. TCK-2970 — sous son profil ACTIF (`personnelActifDe`),
        // comme `CommitmentPolicy::estPersonnel` : jamais par un profil d'une autre agence.
        $pourSoi = $porteurId === (int) $auteur->id;
        abort_code_unless($pourSoi || PersonnelDeLAgence::personnelActifDe($auteur, $agence), 422, 'commitment.not_yours');

        $echeance = $donnees['due_at'];
        abort_code_unless($echeance->isFuture(), 422, 'commitment.due_in_past');

        [$objetType, $objetId] = self::objetDuFil($conversation);

        $engagement = DB::transaction(function () use ($conversation, $auteur, $evenements, $donnees, $agence, $porteurId, $beneficiaireId, $pourSoi, $echeance, $sourceId, $objetType, $objetId): Commitment {
            $engagement = Commitment::create([
                'conversation_id' => $conversation->id,
                'source_message_id' => $sourceId,
                'object_type' => $objetType,
                'object_id' => $objetId,
                'agency_id' => $agence,
                'holder_id' => $porteurId,
                'beneficiary_id' => $beneficiaireId,
                'created_by_id' => $auteur->id,
                'title' => $donnees['title'],
                'due_at' => $echeance,
                // Noté par son porteur : ouvert d'emblée. Noté pour autrui : à confirmer.
                'status' => $pourSoi ? CommitmentStatus::Open : CommitmentStatus::Proposed,
                'confirmed_at' => $pourSoi ? now() : null,
            ]);
            $evenements->carte($conversation, $auteur, $engagement, 'commitment.noted');

            return $engagement;
        });

        return $this->json(['data' => $this->projection($engagement, $auteur, $request)], 201);
    }

    public function confirm(ConfirmCommitmentRequest $request, Commitment $commitment, EvenementsDuFil $evenements): JsonResponse
    {
        $echeance = $request->validatedAvecInstants()['due_at'] ?? null;
        abort_code_if($echeance !== null && ! $echeance->isFuture(), 422, 'commitment.due_in_past');

        $engagement = DB::transaction(function () use ($commitment, $echeance, $evenements): Commitment {
            $engagement = Commitment::query()->whereKey($commitment->id)->lockForUpdate()->firstOrFail();
            abort_code_unless($engagement->status === CommitmentStatus::Proposed, 422, 'commitment.invalid_state');
            // L'échéance notée, si elle n'est pas remplacée, doit être encore à venir.
            abort_code_if($echeance === null && $engagement->due_at->isPast(), 422, 'commitment.due_in_past');

            $engagement->forceFill([
                'status' => CommitmentStatus::Open,
                'confirmed_at' => now(),
                'due_at' => $echeance ?? $engagement->due_at,
            ])->save();
            $evenements->ecrire($engagement->conversation, $engagement, 'commitment.confirmed');

            return $engagement;
        });

        return $this->json(['data' => $this->projection($engagement, $request->user(), $request)]);
    }

    public function cancel(CancelCommitmentRequest $request, Commitment $commitment, EvenementsDuFil $evenements): JsonResponse
    {
        $acteur = $request->user();

        $engagement = DB::transaction(function () use ($commitment, $acteur, $evenements): Commitment {
            $engagement = Commitment::query()->whereKey($commitment->id)->lockForUpdate()->firstOrFail();
            abort_code_unless($engagement->enCours(), 422, 'commitment.invalid_state');

            $motif = (int) $engagement->created_by_id === (int) $acteur->id
                ? Commitment::ANNULE_PAR_L_AUTEUR
                : Commitment::ANNULE_PAR_LE_PERSONNEL;
            $engagement->forceFill([
                'status' => CommitmentStatus::Cancelled,
                'cancelled_at' => now(),
                'cancelled_by_id' => $acteur->id,
                'cancel_reason' => $motif,
            ])->save();
            $evenements->ecrire($engagement->conversation, $engagement, 'commitment.cancelled', ['reason' => $motif]);

            return $engagement;
        });

        return $this->json(['data' => $this->projection($engagement, $acteur, $request)]);
    }

    /**
     * TCK-2970 (ADR-0130 § 3) — renommer ou reporter un engagement `open` (en retard compris). Une nouvelle
     * échéance, future, écrit `commitment.rescheduled` (`data.due_at`) et fait tomber les marqueurs du
     * signal (`Commitment::booted`) ; un report APRÈS l'échéance garde le retard dans l'historique
     * (`overdue_at`, posé s'il est vide). Un titre seul n'écrit aucun événement.
     */
    public function update(UpdateCommitmentRequest $request, Commitment $commitment, EvenementsDuFil $evenements): JsonResponse
    {
        $donnees = $request->validatedAvecInstants();
        $echeance = $donnees['due_at'] ?? null;
        abort_code_if($echeance !== null && ! $echeance->isFuture(), 422, 'commitment.due_in_past');

        $engagement = DB::transaction(function () use ($commitment, $donnees, $echeance, $evenements): Commitment {
            $engagement = Commitment::query()->whereKey($commitment->id)->lockForUpdate()->firstOrFail();
            abort_code_unless($engagement->status === CommitmentStatus::Open, 422, 'commitment.invalid_state');

            if (isset($donnees['title'])) {
                $engagement->title = $donnees['title'];
            }
            $reporte = $echeance !== null && ! $echeance->equalTo($engagement->due_at);
            if ($reporte) {
                // Reporté après l'échéance, avant même le passage de la commande : le retard reste dans
                // l'historique (ADR-0130 § 3). `overdue_at` ne tombe jamais.
                if ($engagement->overdue_at === null && $engagement->due_at->isPast()) {
                    $engagement->overdue_at = $engagement->due_at;
                }
                $engagement->due_at = $echeance;
            }
            $engagement->save();

            if ($reporte) {
                $evenements->ecrire($engagement->conversation, $engagement, 'commitment.rescheduled', ['due_at' => $this->instant($echeance)]);
            }

            return $engagement;
        });

        return $this->json(['data' => $this->projection($engagement, $request->user(), $request)]);
    }

    /**
     * TCK-2970 (décision 2 « a + b ») — le porteur, le bénéficiaire ou le personnel déclare tenu un
     * engagement `open`. Tenu après l'échéance : `overdue_at` est posé s'il est vide (le retard compte,
     * même si la commande n'est pas encore passée).
     */
    public function kept(KeepCommitmentRequest $request, Commitment $commitment, EvenementsDuFil $evenements): JsonResponse
    {
        $acteur = $request->user();

        $engagement = DB::transaction(function () use ($commitment, $acteur, $evenements): Commitment {
            $engagement = Commitment::query()->whereKey($commitment->id)->lockForUpdate()->firstOrFail();
            abort_code_unless($engagement->status === CommitmentStatus::Open, 422, 'commitment.invalid_state');

            $maintenant = now();
            $engagement->forceFill([
                'status' => CommitmentStatus::Kept,
                'kept_at' => $maintenant,
                'kept_by_id' => $acteur->id,
                'overdue_at' => $engagement->overdue_at ?? ($maintenant->greaterThan($engagement->due_at) ? $engagement->due_at : null),
            ])->save();
            $evenements->ecrire($engagement->conversation, $engagement, 'commitment.kept');

            return $engagement;
        });

        return $this->json(['data' => $this->projection($engagement, $acteur, $request)]);
    }

    /**
     * TCK-2970 (ADR-0130 § 3) — rouvrir un engagement déclaré tenu, avec un motif. QUI est jugé deux fois :
     * par la FormRequest, puis de nouveau sur la ligne verrouillée (`kept_by_id` a pu changer entre les
     * deux). Une partie consomme le droit UNIQUE et partagé des parties (`party_reopened_at`) ; le personnel
     * tranche toujours et ne le consomme pas.
     */
    public function reopen(ReopenCommitmentRequest $request, Commitment $commitment, EvenementsDuFil $evenements): JsonResponse
    {
        $acteur = $request->user();
        $motif = $request->validated('reason');

        $engagement = DB::transaction(function () use ($commitment, $acteur, $motif, $evenements): Commitment {
            $engagement = Commitment::query()->whereKey($commitment->id)->lockForUpdate()->firstOrFail();
            abort_code_unless($engagement->status === CommitmentStatus::Kept, 422, 'commitment.invalid_state');
            abort_unless(app(CommitmentPolicy::class)->reopen($acteur, $engagement), 403);

            $parLePersonnel = CommitmentPolicy::estPersonnel($acteur, $engagement);
            abort_code_if(! $parLePersonnel && $engagement->party_reopened_at !== null, 422, 'commitment.already_reopened');

            $maintenant = now();
            $engagement->forceFill([
                'status' => CommitmentStatus::Open,
                'kept_at' => null,
                'kept_by_id' => null,
                'reopened_at' => $maintenant,
                'reopened_by_id' => $acteur->id,
                'reopen_reason' => $motif,
                'party_reopened_at' => $parLePersonnel ? $engagement->party_reopened_at : $maintenant,
            ])->save();
            $evenements->ecrire($engagement->conversation, $engagement, 'commitment.reopened', [], [(int) $engagement->holder_id]);

            return $engagement;
        });

        return $this->json(['data' => $this->projection($engagement, $acteur, $request)]);
    }

    /**
     * TCK-2970 (ADR-0130 § 3) — « Pas encore » : le bénéficiaire répond à la question « Tenu ? » encore
     * ouverte. `commitment.not_kept_yet` la clôt ; l'engagement reste `open`.
     */
    public function notYet(NotYetCommitmentRequest $request, Commitment $commitment, EvenementsDuFil $evenements): JsonResponse
    {
        $engagement = DB::transaction(function () use ($commitment, $evenements): Commitment {
            $engagement = Commitment::query()->whereKey($commitment->id)->lockForUpdate()->firstOrFail();
            abort_code_unless($engagement->questionTenuOuverte(), 422, 'commitment.invalid_state');

            $evenements->ecrire($engagement->conversation, $engagement, 'commitment.not_kept_yet');

            return $engagement;
        });

        return $this->json(['data' => $this->projection($engagement, $request->user(), $request)]);
    }

    /**
     * TCK-2970 (ADR-0130 § 4) — le personnel relance à la main le porteur d'un engagement en retard, une
     * fois par 24 h au plus (d'après `last_relance_at`, qu'elle pose). Elle ne compte pas parmi les trois
     * relances automatiques (`relances` inchangé) ; elle repousse la suivante de trois jours.
     */
    public function remind(RemindCommitmentRequest $request, Commitment $commitment, EvenementsDuFil $evenements): JsonResponse
    {
        $engagement = DB::transaction(function () use ($commitment, $evenements): Commitment {
            $engagement = Commitment::query()->whereKey($commitment->id)->lockForUpdate()->firstOrFail();
            abort_code_unless($engagement->etat() === Commitment::ETAT_EN_RETARD, 422, 'commitment.invalid_state');
            abort_code_if($engagement->last_relance_at !== null && $engagement->last_relance_at->greaterThan(now()->subDay()), 429, 'commitment.reminded_recently');

            $engagement->forceFill(['last_relance_at' => now()])->save();
            $evenements->ecrire($engagement->conversation, $engagement, 'commitment.reminded', [], [(int) $engagement->holder_id]);

            return $engagement;
        });

        return $this->json(['data' => $this->projection($engagement, $request->user(), $request)]);
    }

    /** @return array<string, mixed> la projection de l'engagement, avec les gestes de `$lecteur` */
    private function projection(Commitment $engagement, User $lecteur, Request $request): array
    {
        $engagement->load(['conversation', 'holder', 'beneficiary']);

        return CommitmentResource::make($engagement)->forViewer($lecteur)->resolve($request);
    }

    /**
     * L'objet rattaché, posé par le serveur (ADR-0130 § 1) : le sujet du fil, sinon son bien. Jamais lu du
     * corps de la requête.
     *
     * @return array{0: string|null, 1: int|null}
     */
    private static function objetDuFil(Conversation $conversation): array
    {
        if ($conversation->subject_type !== null && $conversation->subject_id !== null) {
            return [$conversation->subject_type, (int) $conversation->subject_id];
        }
        if ($conversation->property_id !== null) {
            return ['property', (int) $conversation->property_id];
        }

        return [null, null];
    }

    private static function visibilite(Message $message): ?string
    {
        $visibilite = $message->visibility;

        return $visibilite instanceof MessageVisibility ? $visibilite->value : $visibilite;
    }
}
