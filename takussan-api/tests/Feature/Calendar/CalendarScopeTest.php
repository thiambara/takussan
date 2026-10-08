<?php

namespace Tests\Feature\Calendar;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-591 — le périmètre de l'agenda (AC2, AC20, AC21).
 *
 * Sur `5f872f1f`, le périmètre non-admin reposait sur `$user->agency_id` — l'agence du profil actif
 * quel qu'il soit — et la branche visites ajoutait `agent_id = moi` sans condition d'agence.
 */
class CalendarScopeTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
    }

    private function member(string $role): User
    {
        $user = User::factory()->create();
        $this->materializeRoleProfile($user, $role, $this->agency);

        return $user;
    }

    private function window(string $extra = ''): string
    {
        return '/api/calendar?start_date='.now()->toDateString().'&end_date='.now()->addWeek()->toDateString().$extra;
    }

    private function eventsOn(Property $property): void
    {
        Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => Customer::factory()->create()->id,
            'status' => BookingStatus::Confirmed,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(2)->toDateString(),
        ]);
        PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => User::factory()->create()->id,
            'status' => VisitStatus::Scheduled,
            'scheduled_at' => now()->addDays(2),
        ]);
    }

    /** AC2 — un bailleur de A ne voit que les événements de SES biens. */
    public function test_a_landlord_sees_only_his_own_properties(): void
    {
        $landlord = $this->member('owner');
        $mine = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $landlord->id]);
        $notMine = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->member('agent')->id]);
        $this->eventsOn($mine);
        $this->eventsOn($notMine);

        $propertyIds = collect($this->actingAsApi($landlord)->apiGet($this->window())->assertOk()->json('data'))
            ->pluck('property_id')->unique()->values()->all();

        $this->assertSame([$mine->id], $propertyIds);
    }

    public function test_an_agent_sees_the_whole_agency(): void
    {
        $agent = $this->member('agent');
        $property = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->member('owner')->id]);
        $this->eventsOn($property);

        $this->actingAsApi($agent)->apiGet($this->window())->assertOk()->assertJsonCount(2, 'data');
    }

    /** AC21 — un agent qui n'est plus personnel de A ne reçoit plus la visite qui lui reste assignée. */
    public function test_an_agent_removed_from_the_agency_no_longer_sees_his_assigned_visit(): void
    {
        $agent = $this->member('agent');
        $property = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->member('owner')->id]);
        PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => User::factory()->create()->id,
            'agent_id' => $agent->id,
            'status' => VisitStatus::Scheduled,
            'scheduled_at' => now()->addDays(2),
        ]);

        $this->actingAsApi($agent)->apiGet($this->window())->assertOk()->assertJsonCount(1, 'data');

        // Ce que fait le retrait : le profil d'agent disparaît, la visite reste assignée.
        AgentProfile::query()->where('user_id', $agent->id)->delete();
        $agent->refresh();

        $this->actingAsApi($agent)->apiGet($this->window())->assertOk()->assertJsonCount(0, 'data');
    }

    /** AC20 — le refus de l'agenda d'une autre agence est traduit. */
    public function test_the_cross_agency_refusal_is_translated(): void
    {
        $agent = $this->member('agent');
        $uri = $this->window('&agency_id='.Agency::factory()->create()->id);

        $fr = $this->actingAsApi($agent)->getJson($uri, ['Accept-Language' => 'fr'])->assertForbidden()
            ->assertJsonPath('code', 'calendar.other_agency_forbidden')->json('message');
        $en = $this->actingAsApi($agent)->getJson($uri, ['Accept-Language' => 'en'])->assertForbidden()->json('message');

        $this->assertSame(__('errors.calendar.other_agency_forbidden', [], 'fr'), $fr);
        $this->assertSame(__('errors.calendar.other_agency_forbidden', [], 'en'), $en);
        $this->assertNotSame($fr, $en);
    }
}
