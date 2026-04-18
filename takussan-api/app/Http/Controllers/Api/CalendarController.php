<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\VisitStatus;
use App\Models\PropertyVisit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CalendarController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $request->validate([
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
        ]);

        $start = $request->input('start_date');
        $end = $request->input('end_date');

        // Bookings
        $bookingsQuery = Booking::query()
            ->whereIn('status', [BookingStatus::Confirmed, BookingStatus::Pending])
            ->whereDate('start_date', '<=', $end)
            ->whereDate('end_date', '>=', $start);

        if (! $user->hasRole(['admin', 'super_admin'])) {
            $bookingsQuery->where(function ($q) use ($user) {
                $q->whereHas('property', fn ($p) => $p->where('user_id', $user->id));
                if ($user->agency_id) {
                    $q->orWhereHas('property', fn ($p) => $p->where('agency_id', $user->agency_id));
                }
            });
        }

        $bookings = $bookingsQuery->with('property:id,title')->get()->map(fn ($b) => [
            'id' => $b->id,
            'type' => 'booking',
            'title' => $b->property?->title ?? __('messages.booking'),
            'start' => $b->start_date,
            'end' => $b->end_date,
            'status' => $b->status,
        ]);

        // Property visits
        $visitsQuery = PropertyVisit::query()
            ->whereIn('status', [VisitStatus::Scheduled, VisitStatus::Confirmed])
            ->whereDate('scheduled_at', '>=', $start)
            ->whereDate('scheduled_at', '<=', $end);

        if (! $user->hasRole(['admin', 'super_admin'])) {
            $visitsQuery->where(function ($q) use ($user) {
                $q->where('agent_id', $user->id)
                    ->orWhereHas('property', fn ($p) => $p->where('user_id', $user->id));
                if ($user->agency_id) {
                    $q->orWhereHas('property', fn ($p) => $p->where('agency_id', $user->agency_id));
                }
            });
        }

        $visits = $visitsQuery->with('property:id,title')->get()->map(fn ($v) => [
            'id' => $v->id,
            'type' => 'visit',
            'title' => $v->property?->title ?? __('messages.visit'),
            'start' => $v->scheduled_at,
            'end' => $v->scheduled_at,
            'status' => $v->status,
        ]);

        return $this->json([
            'data' => $bookings->concat($visits)->sortBy('start')->values(),
        ]);
    }
}
