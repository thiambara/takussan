<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\DataExport;
use App\Models\Enums\DataExportStatus;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class DataExportDownloadController extends Controller
{
    public function __invoke(Request $request, DataExport $dataExport)
    {
        $user = $request->user();
        abort_unless($user, 401);
        abort_unless(
            $dataExport->user_id === $user->id
            || ($dataExport->requested_by === $user->id && $user->isSuperAdmin()),
            403
        );

        if ($dataExport->expires_at !== null && $dataExport->expires_at->isPast()) {
            return $this->json(['message' => 'Data export expired.'], 410);
        }

        abort_unless($dataExport->status === DataExportStatus::Ready && $dataExport->archive_path, 404);
        abort_unless(Storage::disk('local')->exists($dataExport->archive_path), 404);

        $dataExport->update(['last_downloaded_at' => now()]);

        activity('Privacy')
            ->causedBy($user)
            ->performedOn($dataExport)
            ->event('data_export_downloaded')
            ->log('Export RGPD téléchargé');

        return Storage::disk('local')->download($dataExport->archive_path, "takussan-data-export-{$dataExport->id}.zip");
    }
}
