<?php

namespace App\Services\Model;

use App\Events\Maintenance\MaintenanceStatusChanged;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\User;
use App\Services\Maintenance\MaintenanceStateMachine;
use App\Services\Media\PrivateMediaAccess;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

class MaintenanceRequestService
{
    /**
     * TCK-592 — les statuts dans lesquels un prestataire peut encore REFUSER, ou être désassigné à la
     * fin de sa collaboration : rien n'a commencé. `completed` n'y est pas — le travail est rendu, la
     * clôture contradictoire reste au demandeur.
     */
    public const UNSTARTED = ['open', 'acknowledged', 'assigned', 'quote_requested', 'quote_submitted', 'rejected', 'approved'];

    public function __construct(
        protected PrivateMediaAccess $privateMedia,
        protected MaintenanceStateMachine $machine,
    ) {}

    /**
     * TCK-592 — la table vivait ici, et une seconde dans `MaintenanceQuoteWorkflow`. Les deux
     * lisent désormais {@see MaintenanceStateMachine::TRANSITIONS}.
     */
    public function canTransitionTo(MaintenanceStatus $from, MaintenanceStatus $to): bool
    {
        return $this->machine->canTransition($from, $to);
    }

    public function transition(
        MaintenanceRequest $mr,
        MaintenanceStatus $to,
        ?User $actor = null,
        string $cause = MaintenanceStatusChanged::CAUSE_TRANSITION,
        array $context = [],
    ): MaintenanceRequest {
        $current = $mr->status ?? MaintenanceStatus::Open;

        // Idempotent when already in the target state.
        if ($current === $to) {
            return $mr;
        }

        $this->assertTransition($current, $to);

        $mr->status = $to;

        if ($to === MaintenanceStatus::InProgress && $mr->started_at === null) {
            $mr->started_at = now();
        }

        // TCK-592 — démarrer, c'est accepter : le prestataire qui démarre sans avoir cliqué
        // « J'accepte » ne doit pas pouvoir refuser ensuite.
        if ($to === MaintenanceStatus::InProgress && $mr->accepted_at === null
            && $actor !== null && $mr->assigned_to === $actor->id) {
            $mr->accepted_at = now();
        }

        if ($to === MaintenanceStatus::Completed && $mr->completed_at === null) {
            $mr->completed_at = now();
        }

        $mr->save();

        MaintenanceStatusChanged::dispatch($mr, $current, $to, $actor, $cause, $context);

        return $mr->refresh();
    }

    /**
     * TCK-592 — un refus de la TABLE est un 422 ; un refus de l'ACTEUR est un 403, rendu avant
     * d'arriver ici par `MaintenanceRequestPolicy::transitionTo()`.
     */
    public function assertTransition(MaintenanceStatus $from, MaintenanceStatus $to): void
    {
        abort_unless(
            $this->machine->canTransition($from, $to),
            422,
            __('maintenance.errors.transition_not_allowed', ['from' => $from->value, 'to' => $to->value]),
        );
    }

    /**
     * TCK-592 — LE chemin de l'assignation (`PATCH {assigned_to}`, création, fin d'onboarding).
     *
     * Remet `accepted_at` à `null` : une acceptation vaut pour un prestataire, pas pour la demande.
     * Le statut ne bouge pas. Sans changement de personne, rien n'est écrit ni émis.
     */
    public function assign(MaintenanceRequest $mr, ?User $assignee, ?User $actor): MaintenanceRequest
    {
        $previous = $mr->assigned_to;
        if ($previous === $assignee?->id) {
            return $mr;
        }

        $mr->assigned_to = $assignee?->id;
        $mr->accepted_at = null;
        $mr->save();

        $status = $mr->status ?? MaintenanceStatus::Open;
        MaintenanceStatusChanged::dispatch(
            $mr,
            $status,
            $status,
            $actor,
            $assignee !== null ? MaintenanceStatusChanged::CAUSE_ASSIGNED : MaintenanceStatusChanged::CAUSE_UNASSIGNED,
            ['previous_assignee_id' => $previous],
        );

        return $mr->refresh();
    }

    public function accept(MaintenanceRequest $mr, User $provider): MaintenanceRequest
    {
        abort_if($this->machine->isTerminal($mr->status), 422, __('maintenance.errors.terminal_request'));
        abort_if($mr->accepted_at !== null, 422, __('maintenance.errors.already_accepted'));

        $mr->accepted_at = now();
        $mr->save();

        $status = $mr->status ?? MaintenanceStatus::Open;
        MaintenanceStatusChanged::dispatch($mr, $status, $status, $provider, MaintenanceStatusChanged::CAUSE_ACCEPTED);

        return $mr->refresh();
    }

    /**
     * TCK-592 — refuser, tant que rien n'est accepté ni démarré : la demande revient au donneur
     * d'ordre (`assigned_to = null`, `open`), et le motif est tracé.
     */
    public function decline(MaintenanceRequest $mr, User $provider, string $reason): MaintenanceRequest
    {
        $current = $mr->status ?? MaintenanceStatus::Open;

        abort_if(
            $mr->accepted_at !== null || ! in_array($current->value, self::UNSTARTED, true),
            422,
            __('maintenance.errors.decline_after_accept'),
        );

        $mr->assigned_to = null;
        $mr->accepted_at = null;
        $mr->status = MaintenanceStatus::Open;
        $mr->save();

        activity()
            ->performedOn($mr)
            ->causedBy($provider)
            ->event('maintenance.declined')
            ->withProperties(['reason' => $reason, 'from' => $current->value])
            ->log('maintenance.declined');

        MaintenanceStatusChanged::dispatch(
            $mr,
            $current,
            MaintenanceStatus::Open,
            $provider,
            MaintenanceStatusChanged::CAUSE_DECLINED,
            ['reason' => $reason, 'previous_assignee_id' => $provider->id],
        );

        return $mr->refresh();
    }

    /**
     * TCK-592 — fin d'une collaboration : les interventions non démarrées ET en cours du
     * prestataire dans cette agence reviennent au donneur d'ordre (`open`, sans assigné), une
     * par une, chacune avec son événement. `completed` reste en l'état : le travail est rendu.
     *
     * @return int le nombre d'interventions désassignées
     */
    public function unassignProviderFromAgency(User $provider, int $agencyId, ?User $actor): int
    {
        $requests = MaintenanceRequest::query()
            ->where('assigned_to', $provider->id)
            ->whereIn('status', [...self::UNSTARTED, MaintenanceStatus::InProgress->value])
            ->whereHas('property', fn ($q) => $q->where('agency_id', $agencyId))
            ->get();

        foreach ($requests as $mr) {
            DB::transaction(function () use ($mr, $provider, $actor): void {
                $from = $mr->status ?? MaintenanceStatus::Open;
                $mr->assigned_to = null;
                $mr->accepted_at = null;
                $mr->status = MaintenanceStatus::Open;
                $mr->save();

                MaintenanceStatusChanged::dispatch(
                    $mr,
                    $from,
                    MaintenanceStatus::Open,
                    $actor,
                    MaintenanceStatusChanged::CAUSE_UNASSIGNED,
                    ['previous_assignee_id' => $provider->id],
                );
            });
        }

        return $requests->count();
    }

    /**
     * @param  array<string,mixed>  $data
     * @param  array<int,UploadedFile>  $photos
     */
    public function complete(MaintenanceRequest $mr, array $data, array $photos = [], ?User $actor = null): MaintenanceRequest
    {
        $current = $mr->status ?? MaintenanceStatus::Open;

        $this->assertTransition($current, MaintenanceStatus::Completed);

        DB::transaction(function () use ($mr, $data, $photos): void {
            $mr->status = MaintenanceStatus::Completed;
            $mr->completed_at = now();

            if (array_key_exists('resolution_notes', $data) && $data['resolution_notes'] !== null) {
                $mr->resolution_notes = $data['resolution_notes'];
            }

            $cost = $data['cost'] ?? $data['actual_cost'] ?? null;
            if ($cost !== null) {
                $mr->actual_cost = $cost;
            }

            $mr->save();

            foreach ($photos as $photo) {
                $mr->addMedia($photo)->toMediaCollection('completion_photos');
            }
        });

        MaintenanceStatusChanged::dispatch(
            $mr,
            $current,
            MaintenanceStatus::Completed,
            $actor,
            MaintenanceStatusChanged::CAUSE_COMPLETED,
        );

        return $mr->refresh();
    }

    /**
     * @param  array<int,UploadedFile>  $photos
     */
    public function addPhotos(MaintenanceRequest $mr, array $photos, string $collection = 'photos'): array
    {
        $added = [];
        foreach ($photos as $photo) {
            $media = $mr->addMedia($photo)->toMediaCollection($collection);
            $added[] = [
                'id' => $media->id,
                // URL d'API signée (TCK-538) : `photos` et `completion_photos` sont privées,
                // `getUrl()` ne serait servie par personne. Émise dans une réponse autorisée.
                'url' => $this->privateMedia->signedUrl($media),
                'collection' => $collection,
            ];
        }

        return $added;
    }
}
