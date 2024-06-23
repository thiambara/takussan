<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Models\base\BaseModelInterface;
use App\Models\base\BaseModelTrait;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Passport\HasApiTokens;

class User extends Authenticatable implements BaseModelInterface
{
    use BaseModelTrait, HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    public function __construct(array $attributes = [])
    {
        $this->init();
        parent::__construct($attributes);
    }

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
        'owner_id',
        'owner_type',
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
    ];


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




    /**
     * Find the user instance for the given username.
     *
     * @param  string  $username
     * @return ?self
     */
    public function findForPassport(string $username): ?self
    {
        return $this->where('username', $username)->first();
    }
    /**
     * Specifies the user's FCM tokens
     *
     * @return string|array
     */
    public function routeNotificationForFcm(): array|string
    {
        return $this->getDeviceTokens();
    }

    public function getDeviceTokens(): array
    {
        return [];
    }


}
