<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Models\Bases\BaseModelInterface;
use App\Models\Bases\BaseModelTrait;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable implements BaseModelInterface
{
    use BaseModelTrait, HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'first_name',
        'last_name',
        'phone',
        'username',
        'email',
        'status',
        'password',
        'type',
        'added_by_id',
        'roles',
        'email_verified_at',
        'remember_token',
        'google_id',
        'extra',
    ];
    /**
     * The attributes that should be hidden for serialization.
     *
     * @var array<int, string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];
    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'email_verified_at' => 'datetime',
        'roles' => 'array',
    ];

    public function __construct(array $attributes = [])
    {
        $this->init();
        parent::__construct($attributes);
    }

    public function added_by(): BelongsTo
    {
        return $this->belongsTo(User::class, 'added_by_id');
    }

    public function addresses(): MorphMany
    {
        return $this->morphMany(Address::class, 'owner');
    }

    public function projects(): HasMany
    {
        return $this->hasMany(Project::class);
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class);
    }

    public function hasRoles(array|string $roles, bool $all = false): bool
    {
        $roles = collect(is_array($roles) ? $roles : [$roles]);
        if ($all) {
            return $roles->intersect($this->roles ?? [])->count() === $roles->count();
        }
        return $roles->intersect($this->roles ?? [])->count() > 0;
    }


}
