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

    public function test_default_kind_is_standard(): void
    {
        $agency = Agency::factory()->create();

        $this->assertSame(AgencyKind::Standard, $agency->kind);
        $this->assertDatabaseHas('agencies', [
            'id' => $agency->id,
            'kind' => 'standard',
        ]);
    }

    public function test_factory_accepts_kind_override(): void
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Individual]);

        $this->assertSame(AgencyKind::Individual, $agency->fresh()->kind);
        $this->assertDatabaseHas('agencies', [
            'id' => $agency->id,
            'kind' => 'individual',
        ]);
    }

    public function test_factory_individual_state_helper(): void
    {
        $agency = Agency::factory()->individual()->create();

        $this->assertTrue($agency->kind->isIndividual());
    }

    public function test_kind_persists_across_reload(): void
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Individual]);

        $this->assertSame(AgencyKind::Individual, Agency::find($agency->id)->kind);
    }

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
