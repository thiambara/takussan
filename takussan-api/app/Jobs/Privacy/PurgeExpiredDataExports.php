<?php

namespace App\Jobs\Privacy;

use App\Models\DataExport;
use App\Models\Enums\DataExportStatus;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;

class PurgeExpiredDataExports implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(): void
    {
        DataExport::query()
            ->where('status', DataExportStatus::Ready)
            ->where('expires_at', '<=', now())
            ->get()
            ->each(function (DataExport $export): void {
                if ($export->archive_path) {
                    Storage::disk('local')->delete($export->archive_path);
                }
                $export->update(['status' => DataExportStatus::Expired]);
            });
    }
}
