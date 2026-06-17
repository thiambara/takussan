<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NotificationTemplate extends AbstractModel
{
    use HasFactory;

    // TCK-283 — `authentication` (OTP) / `utility` (transactional, reminders,
    // dunning). Never `marketing`.
    public const META_CATEGORY_AUTHENTICATION = 'authentication';

    public const META_CATEGORY_UTILITY = 'utility';

    public const META_STATUS_PENDING = 'pending';

    public const META_STATUS_APPROVED = 'approved';

    public const META_STATUS_REJECTED = 'rejected';

    protected $fillable = [
        'event', 'channel', 'locale', 'subject', 'body', 'is_active', 'updated_by_id',
        // TCK-283 — WhatsApp / Meta template registry columns.
        'meta_template_name', 'meta_category', 'meta_status', 'meta_variables',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'meta_variables' => 'array',
    ];

    /**
     * Ordered Meta template variable mapping, defaulting to an empty list
     * when the column is null (no DEFAULT on JSON in the migration).
     *
     * @return list<mixed>
     */
    public function metaVariables(): array
    {
        return $this->meta_variables ?? [];
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by_id');
    }
}
