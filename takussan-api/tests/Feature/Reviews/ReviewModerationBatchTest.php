<?php

namespace Tests\Feature\Reviews;

use App\Models\Agency;
use App\Models\Enums\ReviewStatus;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;

/**
 * TCK-2672 (AC3) — publier un lot d'avis : au plus 100, la seule décision `approve`, tous
 * modérables par l'appelant, TOUT OU RIEN, une ligne de journal par avis publié.
 */
class ReviewModerationBatchTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private Property $property;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->admin = User::factory()->create();
        $this->materializeRoleProfile($this->admin, 'agency_admin', $this->agency);
        $this->property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $this->actingAsApi($this->admin);
    }

    /** @param  array<string, mixed>  $attributes */
    private function pending(?Property $on = null, array $attributes = []): Review
    {
        $on ??= $this->property;

        return Review::factory()->create($attributes + [
            'reviewable_type' => Property::class, 'reviewable_id' => $on->id,
            'status' => ReviewStatus::Pending, 'is_approved' => false, 'rating' => 5,
            'content' => 'Appartement propre et calme.', 'reported_count' => 0,
        ]);
    }

    /** @param  list<int>  $ids */
    private function batch(array $ids, string $decision = 'approve'): TestResponse
    {
        return $this->postJson('/api/reviews/moderate-batch', ['review_ids' => $ids, 'decision' => $decision]);
    }

    private function approvedCount(): int
    {
        return Review::query()->where('status', ReviewStatus::Approved->value)->where('is_approved', true)->count();
    }

    public function test_ac3_douze_avis_publies_et_douze_lignes_de_journal(): void
    {
        $ids = collect(range(1, 12))->map(fn () => $this->pending()->id)->all();

        $this->batch($ids)->assertOk()
            ->assertJsonPath('data.count', 12)
            ->assertJsonPath('data.decision', 'approve');

        $this->assertSame(12, $this->approvedCount());
        $this->assertSame(12, Review::query()->whereIn('id', $ids)->where('approved_by_id', $this->admin->id)->count());
        $logs = Activity::query()->where('event', 'review.moderated')->get();
        $this->assertCount(12, $logs);
        $this->assertEqualsCanonicalizing($ids, $logs->pluck('subject_id')->map(fn ($id) => (int) $id)->all());
        $this->assertSame((int) $this->admin->id, (int) $logs->first()->causer_id);
        $this->assertTrue($logs->first()->properties['batch']);
        // Le recompte de l'observateur a suivi : le bien porte ses 12 avis publiés.
        $this->assertSame(12, (int) $this->property->fresh()->reviews_count);
    }

    public function test_ac3_un_avis_d_une_autre_agence_et_rien_n_est_publie(): void
    {
        $ids = collect(range(1, 11))->map(fn () => $this->pending()->id)->all();
        $other = $this->pending(Property::factory()->create(['agency_id' => Agency::factory()->create()->id]));

        $this->batch([...$ids, $other->id])->assertStatus(422)->assertJsonPath('code', 'review.batch_not_moderatable');

        $this->assertSame(0, $this->approvedCount());
        $this->assertSame(0, Activity::query()->where('event', 'review.moderated')->count());
    }

    public function test_un_avis_deja_publie_ou_inconnu_refuse_le_lot(): void
    {
        $ok = $this->pending();
        $published = $this->pending(attributes: ['status' => ReviewStatus::Approved, 'is_approved' => true]);

        $this->batch([$ok->id, $published->id])->assertStatus(422)->assertJsonPath('code', 'review.batch_not_moderatable');
        $this->batch([$ok->id, 999999999])->assertStatus(422)->assertJsonPath('code', 'review.batch_not_moderatable');

        $this->assertSame(ReviewStatus::Pending, $ok->fresh()->status);
    }

    public function test_un_avis_sur_l_agence_releve_de_la_plateforme(): void
    {
        $ok = $this->pending();
        $onAgency = Review::factory()->create([
            'reviewable_type' => Agency::class, 'reviewable_id' => $this->agency->id,
            'status' => ReviewStatus::Pending, 'is_approved' => false, 'rating' => 5,
        ]);

        $this->batch([$ok->id, $onAgency->id])->assertStatus(422);
        $this->assertSame(ReviewStatus::Pending, $ok->fresh()->status);
    }

    public function test_seule_la_publication_et_au_plus_cent(): void
    {
        $ok = $this->pending();

        $this->batch([$ok->id], 'hide')->assertStatus(422)->assertJsonValidationErrors('decision');
        $this->batch(range(1, 101))->assertStatus(422)->assertJsonValidationErrors('review_ids');
        $this->batch([$ok->id, $ok->id])->assertStatus(422)->assertJsonValidationErrors('review_ids.0');
        $this->batch([])->assertStatus(422)->assertJsonValidationErrors('review_ids');
        $this->assertSame(ReviewStatus::Pending, $ok->fresh()->status);
    }

    public function test_hors_de_la_file_403(): void
    {
        $ok = $this->pending();
        $this->actingAsApi(User::factory()->create());

        $this->batch([$ok->id])->assertForbidden();
    }

    public function test_meme_la_plateforme_ne_publie_en_lot_que_des_avis_en_attente(): void
    {
        $ok = $this->pending();
        $reported = $this->pending(attributes: ['status' => ReviewStatus::Reported, 'is_approved' => true, 'reported_count' => 1]);
        $this->apiActingAsRole('super_admin');

        $this->batch([$ok->id, $reported->id])->assertStatus(422)->assertJsonPath('code', 'review.batch_not_moderatable');
        $this->assertSame(ReviewStatus::Pending, $ok->fresh()->status);
    }

    /** La même garde que la décision unitaire : la plateforme sans second facteur ne publie rien ; l'admin d'agence, si. */
    public function test_la_plateforme_sans_second_facteur_est_refusee(): void
    {
        $review = $this->pending();
        $super = User::factory()->create();
        $this->materializeRoleProfile($super, 'super_admin');
        $this->actingAsApi($super);

        $response = $this->batch([$review->id])->assertForbidden();
        $this->assertSame('two_factor_required', $response->json('code') ?? $response->json('error_code'));
        $this->assertSame(ReviewStatus::Pending, $review->fresh()->status);
    }

    public function test_le_super_admin_publie_un_lot_de_plusieurs_agences(): void
    {
        $a = $this->pending();
        $b = $this->pending(Property::factory()->create(['agency_id' => Agency::factory()->create()->id]));
        $this->apiActingAsRole('super_admin');

        $this->batch([$a->id, $b->id])->assertOk()->assertJsonPath('data.count', 2);
    }
}
