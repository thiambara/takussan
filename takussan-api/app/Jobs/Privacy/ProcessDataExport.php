<?php

namespace App\Jobs\Privacy;

use App\Models\DataExport;
use App\Notifications\DataExportReadyNotification;
use App\Services\Privacy\DataExportBuilder;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class ProcessDataExport implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public readonly int $dataExportId) {}

    public function handle(DataExportBuilder $builder): void
    {
        $export = $builder->build(DataExport::query()->findOrFail($this->dataExportId));
        $export->user?->notify(new DataExportReadyNotification($export));
    }
}
