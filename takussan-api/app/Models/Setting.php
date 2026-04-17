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

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by_id');
    }
}
