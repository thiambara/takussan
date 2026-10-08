<?php

namespace App\Services\Booking;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Property;
use App\Models\PropertyCalendarFeed;
use App\Models\PropertyUnavailability;
use App\Models\User;
use App\Services\Model\NotificationService;
use App\Support\Http\SafeOutboundUrl;
use App\Support\Http\UnsafeOutboundUrl;
use App\Support\Ical\IcalReader;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * TCK-596 §3B (ADR-0041 §5-§7) — l'import d'un flux iCal externe en indisponibilités.
 *
 * La source fait foi pour SES événements : un événement nouveau crée une plage, un événement modifié
 * la déplace, un événement disparu (ou `CANCELLED`) la supprime. Un événement qui chevauche une
 * réservation confirmée est enregistré et marqué en conflit — **jamais** la réservation n'est
 * annulée — et le bailleur et l'agent du bien sont prévenus, une fois par conflit.
 */
class PropertyCalendarSyncService
{
    /** Un flux de plus de 2 000 événements futurs n'est pas un calendrier de logement. */
    public const MAX_EVENTS = 2000;

    public const MAX_FEEDS_PER_PROPERTY = 10;

    public function __construct(
        private readonly SafeOutboundUrl $outbound,
        private readonly IcalReader $reader,
        private readonly PropertyAvailabilityService $availability,
        private readonly BookingStakeholders $stakeholders,
        private readonly NotificationService $notifications,
    ) {}

    /**
     * Enregistre un flux. L'URL est jugée AVANT tout enregistrement, sans requête sortante.
     */
    public function register(Property $property, string $url, ?string $label, User $by): PropertyCalendarFeed
    {
        try {
            ['host' => $host] = $this->outbound->check($url);
        } catch (UnsafeOutboundUrl $e) {
            abort_code(422, 'calendar_feed.unsafe_url', ['reason' => $e->reason]);
        }

        return DB::transaction(function () use ($property, $url, $host, $label, $by): PropertyCalendarFeed {
            Property::query()->whereKey($property->getKey())->lockForUpdate()->first();
            abort_code_if(
                $property->calendarFeeds()->count() >= self::MAX_FEEDS_PER_PROPERTY,
                422,
                'calendar_feed.limit_reached'
            );

            return $property->calendarFeeds()->create([
                'url' => $url,
                'url_host' => $host,
                'label' => $label,
                'created_by_id' => $by->id,
                'last_status' => PropertyCalendarFeed::STATUS_PENDING,
            ]);
        });
    }

    /** Synchronise un flux ; rend `true` en cas de succès. Un échec est compté, jamais levé. */
    public function sync(PropertyCalendarFeed $feed): bool
    {
        try {
            $events = $this->reader->events($this->outbound->get($feed->url));
        } catch (UnsafeOutboundUrl $e) {
            $this->recordFailure($feed, $e->reason);

            return false;
        }

        // Un UID répété (occurrences d'une récurrence, `RECURRENCE-ID`) : la première fait foi —
        // deux lignes pour une même clé violeraient l'unicité `(flux, uid)` et avorteraient la
        // transaction entière.
        $today = Carbon::today();
        $byUid = [];
        foreach ($events as $event) {
            if ($event['end']->gt($today) && ! isset($byUid[$event['uid']])) {
                $byUid[$event['uid']] = $event;
            }
        }
        $events = array_slice(array_values($byUid), 0, self::MAX_EVENTS);

        $newConflicts = DB::transaction(function () use ($feed, $events): array {
            Property::query()->whereKey($feed->property_id)->lockForUpdate()->first();

            $existing = $feed->unavailabilities()->get()->keyBy('external_uid');
            $seen = [];
            $newConflicts = [];

            foreach ($events as $event) {
                $seen[$event['uid']] = true;
                $conflict = $this->availability->confirmedOverlap((int) $feed->property_id, $event['start'], $event['end']);

                /** @var PropertyUnavailability|null $row */
                $row = $existing->get($event['uid']);
                $wasConflict = $row?->conflict_booking_id;

                $attributes = [
                    'starts_on' => $event['start']->toDateString(),
                    'ends_on' => $event['end']->toDateString(),
                    'conflict_booking_id' => $conflict?->id,
                ];

                if ($row === null) {
                    $row = $feed->unavailabilities()->create($attributes + [
                        'property_id' => $feed->property_id,
                        'source' => PropertyUnavailability::SOURCE_ICAL,
                        'external_uid' => $event['uid'],
                    ]);
                } else {
                    $row->update($attributes);
                }

                if ($conflict !== null && $wasConflict !== $conflict->id) {
                    $newConflicts[] = $row;
                }
            }

            $feed->unavailabilities()
                ->whereNotIn('external_uid', array_keys($seen) ?: [''])
                ->delete();

            $feed->forceFill([
                'last_synced_at' => now(),
                'last_status' => PropertyCalendarFeed::STATUS_OK,
                'last_error' => null,
                'failing_since' => null,
                'consecutive_failures' => 0,
            ])->save();

            return $newConflicts;
        });

        foreach ($newConflicts as $row) {
            $this->notifyConflict($feed, $row);
        }

        return true;
    }

    private function recordFailure(PropertyCalendarFeed $feed, string $reason): void
    {
        $failures = $feed->consecutive_failures + 1;

        $feed->forceFill([
            'last_synced_at' => now(),
            'last_status' => PropertyCalendarFeed::STATUS_FAILED,
            'last_error' => mb_substr($reason, 0, 60),
            'failing_since' => $feed->failing_since ?? now(),
            'consecutive_failures' => $failures,
        ])->save();

        // Une fois, au seuil — pas à chaque heure tant que le flux reste en panne.
        if ($failures === PropertyCalendarFeed::FAILURES_BEFORE_ALERT) {
            $property = $feed->property()->with('owner')->first();
            if ($property?->owner !== null) {
                $this->notifications->send($property->owner, NotificationCode::PropertyCalendarFeedFailing, [
                    'property' => $property->title,
                    'feed' => $this->feedName($feed),
                ], NotificationTarget::of('property', $property->id));
            }
        }
    }

    private function notifyConflict(PropertyCalendarFeed $feed, PropertyUnavailability $row): void
    {
        $property = $feed->property()->first();
        if ($property === null) {
            return;
        }

        foreach ($this->stakeholders->propertyTeam($property) as $user) {
            $this->notifications->send($user, NotificationCode::PropertyCalendarConflict, [
                'property' => $property->title,
                'feed' => $this->feedName($feed),
                'start_date' => $row->starts_on->toDateString(),
                'end_date' => $row->ends_on->toDateString(),
            ], NotificationTarget::of('property', $property->id));
        }
    }

    private function feedName(PropertyCalendarFeed $feed): string
    {
        return $feed->label !== null && $feed->label !== '' ? $feed->label : $feed->url_host;
    }
}
