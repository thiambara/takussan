<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\User;
use App\Policies\MaintenanceRequestPolicy;
use App\Services\Maintenance\MaintenanceStateMachine;
use App\Services\Media\PrivateMediaAccess;
use App\Services\Model\MaintenanceRequestService;
use Illuminate\Http\Request;
use Illuminate\Routing\Route;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class MaintenanceRequestResource extends BaseResource
{
    /**
     * TCK-592 (P13) — le prix négocié est une affaire entre le prestataire et les donneurs d'ordre :
     * le demandeur locataire ne reçoit plus les `quote_*` — clés ABSENTES, pas nulles. Retirées à
     * la main plutôt que par `mergeWhen()` : les contrôleurs appellent `toArray()` directement, qui
     * ne résout pas les valeurs conditionnelles.
     */
    private const QUOTE_FIELDS = [
        'quote_amount', 'quote_currency', 'quote_submitted_at', 'quote_decision_at',
        'quote_decision_by_id', 'quote_rejection_reason', 'quote_decision_by',
        'quote_lines', 'quote_valid_until', 'quote_estimated_duration_days',
    ];

    public function toArray(Request $request): array
    {
        $data = [
            'id' => $this->id,
            'property_id' => $this->property_id,
            'lease_id' => $this->lease_id,
            'requester_id' => $this->requester_id,
            'assigned_to' => $this->assigned_to,
            'title' => $this->title,
            'description' => $this->description,
            'category' => $this->category?->value,
            'priority' => $this->priority?->value,
            'status' => $this->status?->value,
            'estimated_cost' => $this->estimated_cost !== null ? (float) $this->estimated_cost : null,
            'actual_cost' => $this->actual_cost !== null ? (float) $this->actual_cost : null,
            'quote_amount' => $this->quote_amount !== null ? (float) $this->quote_amount : null,
            'quote_currency' => $this->quote_currency,
            'quote_submitted_at' => $this->iso($this->quote_submitted_at),
            'quote_decision_at' => $this->iso($this->quote_decision_at),
            'quote_decision_by_id' => $this->quote_decision_by_id,
            'quote_rejection_reason' => $this->quote_rejection_reason,
            'quote_lines' => $this->quote_lines,
            'quote_valid_until' => $this->calendarDate($this->quote_valid_until),
            'quote_estimated_duration_days' => $this->quote_estimated_duration_days,
            'scheduled_at' => $this->iso($this->scheduled_at),
            'started_at' => $this->iso($this->started_at),
            'completed_at' => $this->iso($this->completed_at),
            'resolution_notes' => $this->resolution_notes,
            'accepted_at' => $this->iso($this->accepted_at),
            'access_instructions' => $this->access_instructions,
            'property' => $this->whenLoaded('property', fn () => $this->propertySummary()),
            'requester' => $this->whenLoaded('requester', fn () => $this->userSummary($this->requester)),
            'assignee' => $this->whenLoaded('assignee', fn () => $this->userSummary($this->assignee)),
            'quote_decision_by' => $this->whenLoaded('quoteDecisionBy', fn () => $this->userSummary($this->quoteDecisionBy)),
            'created_at' => $this->iso($this->created_at),
        ];

        $user = $request->user();

        if (! $this->seesQuote($user)) {
            $data = array_diff_key($data, array_flip(self::QUOTE_FIELDS));
        }

        // Les consignes d'accès s'écrivent par le donneur d'ordre et se lisent, par le prestataire,
        // dans le bloc `access` — jamais par le demandeur.
        if (! $this->isPrincipal($user)) {
            unset($data['access_instructions']);
        }

        if ($user !== null && $this->isDetailRequest($request)) {
            $data['media'] = $this->mediaBlock($user);
            $data['abilities'] = $this->abilitiesBlock($user);
            if ($this->opensAccess($user)) {
                $data['access'] = $this->accessBlock();
            }
        }

        return $data;
    }

    /**
     * TCK-592 — `media`, `access` et `abilities` ne sont rendus que pour LA demande de la route
     * (`GET …/{id}` et chaque geste qui la renvoie) : sur une liste, ce serait une requête de
     * médias et une batterie de policies par ligne.
     */
    private function isDetailRequest(Request $request): bool
    {
        // `hasParameter()` et non `route('…')` : une route non liée (ressource rendue hors requête
        // HTTP, inventaires de tests) lève sur `parameters()`.
        $route = $request->route();
        if (! $route instanceof Route || ! $route->hasParameter('maintenanceRequest')) {
            return false;
        }

        $routed = $route->parameter('maintenanceRequest');

        return $routed instanceof MaintenanceRequest && $routed->is($this->resource);
    }

    /**
     * TCK-592 (P7) — les pièces de la demande, en URL d'API signées (`PrivateMediaAccess`, seule
     * sortie d'un fichier privé). `quotes` au prestataire assigné et aux donneurs d'ordre seulement.
     *
     * @return array<string, list<array<string, mixed>>>
     */
    private function mediaBlock(User $user): array
    {
        $collections = ['photos', 'before_photos', 'completion_photos'];
        if ($this->seesQuote($user)) {
            $collections[] = 'quotes';
        }

        $access = app(PrivateMediaAccess::class);
        $block = [];
        foreach ($collections as $collection) {
            $block[$collection] = $this->resource->getMedia($collection)
                ->map(fn (Media $media): array => [
                    'id' => $media->id,
                    'name' => $media->file_name,
                    'mime_type' => $media->mime_type,
                    'size' => $media->size,
                    'url' => $access->signedUrl($media),
                    'created_at' => $this->iso($media->created_at),
                ])
                ->values()
                ->all();
        }

        return $block;
    }

    /**
     * TCK-592 (P6) — rue, coordonnées et téléphone du demandeur : au seul prestataire assigné,
     * APRÈS acceptation, tant que la demande n'est ni close ni annulée.
     */
    private function opensAccess(User $user): bool
    {
        return $this->assigned_to !== null
            && $this->assigned_to === $user->id
            && $this->accepted_at !== null
            && ! in_array($this->status, [MaintenanceStatus::Closed, MaintenanceStatus::Cancelled], true)
            && $user->can('actAsProvider', $this->resource);
    }

    /** @return array<string, mixed> */
    private function accessBlock(): array
    {
        $address = $this->property?->address;

        return [
            'street' => $address?->street,
            'quarter' => $address?->neighborhood,
            'city' => $address?->city,
            'latitude' => $address?->latitude !== null ? (float) $address->latitude : null,
            'longitude' => $address?->longitude !== null ? (float) $address->longitude : null,
            'requester_phone' => $this->requester?->phone,
            'instructions' => $this->access_instructions,
        ];
    }

    /**
     * TCK-592 — « le serveur dit ce qui est permis » : chaque bouton du front naît d'ici, jamais
     * d'une table de transitions recopiée. `transitions` ne liste que les cibles de `PUT …/status`
     * que CET utilisateur peut demander ; les autres gestes ont leur drapeau.
     *
     * @return array<string, mixed>
     */
    private function abilitiesBlock(User $user): array
    {
        $mr = $this->resource;
        $machine = app(MaintenanceStateMachine::class);
        $status = $mr->status ?? MaintenanceStatus::Open;
        $terminal = $machine->isTerminal($status);
        $isProvider = $user->can('actAsProvider', $mr);
        $canRespond = ! $terminal && $user->can('respondToAssignment', $mr) && $mr->accepted_at === null;

        // Mêmes portes que `UpdateStatusMaintenanceRequestRequest::authorize()` : `update` PUIS
        // (acteur, cible). Le demandeur n'a pas `update` : il confirme par son propre geste.
        $transitions = collect($user->can('update', $mr) ? $machine->targetsFrom($mr) : [])
            ->filter(fn (MaintenanceStatus $to): bool => $machine->isGeneric($status, $to)
                && $user->can('transitionTo', [$mr, $to]))
            ->map(fn (MaintenanceStatus $to): string => $to->value)
            ->values()
            ->all();

        return [
            'can_manage_quotes' => $user->can('manageQuotes', $mr),
            'can_submit_quote' => $isProvider
                && in_array($status, [MaintenanceStatus::QuoteRequested, MaintenanceStatus::Rejected], true),
            'can_accept' => $canRespond,
            'can_decline' => $canRespond && in_array($status->value, MaintenanceRequestService::UNSTARTED, true),
            'can_assign' => ! $terminal && $user->can('actAsPrincipal', $mr),
            'can_complete' => $user->can('transitionTo', [$mr, MaintenanceStatus::Completed]),
            'can_upload_before_photos' => ! $terminal && $isProvider && $mr->accepted_at !== null,
            'can_confirm_resolution' => $user->can('respondToResolution', [$mr, MaintenanceStatus::Closed]),
            'can_contest_resolution' => $user->can('respondToResolution', [$mr, MaintenanceStatus::InProgress]),
            'transitions' => $transitions,
        ];
    }

    private function isPrincipal(?User $user): bool
    {
        return $user !== null && MaintenanceRequestPolicy::isPrincipalFor($user, $this->property);
    }

    /**
     * Le prestataire assigné et les donneurs d'ordre (bailleur du bien, équipe de l'agence).
     */
    private function seesQuote(?User $user): bool
    {
        if ($user === null) {
            return false;
        }

        return ($this->assigned_to !== null && $this->assigned_to === $user->id)
            || MaintenanceRequestPolicy::isPrincipalFor($user, $this->property);
    }

    private function propertySummary(): ?array
    {
        $property = $this->property;
        if ($property === null) {
            return null;
        }

        $address = $property->relationLoaded('address') ? $property->address : null;
        $parts = array_filter([
            $address?->neighborhood,
            $address?->city,
            $address?->region,
            $address?->country,
        ], fn ($value) => $value !== null && $value !== '');

        return [
            'id' => $property->id,
            'title' => $property->title,
            'slug' => $property->slug,
            'location' => [
                'full' => $parts === [] ? null : implode(', ', $parts),
                'quarter' => $address?->neighborhood,
                'city' => $address?->city,
                'region' => $address?->region,
                'country' => $address?->country,
            ],
        ];
    }

    private function userSummary(?User $user): ?array
    {
        if ($user === null) {
            return null;
        }

        $name = trim($user->first_name.' '.$user->last_name) ?: $user->username;

        return [
            'id' => $user->id,
            'name' => $name,
            'email' => $user->email,
            'username' => $user->username,
        ];
    }
}
