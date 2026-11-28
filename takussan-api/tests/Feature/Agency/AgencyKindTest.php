<?php

namespace Tests\Feature\Agency;

use App\Http\Resources\AgencyResource;
use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

/**
 * TCK-248 — Agency.kind (standard | individual).
 */
class AgencyKindTest extends TestCase
{
    use RefreshDatabase;

    public function test_is_individual_helper_returns_true_only_for_individual(): void
    {
        $individual = Agency::factory()->create(['kind' => AgencyKind::Individual]);
        $standard = Agency::factory()->create(['kind' => AgencyKind::Standard]);

        $this->assertTrue($individual->kind->isIndividual());
        $this->assertFalse($standard->kind->isIndividual());
        $this->assertTrue($standard->kind->isStandard());
        $this->assertFalse($individual->kind->isStandard());
    }

    public function test_kind_is_exposed_as_string_in_agency_resource(): void
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Individual]);

        $payload = (new AgencyResource($agency))->toArray(Request::create('/'));

        $this->assertArrayHasKey('kind', $payload);
        $this->assertSame('individual', $payload['kind']);
    }

    public function test_existing_agencies_default_to_standard_via_db_default(): void
    {
        $agency = new Agency([
            'name' => 'Legacy Agency',
            'slug' => 'legacy-agency-'.uniqid(),
        ]);
        $agency->save();

        $reloaded = Agency::find($agency->id);
        $this->assertSame(AgencyKind::Standard, $reloaded->kind);
    }
}
