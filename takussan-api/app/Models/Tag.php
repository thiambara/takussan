<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\TagType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\MorphToMany;
use Illuminate\Support\Str;

class Tag extends AbstractModel
{
    use HasFactory;

    protected $fillable = ['name', 'slug', 'type', 'icon', 'color', 'description'];

    protected $casts = [
        'type' => TagType::class,
    ];

    protected static function booted(): void
    {
        static::creating(function (self $m) {
            if (empty($m->slug)) {
                $m->slug = Str::slug($m->name);
            }
        });
    }

    public function properties(): MorphToMany
    {
        return $this->morphedByMany(Property::class, 'taggable');
    }

    public function customers(): MorphToMany
    {
        return $this->morphedByMany(Customer::class, 'taggable');
    }
}
