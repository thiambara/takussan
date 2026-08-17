<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\IndexCalendarRequest;
use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\VisitStatus;
use App\Models\PropertyVisit;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;

/**
 * TCK-072 — Agrégateur calendrier (bookings + visites).
 *
 * Retourne un flux unifié d'événements bornés par `start_date` / `end_date`,
 * filtrable par type (`types[]=booking,visit`) et par bien (`property_id`).
 * Scoppé par l'utilisateur courant : admin voit tout ; agent/owner voit ses
 * biens propres, les biens de son agence, et les biens sur lesquels il est
 * collaborateur accepté ; un agent voit aussi les visites qui lui sont
 * assignées directement (`agent_id`).
 */
class CalendarController extends Controller
{
    public function index(IndexCalendarRequest $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validated();

        $start = Carbon::parse($validated['start_date']);
        $end = Carbon::parse($validated['end_date']);
        $propertyId = $validated['property_id'] ?? null;
        $propertyIds = collect($validated['property_ids'] ?? [])
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();
        $types = collect($validated['types'] ?? ['booking', 'visit'])->unique();

        $isAdmin = $user->isSuperAdmin();
        $userId = $user->id;
        $agencyId = $user->agency_id;

        // Cross-agency filter is admin-only so a tenant of agency A cannot
        // probe agency B's agenda by passing `agency_id=B`.
        $agencyFilter = null;
        if (array_key_exists('agency_id', $validated)) {
            abort_unless($isAdmin, 403, 'Only administrators can query other agencies.');
            $agencyFilter = (int) $validated['agency_id'];
        }

        $scopeToUser = function (Builder $q) use ($userId, $agencyId): void {
            $q->whereHas('property', function (Builder $p) use ($userId, $agencyId): void {
                $p->where(function (Builder $inner) use ($userId, $agencyId): void {
                    $inner->where('user_id', $userId);
                    if ($agencyId) {
                        $inner->orWhere('agency_id', $agencyId);
                    }
                    $inner->orWhereHas('collaborators', function (Builder $c) use ($userId): void {
                        $c->where('user_id', $userId)->whereNotNull('accepted_at');
                    });
                });
            });
        };

        $events = collect();

        if ($types->contains('booking')) {
            $bookingsQuery = Booking::query()
                ->whereIn('status', [BookingStatus::Confirmed, BookingStatus::Pending])
                ->whereDate('start_date', '<=', $end)
                ->whereDate('end_date', '>=', $start);

            if ($propertyId) {
                $bookingsQuery->where('property_id', $propertyId);
            }
            if (! empty($propertyIds)) {
                $bookingsQuery->whereIn('property_id', $propertyIds);
            }
            if ($agencyFilter !== null) {
                $bookingsQuery->whereHas('property', fn (Builder $p) => $p->where('agency_id', $agencyFilter));
            }
            if (! $isAdmin) {
                $bookingsQuery->where($scopeToUser);
            }

            $events = $events->merge(
                $bookingsQuery->with('property:id,title,slug')->get()->map(fn ($b) => [
                    'id' => $b->id,
                    'type' => 'booking',
                    'title' => $b->property?->title ?? __('messages.booking'),
                    'start' => $b->start_date instanceof Carbon
                        ? $b->start_date->toDateTimeString()
                        : (string) $b->start_date,
                    'end' => $b->end_date instanceof Carbon
                        ? $b->end_date->toDateTimeString()
                        : (string) $b->end_date,
                    'status' => $b->status,
                    'all_day' => true,
                    'reference' => $b->reference_number,
                    'property_id' => $b->property_id,
                    'property_slug' => $b->property?->slug,
                    'resource_url' => "/app/bookings/{$b->id}",
                ])
            );
        }

        if ($types->contains('visit')) {
            $visitsQuery = PropertyVisit::query()
                ->whereIn('status', [VisitStatus::Scheduled, VisitStatus::Confirmed])
                ->whereDate('scheduled_at', '>=', $start)
                ->whereDate('scheduled_at', '<=', $end);

            if ($propertyId) {
                $visitsQuery->where('property_id', $propertyId);
            }
            if (! empty($propertyIds)) {
                $visitsQuery->whereIn('property_id', $propertyIds);
            }
            if ($agencyFilter !== null) {
                $visitsQuery->whereHas('property', fn (Builder $p) => $p->where('agency_id', $agencyFilter));
            }
            if (! $isAdmin) {
                $visitsQuery->where(function (Builder $q) use ($userId, $scopeToUser): void {
                    $q->where('agent_id', $userId)->orWhere($scopeToUser);
                });
            }

            $events = $events->merge(
                $visitsQuery->with('property:id,title,slug')->get()->map(function ($v) {
                    $startAt = $v->scheduled_at;
                    $endAt = $startAt && $v->duration_minutes
                        ? $startAt->copy()->addMinutes((int) $v->duration_minutes)
                        : $startAt;

                    return [
                        'id' => $v->id,
                        'type' => 'visit',
                        'title' => $v->property?->title ?? __('messages.visit'),
                        'start' => $startAt?->toDateTimeString(),
                        'end' => $endAt?->toDateTimeString(),
                        'status' => $v->status,
                        'all_day' => false,
                        'duration_minutes' => $v->duration_minutes,
                        'property_id' => $v->property_id,
                        'property_slug' => $v->property?->slug,
                        'resource_url' => "/app/visits/{$v->id}",
                    ];
                })
            );
        }

        return $this->json([
            'data' => $events->sortBy('start')->values(),
        ]);
    }
}
