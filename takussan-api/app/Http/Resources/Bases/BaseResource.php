<?php

namespace App\Http\Resources\Bases;

use BackedEnum;
use DateTimeInterface;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Lang;

abstract class BaseResource extends JsonResource
{
    protected function iso(?DateTimeInterface $date): ?string
    {
        return $date?->format(DateTimeInterface::ATOM);
    }

    protected function enumValue(?BackedEnum $enum): string|int|null
    {
        return $enum?->value;
    }

    protected function enumLabel(?BackedEnum $enum, string $group, string $locale = 'fr'): ?string
    {
        if ($enum === null) {
            return null;
        }

        $key = "{$group}.{$enum->value}";
        $translation = Lang::get($key, [], $locale);

        return $translation === $key ? null : $translation;
    }

    protected function mediaUrl(string $collection, ?string $conversion = null): ?string
    {
        if (! method_exists($this->resource, 'getFirstMediaUrl')) {
            return null;
        }

        $url = $conversion !== null
            ? $this->resource->getFirstMediaUrl($collection, $conversion)
            : $this->resource->getFirstMediaUrl($collection);

        return $url !== '' ? $url : null;
    }
}
