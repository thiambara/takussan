<?php

namespace Tests\Unit\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Enums\UserStatus;
use DateTimeImmutable;
use Tests\TestCase;

class BaseResourceTest extends TestCase
{
    private function resource(): BaseResource
    {
        return new class(null) extends BaseResource
        {
            public function toArray($request): array
            {
                return [];
            }

            public function callIso($value)
            {
                return $this->iso($value);
            }

            public function callEnumValue($value)
            {
                return $this->enumValue($value);
            }

            public function callEnumLabel($value, string $group, string $locale = 'fr')
            {
                return $this->enumLabel($value, $group, $locale);
            }

            public function callMediaUrl(string $collection, ?string $conversion = null)
            {
                return $this->mediaUrl($collection, $conversion);
            }
        };
    }

    public function test_iso_formats_dates_and_passes_null_through(): void
    {
        $r = $this->resource();

        $date = new DateTimeImmutable('2026-04-21T10:30:00+00:00');
        $this->assertSame('2026-04-21T10:30:00+00:00', $r->callIso($date));
        $this->assertNull($r->callIso(null));
    }

    public function test_enum_value_returns_backed_value_or_null(): void
    {
        $r = $this->resource();

        $this->assertSame(UserStatus::Active->value, $r->callEnumValue(UserStatus::Active));
        $this->assertNull($r->callEnumValue(null));
    }

    public function test_enum_label_returns_null_when_translation_missing(): void
    {
        $r = $this->resource();

        // Group "nonexistent" has no lang file → translator returns the key
        // unchanged, helper must translate that into null.
        $this->assertNull($r->callEnumLabel(UserStatus::Active, 'nonexistent'));
        $this->assertNull($r->callEnumLabel(null, 'nonexistent'));
    }

    public function test_media_url_returns_null_when_resource_is_null(): void
    {
        // Guards against passing null to method_exists() when a resource
        // wraps a nullable relation.
        $this->assertNull($this->resource()->callMediaUrl('avatar'));
    }
}
