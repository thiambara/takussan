<?php

namespace App\Models;

use App\Models\Bases\Enums\UserStatus;
use App\Models\Bases\Enums\UserType;
use Database\Factories\UserFactory;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable implements MustVerifyEmail
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    protected $fillable = [
        'username',
        'first_name',
        'last_name',
        'type',
        'status',
        'email',
        'password',
        'phone',
        'bio',
        'preferred_language',
        'timezone',
        'last_login_at',
        'agency_id',
        'added_by_id',
        'google_id',
        'facebook_id',
        'apple_id',
        'two_factor_enabled',
        'notifications_email_enabled',
        'notifications_push_enabled',
        'notifications_sms_enabled',
        'metadata',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'two_factor_secret',
        'two_factor_recovery_codes',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'phone_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'password' => 'hashed',
            'type' => UserType::class,
            'status' => UserStatus::class,
            'two_factor_enabled' => 'boolean',
            'two_factor_secret' => 'encrypted',
            'two_factor_recovery_codes' => 'encrypted',
            'notifications_email_enabled' => 'boolean',
            'notifications_push_enabled' => 'boolean',
            'notifications_sms_enabled' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function getFullNameAttribute(): string
    {
        return "{$this->first_name} {$this->last_name}";
    }
}
