<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\DataExportResource;
use App\Jobs\Privacy\ProcessDataExport;
use App\Models\DataExport;
use App\Models\Enums\DataExportStatus;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DataExportController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $exports = DataExport::query()
            ->where(fn ($query) => $query
                ->where('user_id', $request->user()->id)
                ->orWhere('requested_by', $request->user()->id))
            ->latest('requested_at')
            ->paginate((int) $request->input('per_page', 20));

        return $this->paginated($exports, DataExportResource::collection($exports->items())->resolve());
    }

    public function store(Request $request): JsonResponse
    {
        $recent = DataExport::query()
            ->where('user_id', $request->user()->id)
            ->where('requested_by', $request->user()->id)
            ->where('requested_at', '>', now()->subDay())
            ->latest('requested_at')
            ->first();

        if ($recent !== null) {
            // TCK-575 — un CODE et l'instant où une nouvelle demande sera acceptée : le front
            // possède le texte (principe n° 5) et le 429 générique du front promettait
            // « réessayez dans quelques minutes » pour une attente qui va jusqu'à 24 h. La prose
            // (jusque-là française en dur) suit la langue négociée pour les autres clients.
            $disponible = $recent->requested_at->copy()->addDay();

            return $this->json([
                'code' => 'data_export_throttled',
                'message' => __('account.data_export.errors.throttled', [
                    'date' => $disponible->copy()->utc()->format('Y-m-d H:i'),
                ]),
                'available_at' => $disponible->copy()->utc()->format(DATE_ATOM),
            ], 429, ['Retry-After' => (string) max(1, (int) ceil(now()->diffInSeconds($disponible, false)))]);
        }

        $export = DataExport::query()->create([
            'user_id' => $request->user()->id,
            'requested_by' => $request->user()->id,
            'status' => DataExportStatus::Queued,
            'requested_at' => now(),
        ]);

        activity('Privacy')
            ->causedBy($request->user())
            ->performedOn($export)
            ->event('user_data_export_requested')
            ->log('Export RGPD demandé');

        ProcessDataExport::dispatch($export->id);

        return $this->json(['data' => DataExportResource::make($export->refresh())->resolve()], 202);
    }
}
