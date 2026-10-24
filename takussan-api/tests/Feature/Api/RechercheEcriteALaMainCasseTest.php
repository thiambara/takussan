<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\ApiTestCase;

/**
 * TCK-1840 (P186.02) — trois recherches écrites à la main gardaient un `like` nu : sensibles à la
 * casse sous PostgreSQL (piège n° 9 de `takussan-api/CLAUDE.md`), et `%` y valait un joker. Elles
 * prennent la forme de TCK-600 : `CaseInsensitive::sql()`/`fold()`, et `%`/`_` échappés.
 */
class RechercheEcriteALaMainCasseTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_la_file_de_moderation_des_biens(): void
    {
        $agency = Agency::factory()->create(['moderation_required' => true]);
        $agent = User::factory()->create(['agency_id' => $agency->id]);
        $villa = Property::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $agent->id,
            'status' => PropertyStatus::PendingReview,
            'title' => 'Villa Almadies',
        ]);
        Property::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $agent->id,
            'status' => PropertyStatus::PendingReview,
            'title' => 'Studio Plateau',
        ]);
        $this->apiActingAsRole('agency_admin', ['agency_id' => $agency->id]);

        $file = fn (string $search) => collect($this->apiGet('/api/properties/moderation?filter[search]='.urlencode($search))
            ->assertOk()->json('data'))->pluck('id')->all();

        $this->assertSame([$villa->id], $file('Villa'));
        $this->assertSame([$villa->id], $file('villa'));
        $this->assertSame([$villa->id], $file('VILLA'));
        $this->assertSame([], $file('%'));
    }

    public function test_le_journal_de_l_agence(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $property = Property::factory()->create(['agency_id' => $agency->id]);
        activity()->performedOn($property)->event('updated')->log('Relance Diop');
        activity()->performedOn($property)->event('updated')->log('Visite Fall');

        $journal = fn (string $search) => collect($this->apiGet('/api/activity-log?filter[search]='.urlencode($search))
            ->assertOk()->json('data'))->pluck('description')->all();

        $this->assertSame(['Relance Diop'], $journal('Diop'));
        $this->assertSame(['Relance Diop'], $journal('diop'));
        $this->assertSame(['Relance Diop'], $journal('relance'));
        $this->assertSame([], $journal('%'));
    }

    public function test_le_repli_sql_de_has_query_builder(): void
    {
        $marche = Tag::factory()->create(['name' => 'Marché Sandaga']);
        Tag::factory()->create(['name' => 'Plage']);

        $tags = fn (string $search) => Tag::buildQuery(request: Request::create('/', 'GET', ['filter' => ['search' => $search]]))
            ->pluck('tags.id')->all();

        $this->assertSame([$marche->id], $tags('Sandaga'));
        $this->assertSame([$marche->id], $tags('sandaga'));
        $this->assertSame([$marche->id], $tags('MARCHÉ'));
        $this->assertSame([], $tags('%'));
    }
}
