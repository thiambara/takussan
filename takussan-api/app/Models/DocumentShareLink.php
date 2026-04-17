<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DocumentShareLink extends AbstractModel
{
    use HasFactory;

    protected $fillable = [
        'document_id', 'token', 'expires_at', 'password_hash',
        'max_downloads', 'downloads_count',
        'created_by_id', 'revoked_at', 'last_accessed_at',
    ];

    protected $hidden = ['password_hash'];

    protected $casts = [
        'expires_at' => 'datetime',
        'revoked_at' => 'datetime',
        'last_accessed_at' => 'datetime',
    ];

    public function document(): BelongsTo
    {
        return $this->belongsTo(Document::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }
}
