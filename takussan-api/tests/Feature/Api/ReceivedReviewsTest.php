<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\ReviewStatus;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * TCK-597 (ADR-0043 §6, AC7) — la boîte des avis reçus : chacun voit ce qui le concerne, filtré
 * côté serveur en une requête.
 *
 * Avant : aucune boîte. L'agent ne voyait les avis de ses biens qu'en ouvrant chaque fiche.
 */
class ReceivedReviewsTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $otherAgent;

    private User $admin;

    private Property $mine;

    private Property $shared;

    private Property $theirs;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->create();
        $this->materializeRoleProfile($this->agent, 'agent', $this->agency);
        $this->otherAgent = User::factory()->create();
        $this->materializeRoleProfile($this->otherAgent, 'agent', $this->agency);
        $this->admin = User::factory()->create();
        $this->materializeRoleProfile($this->admin, 'agency_admin', $this->agency);

        $this->mine = Property::factory()->published()->create(['agency_id' => $this->agency->id, 'user_id' => $this->agent->id]);
        $this->shared = Property::factory()->published()->create(['agency_id' => $this->agency->id, 'user_id' => $this->otherAgent->id]);
        PropertyCollaborator::create(['property_id' => $this->shared->id, 'user_id' => $this->agent->id, 'role' => 'agent']);
        $this->theirs = Property::factory()->published()->create(['agency_id' => $this->agency->id, 'user_id' => $this->otherAgent->id]);
    }

    private function review(Property|User $subject, ReviewStatus $status = ReviewStatus::Approved, bool $replied = false): Review
    {
        return Review::factory()->create([
            'reviewable_type' => $subject::class,
            'reviewable_id' => $subject->id,
            'status' => $status,
            'is_approved' => in_array($status, [ReviewStatus::Approved, ReviewStatus::Reported], true),
            'reply_content' => $replied ? 'Merci' : null,
            'replied_at' => $replied ? now() : null,
        ]);
    }

    /** @return list<int> */
    private function ids(User $viewer, string $query = ''): array
    {
        $this->actingAsApi($viewer);

        return collect($this->getJson('/api/reviews/received'.$query)->assertOk()->json('data'))
            ->pluck('id')->sort()->values()->all();
    }

    public function test_an_agent_sees_their_properties_and_reviews_about_them_never_another_agents(): void
    {
        $onMine = $this->review($this->mine);
        $onMineReplied = $this->review($this->mine, replied: true);
        $onShared = $this->review($this->shared);
        $aboutMe = $this->review($this->agent);
        $this->review($this->mine, ReviewStatus::Pending);      // pas publié
        $this->review($this->mine, ReviewStatus::Rejected);     // jamais
        $this->review($this->theirs);                           // un autre agent
        $this->review($this->otherAgent);                       // un autre agent

        $this->assertSame(
            collect([$onMine, $onMineReplied, $onShared, $aboutMe])->pluck('id')->sort()->values()->all(),
            $this->ids($this->agent),
        );

        // UN appel, exactement les avis sans réponse : 3 sur 4.
        $this->actingAsApi($this->agent);
        $unreplied = $this->getJson('/api/reviews/received?filter[replied]=0')->assertOk();
        $this->assertSame(3, $unreplied->json('meta.total'));
        $this->assertNotContains($onMineReplied->id, collect($unreplied->json('data'))->pluck('id')->all());

        $this->assertSame([$onMineReplied->id], $this->ids($this->agent, '?filter[replied]=1'));
        $this->assertSame([$aboutMe->id], $this->ids($this->agent, '?filter[subject_type]=agent'));
        $this->assertSame([$onShared->id], $this->ids($this->agent, "?filter[property_id]={$this->shared->id}"));
        // Le bien d'un autre agent filtré explicitement : rien, le filtre ne franchit pas le périmètre.
        $this->assertSame([], $this->ids($this->agent, "?filter[property_id]={$this->theirs->id}"));
    }

    public function test_the_agency_admin_sees_the_whole_agency_pending_included_but_never_rejected(): void
    {
        $pending = $this->review($this->theirs, ReviewStatus::Pending);
        $approved = $this->review($this->mine);
        $this->review($this->theirs, ReviewStatus::Rejected);
        $elsewhere = Property::factory()->published()->create(['agency_id' => Agency::factory()->create()->id]);
        $this->review($elsewhere);

        $this->assertSame(collect([$pending, $approved])->pluck('id')->sort()->values()->all(), $this->ids($this->admin));
        $this->assertSame([$pending->id], $this->ids($this->admin, '?filter[status]=pending'));

        $this->actingAsApi($this->admin);
        $this->getJson('/api/reviews/received?filter[status]=rejected')->assertStatus(422);
        $this->getJson('/api/reviews/received?per_page=51')->assertStatus(422);
    }

    public function test_a_stranger_sees_nothing(): void
    {
        $this->review($this->mine);
        $this->assertSame([], $this->ids(User::factory()->create()));
    }
}
