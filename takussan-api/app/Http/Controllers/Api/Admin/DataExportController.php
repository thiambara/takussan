<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\StoreDataExportRequest;
use App\Http\Resources\DataExportResource;
use App\Jobs\Privacy\ProcessDataExport;
use App\Models\DataExport;
use App\Models\Enums\DataExportStatus;
use App\Models\User;
use Illuminate\Http\JsonResponse;

class DataExportController extends Controller
{
    public function store(StoreDataExportRequest $request, User $user): JsonResponse
    {
        $export = DataExport::query()->create([
            'user_id' => $user->id,
            'requested_by' => $request->user()->id,
            'reason' => $request->validated('reason'),
            'status' => DataExportStatus::Queued,
            'requested_at' => now(),
        ]);

        activity('Admin')
            ->causedBy($request->user())
            ->performedOn($export)
            ->withProperties(['target_user_id' => $user->id, 'reason' => $export->reason])
            ->event('super_admin_data_export_requested')
            ->log('Export RGPD demandé par un super-admin');

        ProcessDataExport::dispatch($export->id);

        return $this->json(['data' => DataExportResource::make($export->refresh())->resolve()], 202);
    }
}
