<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\PropertyVisitResource;
use App\Models\Enums\VisitStatus;
use App\Models\Enums\VisitType;
use App\Models\Property;
use App\Models\PropertyVisit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PropertyVisitController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = PropertyVisit::query();

        if (! $user->hasRole(['admin', 'super_admin'])) {
            $query->where(function ($q) use ($user) {
                $q->where('visitor_id', $user->id)
                    ->orWhere('agent_id', $user->id)
                    ->orWhereHas('property', fn ($p) => $p->where('user_id', $user->id));
            });
        }

        $paginator = $query->latest('scheduled_at')->paginate((int) $request->input('per_page', 20));

        return $this->json([
            'data' => PropertyVisitResource::collection($paginator)->toArray($request),
            'meta' => ['total' => $paginator->total(), 'current_page' => $paginator->currentPage()],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'property_id' => ['required', 'exists:properties,id'],
            'customer_id' => ['nullable', 'exists:customers,id'],
            'agent_id' => ['nullable', 'exists:users,id'],
            'scheduled_at' => ['required', 'date'],
            'type' => ['nullable', Rule::enum(VisitType::class)],
            'duration_minutes' => ['nullable', 'integer', 'min:5'],
            'visitor_name' => ['nullable', 'string'],
            'visitor_phone' => ['nullable', 'string'],
            'visitor_email' => ['nullable', 'email'],
            'notes' => ['nullable', 'string'],
        ]);

        $property = Property::findOrFail($data['property_id']);
        $user = $request->user();

        $isStaff = $user->hasRole(['admin', 'super_admin'])
            || $property->user_id === $user->id
            || ($user->agency_id && $property->agency_id && $user->agency_id === $property->agency_id);

        // Non-staff users can only book visits on publicly visible properties.
        if (! $isStaff) {
            $isPublic = Property::query()->where('id', $property->id)->public()->exists();
            abort_unless($isPublic, 403, 'This property is not available for visits.');
            unset($data['agent_id']);
        }

        $visit = PropertyVisit::create(array_merge($data, [
            'visitor_id' => $user->id,
            'type' => $data['type'] ?? VisitType::InPerson->value,
            'status' => VisitStatus::Scheduled->value,
        ]));

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

        $data = $request->validate([
            'scheduled_at' => ['sometimes', 'date'],
            'agent_id' => ['sometimes', 'nullable', 'exists:users,id'],
            'duration_minutes' => ['sometimes', 'nullable', 'integer', 'min:5'],
            'notes' => ['sometimes', 'nullable', 'string'],
            'type' => ['sometimes', Rule::enum(VisitType::class)],
        ]);

        $visit->fill($data)->save();

        return $this->json(['data' => PropertyVisitResource::make($visit->refresh())->toArray($request)]);
    }

    public function confirm(Request $request, PropertyVisit $visit): JsonResponse
    {
        $this->authorizeManage($request, $visit);
        abort_unless($visit->status === VisitStatus::Scheduled, 422, 'Only scheduled visits can be confirmed.');

        $visit->update(['status' => VisitStatus::Confirmed]);

        return $this->json(['data' => PropertyVisitResource::make($visit->refresh())->toArray($request)]);
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

    protected function authorizeAccess(Request $request, PropertyVisit $visit): void
    {
        $user = $request->user();
        $property = $visit->property;
        $ok = $user->hasRole(['admin', 'super_admin'])
            || $visit->visitor_id === $user->id
            || $visit->agent_id === $user->id
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $property && $property->agency_id === $user->agency_id);

        abort_unless($ok, 403);
    }

    protected function authorizeManage(Request $request, PropertyVisit $visit): void
    {
        $user = $request->user();
        $property = $visit->property;
        $ok = $user->hasRole(['admin', 'super_admin'])
            || $visit->agent_id === $user->id
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $property && $property->agency_id === $user->agency_id);

        abort_unless($ok, 403);
    }
}
