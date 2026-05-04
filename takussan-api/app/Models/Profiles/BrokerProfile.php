<?php

namespace App\Models\Profiles;

use App\Models\Agency;
use App\Models\Bases\AbstractModel;
use App\Models\User;
use Database\Factories\Profiles\BrokerProfileFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class BrokerProfile extends AbstractModel
{
    /** @use HasFactory<BrokerProfileFactory> */
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'user_id', 'license_number',
        'insurance_policy_id', 'regulator_registration',
        'active_until', 'metadata',
    ];

    protected $casts = [
        'active_until' => 'date',
        'metadata' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function agencyCollaborations(): HasMany
    {
        return $this->hasMany(BrokerAgencyCollaboration::class);
    }

    public function agencies(): BelongsToMany
    {
        return $this->belongsToMany(
            Agency::class,
            'broker_agency_collaborations',
            'broker_profile_id',
            'agency_id',
        )->withPivot(['status', 'started_at', 'ended_at', 'metadata'])
            ->withTimestamps();
    }
}
