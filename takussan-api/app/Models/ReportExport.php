<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReportExport extends AbstractModel
{
    use Auditable;

    protected $fillable = [
        'requested_by',
        'report',
        'format',
        'parameters',
        'status',
        'archive_path',
        'row_count',
        'size_bytes',
        'ready_at',
        'expires_at',
        'failure_reason',
    ];

    protected $casts = [
        'parameters' => 'array',
        'archive_path' => 'encrypted',
        'ready_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }
}
