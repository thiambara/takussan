<?php

namespace App\Models;

use App\Models\Bases\BaseModelInterface;
use App\Models\Bases\BaseModelTrait;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Permission extends Model implements BaseModelInterface
{
    use BaseModelTrait, HasFactory;

    protected $table = 'permissions';

    protected $fillable = [
        'code',
        'name',
        'description',
    ];

    public function __construct(array $attributes = [])
    {
        $this->init();
        parent::__construct($attributes);
    }

    /**
     * The roles that belong to the permission.
     */
    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'role_has_permissions');
    }
}
