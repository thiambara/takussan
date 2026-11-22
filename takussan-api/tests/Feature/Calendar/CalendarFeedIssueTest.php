<?php

namespace Tests\Feature\Calendar;

use App\Models\Agency;
use App\Models\CalendarFeed;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-617 AC5 — le refus d'un lien sans agence dit la vraie raison : l'agent de deux agences qui n'a
 * pas choisi d'espace est du personnel (`calendar.feed_agency_required`), l'ex-agent ne l'est plus
 * (`calendar.feed_not_staff`, inchangé). Aucun lien n'est créé dans les deux cas.
 */
class CalendarFeedIssueTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_an_agent_of_two_agencies_without_a_chosen_profile_must_choose_the_agency(): void
    {
        $agent = User::factory()->create();
        $this->materializeRoleProfile($agent, 'agent', Agency::factory()->create());
        $this->materializeRoleProfile($agent, 'agent', Agency::factory()->create());

        $this->actingAsApi($agent)->apiPost('/api/me/calendar-feed')
            ->assertForbidden()
            ->assertJsonPath('code', 'calendar.feed_agency_required')
            ->assertJsonPath('message', __('errors.calendar.feed_agency_required'));

        $this->assertSame(0, CalendarFeed::query()->count());
    }

    public function test_a_former_agent_without_any_agency_is_still_not_staff(): void
    {
        $former = User::factory()->create();

        $this->actingAsApi($former)->apiPost('/api/me/calendar-feed')
            ->assertForbidden()
            ->assertJsonPath('code', 'calendar.feed_not_staff');

        $this->assertSame(0, CalendarFeed::query()->count());
    }

    public function test_the_agent_who_chose_an_agency_gets_the_link(): void
    {
        $agent = User::factory()->create();
        $a = Agency::factory()->create();
        $this->materializeRoleProfile($agent, 'agent', $a);
        $this->materializeRoleProfile($agent, 'agent', Agency::factory()->create());
        $profile = $agent->agentProfiles()->where('agency_id', $a->id)->sole();

        $this->actingAsApi($agent)->apiPost('/api/me/calendar-feed', [], ['X-Profile-Id' => 'agent:'.$profile->id])
            ->assertCreated();

        $this->assertSame((int) $a->id, (int) CalendarFeed::query()->sole()->agency_id);
    }
}
