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

        return $this->json([
            'data' => DataExportResource::collection($exports->items())->resolve(),
            'meta' => [
                'total' => $exports->total(),
                'current_page' => $exports->currentPage(),
                'last_page' => $exports->lastPage(),
                'per_page' => $exports->perPage(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $recent = DataExport::query()
            ->where('user_id', $request->user()->id)
            ->where('requested_by', $request->user()->id)
            ->where('requested_at', '>', now()->subDay())
            ->exists();

        if ($recent) {
            return $this->json(['message' => 'Un export a déjà été demandé dans les dernières 24h.'], 429);
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
