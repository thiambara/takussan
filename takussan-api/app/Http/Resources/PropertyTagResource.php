<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Tag;
use Illuminate\Http\Request;

/**
 * TCK-2045 (P61.04) — une étiquette rattachée à un bien, telle que `PropertyResource` la projette
 * dans `tags` : sans `pivot`, dont `taggable_type` exposait le nom de classe PHP du bien.
 *
 * @mixin Tag
 */
class PropertyTagResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'type' => $this->enumValue($this->type),
            'status' => $this->enumValue($this->status),
            'icon' => $this->icon,
            'color' => $this->color,
        ];
    }
}
