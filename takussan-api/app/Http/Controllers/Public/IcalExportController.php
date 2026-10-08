<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Base\Controller;
use App\Models\Enums\BookingStatus;
use App\Models\Property;
use App\Models\PropertyUnavailability;
use App\Support\Ical\IcalWriter;
use Illuminate\Http\Response;
use Illuminate\Support\Carbon;

/**
 * TCK-596 §3B (ADR-0041 §3-§4) — le flux iCal d'un bien, pour une autre plateforme.
 *
 * Il porte les réservations CONFIRMÉES (« Réservé ») et les blocages MANUELS (« Indisponible ») ;
 * jamais les dates importées (l'écho entre plateformes), jamais une donnée personnelle : ni nom, ni
 * téléphone, ni référence. Le jeton est comparé par son empreinte, puis par `hash_equals`.
 */
class IcalExportController extends Controller
{
    public function __invoke(IcalWriter $writer, string $token): Response
    {
        abort_unless(preg_match('/^[0-9a-f]{64}$/', $token) === 1, 404);

        $hash = hash('sha256', $token);
        $property = Property::query()->where('ical_export_token_hash', $hash)->first();
        abort_unless($property !== null && hash_equals((string) $property->ical_export_token_hash, $hash), 404);
        // VERIF-596 passe 2 (n2) — un bien archivé, vendu ou qui n'est plus loué à la nuit n'exporte
        // plus rien ; le jeton est gardé, l'export revient si le bien redevient louable.
        abort_unless($property->hasHostCalendar(), 404);

        $since = Carbon::today()->subMonths(3)->toDateString();

        $bookings = $property->bookings()
            ->where('status', BookingStatus::Confirmed)
            ->whereNotNull('start_date')
            ->whereNotNull('end_date')
            ->where('end_date', '>', $since)
            ->orderBy('start_date')
            ->get(['id', 'start_date', 'end_date'])
            ->map(fn ($b): array => [
                'uid' => 'booking-'.$b->id.'@takussan',
                'start' => $b->start_date,
                'end' => $b->end_date,
                'summary' => 'Réservé',
            ]);

        $blocks = $property->unavailabilities()
            ->where('source', PropertyUnavailability::SOURCE_MANUAL)
            ->where('ends_on', '>', $since)
            ->orderBy('starts_on')
            ->get(['id', 'starts_on', 'ends_on'])
            ->map(fn (PropertyUnavailability $u): array => [
                'uid' => 'block-'.$u->id.'@takussan',
                'start' => $u->starts_on,
                'end' => $u->ends_on,
                'summary' => 'Indisponible',
            ]);

        return new Response($writer->write($bookings->concat($blocks), 'Takussan'), 200, [
            'Content-Type' => 'text/calendar; charset=utf-8',
            'Cache-Control' => 'private, max-age=300',
        ]);
    }
}
