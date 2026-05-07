<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use App\Models\Enums\DataExportStatus;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DataExport extends AbstractModel
{
    use Auditable;

    protected $fillable = [
        'user_id',
        'requested_by',
        'reason',
        'status',
        'archive_path',
        'size_bytes',
        'requested_at',
        'ready_at',
        'expires_at',
        'last_downloaded_at',
    ];

    protected $casts = [
        'status' => DataExportStatus::class,
        'archive_path' => 'encrypted',
        'requested_at' => 'datetime',
        'ready_at' => 'datetime',
        'expires_at' => 'datetime',
        'last_downloaded_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }
}
