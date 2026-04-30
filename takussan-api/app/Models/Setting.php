<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\SettingScope;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Setting extends AbstractModel
{
    use HasFactory;

    protected $fillable = ['key', 'value', 'scope', 'scope_id', 'updated_by_id'];

    protected $casts = [
        'value' => 'array',
        'scope' => SettingScope::class,
    ];

    protected static array $requestFilterable = ['scope', 'scope_id', 'key'];

    protected static array $requestSortable = ['id', 'created_at', 'key'];

    // `value` is intentionally exposed via sparse fieldsets so the admin UI can
    // fetch the current payload (TCK-068); secrets live in Integration, not here.
    protected static array $queryFields = ['id', 'key', 'value', 'scope', 'scope_id', 'updated_by_id', 'created_at', 'updated_at'];

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by_id');
    }
}
