<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\PropertyVisitResource;
use App\Models\Enums\VisitStatus;
use App\Models\Enums\VisitType;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Notifications\VisitConfirmedNotification;
use App\Notifications\VisitRequestedNotification;
use App\Services\Visit\VisitSchedulingService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\Rule;

class PropertyVisitController extends Controller
{
    public function __construct(protected VisitSchedulingService $scheduling) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $base = PropertyVisit::query();

        if (! $user->isSuperAdmin()) {
            $base->where(function ($q) use ($user) {
                $q->where('visitor_id', $user->id)
                    ->orWhere('agent_id', $user->id)
                    ->orWhereHas('property', fn ($p) => $p->where('user_id', $user->id))
                    ->orWhereHas('customer', fn ($c) => $c->where('user_id', $user->id));
            });
        }

        $paginator = PropertyVisit::buildQuery($base, $request)
            ->defaultSort('-scheduled_at')
            ->paginate();

        return $this->paginated($paginator, PropertyVisitResource::collection($paginator)->toArray($request));
    }

    public function show(Request $request, PropertyVisit $visit): JsonResponse
    {
        $this->authorizeAccess($request, $visit);

        return $this->json([
            'data' => PropertyVisitResource::make($visit->load(['property', 'agent', 'visitor', 'customer']))->toArray($request),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'property_id' => ['required', 'exists:properties,id'],
            'customer_id' => ['nullable', 'exists:customers,id'],
            'agent_id' => ['nullable', 'exists:users,id'],
            'scheduled_at' => ['required', 'date', 'after:now'],
            'type' => ['nullable', Rule::enum(VisitType::class)],
            'duration_minutes' => ['nullable', 'integer', 'min:5'],
            'visitor_name' => ['nullable', 'string'],
            'visitor_phone' => ['nullable', 'string'],
            'visitor_email' => ['nullable', 'email'],
            'notes' => ['nullable', 'string'],
        ]);

        $property = Property::findOrFail($data['property_id']);
        $user = $request->user();

        $isStaff = $user->isSuperAdmin()
            || $property->user_id === $user->id
            || ($user->agency_id && $property->agency_id && $user->agency_id === $property->agency_id);

        // Non-staff users can only book visits on publicly visible properties.
        if (! $isStaff) {
            $isPublic = Property::query()->where('id', $property->id)->public()->exists();
            abort_unless($isPublic, 403, 'This property is not available for visits.');
            unset($data['agent_id']);
        }

        // TCK-075 — a visitor cannot stack more than N active visits per
        // property. Quota check + insert are wrapped in a transaction
        // with row-level locks to close the TOCTOU race between two
        // concurrent booking requests from the same visitor.
        $visit = $this->scheduling->createOrFail($property, $user, array_merge($data, [
            'visitor_id' => $user->id,
            'type' => $data['type'] ?? VisitType::InPerson->value,
            'status' => VisitStatus::Scheduled->value,
        ]));

        $this->notifyRequested($visit->fresh(['property', 'agent']));

        return $this->json([
            'data' => PropertyVisitResource::make($visit)->toArray($request),
        ], 201);
    }

    public function update(Request $request, PropertyVisit $visit): JsonResponse
    {
        $this->authorizeManage($request, $visit);
        abort_if(
            in_array($visit->status, [VisitStatus::Completed, VisitStatus::Cancelled], true),
            422,
            'Cannot edit a completed or cancelled visit.'
        );

        // `status` is intentionally NOT part of this validator: every
        // status transition must go through a dedicated endpoint
        // (/confirm, /complete, /cancel). Those endpoints enforce valid
        // source states AND set the paired timestamp columns
        // (completed_at, cancelled_at) plus the overlap/quota guards.
        // Allowing free-form PATCH on `status` would let clients jump
        // from scheduled → completed without populating `completed_at`,
        // which silently breaks the feedback-window lockout.
        $data = $request->validate([
            'scheduled_at' => ['sometimes', 'date'],
            'agent_id' => ['sometimes', 'nullable', 'exists:users,id'],
            'duration_minutes' => ['sometimes', 'nullable', 'integer', 'min:5'],
            'notes' => ['sometimes', 'nullable', 'string'],
            'type' => ['sometimes', Rule::enum(VisitType::class)],
        ]);

        // Reschedule of a confirmed visit must re-check overlap on the
        // new slot before persisting.
        if ($visit->status === VisitStatus::Confirmed
            && (array_key_exists('scheduled_at', $data) || array_key_exists('duration_minutes', $data))) {
            $newStart = array_key_exists('scheduled_at', $data)
                ? Carbon::parse($data['scheduled_at'])
                : $visit->scheduled_at;
            $newDuration = array_key_exists('duration_minutes', $data)
                ? $data['duration_minutes']
                : $visit->duration_minutes;
            $this->scheduling->assertNoOverlap($visit, $newStart, $newDuration);
        }

        $visit->fill($data)->save();

        return $this->json(['data' => PropertyVisitResource::make($visit->refresh())->toArray($request)]);
    }

    public function confirm(Request $request, PropertyVisit $visit): JsonResponse
    {
        $this->authorizeManage($request, $visit);

        // TCK-075 AC2 — source-state check, overlap guard and status
        // flip happen inside a single DB transaction with row-level
        // locks so two concurrent confirm calls cannot both pass the
        // overlap check and both win.
        $visit = $this->scheduling->confirmOrFail($visit);
        $visit->load('property', 'visitor');

        $this->notifyConfirmed($visit);

        return $this->json(['data' => PropertyVisitResource::make($visit)->toArray($request)]);
    }

    public function complete(Request $request, PropertyVisit $visit): JsonResponse
    {
        $this->authorizeManage($request, $visit);
        abort_unless(
            in_array($visit->status, [VisitStatus::Scheduled, VisitStatus::Confirmed], true),
            422,
            'Visit cannot be completed in its current state.'
        );

        $data = $request->validate([
            'feedback' => ['nullable', 'string'],
            'rating' => ['nullable', 'numeric', 'min:0', 'max:5'],
        ]);

        $visit->update(array_merge($data, [
            'status' => VisitStatus::Completed,
            'completed_at' => now(),
        ]));

        return $this->json(['data' => PropertyVisitResource::make($visit->refresh())->toArray($request)]);
    }

    public function cancel(Request $request, PropertyVisit $visit): JsonResponse
    {
        $this->authorizeAccess($request, $visit);
        abort_if(
            in_array($visit->status, [VisitStatus::Completed, VisitStatus::Cancelled], true),
            422,
            'Visit cannot be cancelled in its current state.'
        );

        $data = $request->validate([
            'reason' => ['nullable', 'string'],
        ]);

        $visit->update([
            'status' => VisitStatus::Cancelled,
            'cancelled_at' => now(),
            'cancellation_reason' => $data['reason'] ?? null,
        ]);

        return $this->json(['data' => PropertyVisitResource::make($visit->refresh())->toArray($request)]);
    }

    /**
     * DELETE /api/property-visits/{visit}: mirrors {@see cancel} so clients
     * that prefer REST verbs can cancel with a single call.
     */
    public function destroy(Request $request, PropertyVisit $visit): JsonResponse
    {
        return $this->cancel($request, $visit);
    }

    /**
     * POST /api/property-visits/{visit}/feedback — TCK-075.
     *
     * Two roles can post feedback: the visiting `customer` (matched by
     * `visitor_id` or `customer.user_id`) and the managing `agent` (owner,
     * assigned agent or same-agency admin). Feedback is unlocked only
     * after `completed` and stays open for N hours (configurable),
     * giving both parties time to reflect without letting feedback
     * trickle in weeks later.
     */
    public function feedback(Request $request, PropertyVisit $visit): JsonResponse
    {
        $this->authorizeAccess($request, $visit);

        abort_unless(
            $visit->status === VisitStatus::Completed,
            422,
            'Feedback is only available once the visit is completed.'
        );

        $completedAt = $visit->completed_at;
        $windowHours = (int) config('visits.feedback_window_hours', 24);
        abort_if(
            $completedAt === null || $completedAt->diffInHours(now()) > $windowHours,
            422,
            'Feedback window has closed for this visit.'
        );

        $data = $request->validate([
            'role' => ['required', 'in:customer,agent'],
            'rating' => ['nullable', 'numeric', 'min:0', 'max:5'],
            'comment' => ['nullable', 'string', 'max:2000'],
        ]);

        $user = $request->user();
        $role = $data['role'];
        $property = $visit->property;

        $isCustomer = $visit->visitor_id === $user->id
            || ($visit->customer && $visit->customer->user_id === $user->id);
        $isAgent = $user->isSuperAdmin()
            || $visit->agent_id === $user->id
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $property && $property->agency_id === $user->agency_id);

        if ($role === 'customer') {
            abort_unless($isCustomer, 403, 'Only the visitor can submit customer feedback.');
        } else {
            abort_unless($isAgent, 403, 'Only the managing agent can submit agent feedback.');
        }

        $metadata = $visit->metadata ?? [];
        $metadata['feedback_'.$role] = [
            'user_id' => $user->id,
            'rating' => isset($data['rating']) ? (float) $data['rating'] : null,
            'comment' => $data['comment'] ?? null,
            'submitted_at' => now()->toIso8601String(),
        ];

        // Surface the customer's feedback/rating on the visit's top-level
        // columns so the existing Resource keeps working; the agent's
        // feedback stays in metadata (there's no dedicated column yet).
        $payload = ['metadata' => $metadata];
        if ($role === 'customer') {
            if (array_key_exists('comment', $data)) {
                $payload['feedback'] = $data['comment'];
            }
            if (array_key_exists('rating', $data)) {
                $payload['rating'] = $data['rating'];
            }
        }

        $visit->update($payload);

        return $this->json(['data' => PropertyVisitResource::make($visit->refresh())->toArray($request)]);
    }

    /**
     * @param  PropertyVisit  $visit  already loaded with `property` / `agent`.
     */
    protected function notifyRequested(PropertyVisit $visit): void
    {
        $recipients = $this->managingUsers($visit);
        if ($recipients->isEmpty()) {
            return;
        }

        try {
            Notification::send($recipients, new VisitRequestedNotification($visit));
        } catch (\Throwable) {
            // Notification routing failures must never bubble up and break
            // the originating HTTP request.
        }
    }

    protected function notifyConfirmed(PropertyVisit $visit): void
    {
        $visitor = $visit->visitor;
        if (! $visitor) {
            return;
        }

        try {
            Notification::send(collect([$visitor]), new VisitConfirmedNotification($visit));
        } catch (\Throwable) {
            // Silent — see notifyRequested().
        }
    }

    /**
     * Return the humans we should alert when a visit is requested: the
     * assigned agent (if any) and the property owner.
     *
     * @return Collection<int,User>
     */
    protected function managingUsers(PropertyVisit $visit): Collection
    {
        $recipients = collect();
        $property = $visit->property;
        if ($visit->agent_id && $visit->agent) {
            $recipients->push($visit->agent);
        }
        if ($property && $property->owner) {
            if (! $recipients->contains(fn ($u) => $u->id === $property->owner->id)) {
                $recipients->push($property->owner);
            }
        }

        return $recipients;
    }

    protected function authorizeAccess(Request $request, PropertyVisit $visit): void
    {
        $user = $request->user();
        $property = $visit->property;
        $ok = $user->isSuperAdmin()
            || $visit->visitor_id === $user->id
            || $visit->agent_id === $user->id
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $property && $property->agency_id === $user->agency_id)
            || ($visit->customer && $visit->customer->user_id === $user->id);

        abort_unless($ok, 403);
    }

    protected function authorizeManage(Request $request, PropertyVisit $visit): void
    {
        $user = $request->user();
        $property = $visit->property;
        $ok = $user->isSuperAdmin()
            || $visit->agent_id === $user->id
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $property && $property->agency_id === $user->agency_id);

        abort_unless($ok, 403);
    }
}
