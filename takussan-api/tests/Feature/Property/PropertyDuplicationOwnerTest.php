<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-997 (P50.03 ; ADR-0036, amendement du 2026-10-19) — la copie d'un bien est une création : elle
 * prend le titulaire de la source quand c'est un bailleur de l'agence de la source, et le bailleur en
 * est prévenu comme à la saisie. Une source tenue par le personnel garde le comportement de
 * TCK-074 : la copie est à celui qui duplique.
 */
class PropertyDuplicationOwnerTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->agency = Agency::factory()->create(['moderation_required' => false]);
        $this->admin = $this->agencyAdmin($this->agency);
    }

    public function test_ac6_la_copie_du_bien_de_b_est_a_b(): void
    {
        $b = User::factory()->withOwnerProfile($this->agency)->create();
        $source = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $b->id]);

        $copie = $this->actingAsApi($this->admin)
            ->postJson("/api/properties/{$source->id}/duplicate")
            ->assertCreated()
            ->json('data.id');

        $this->assertSame($b->id, (int) Property::query()->findOrFail($copie)->user_id);
        $this->assertSame(1, AppNotification::query()->where('user_id', $b->id)->where('code', 'property.assigned_to_owner')->count());
        $ligne = Activity::query()->where('log_name', 'Property')->where('event', 'owner_designated')->sole();
        $this->assertSame($copie, (int) $ligne->subject_id);
        $this->assertSame($this->admin->id, (int) $ligne->causer_id);
    }

    public function test_ac6_la_copie_d_un_bien_tenu_par_le_personnel_est_a_celui_qui_duplique(): void
    {
        $agent = $this->agencyAgent($this->agency);
        $source = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $agent->id]);

        $copie = $this->actingAsApi($this->admin)
            ->postJson("/api/properties/{$source->id}/duplicate")
            ->assertCreated()
            ->json('data.id');

        $this->assertSame($this->admin->id, (int) Property::query()->findOrFail($copie)->user_id);
        $this->assertSame(0, AppNotification::query()->where('code', 'property.assigned_to_owner')->count());
        $this->assertSame(0, Activity::query()->where('event', 'owner_designated')->count());
    }

    public function test_le_bailleur_qui_duplique_son_bien_n_est_pas_prevenu_de_son_propre_geste(): void
    {
        $b = User::factory()->withOwnerProfile($this->agency)->create();
        $source = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $b->id]);

        $copie = $this->actingAsApi($b)
            ->postJson("/api/properties/{$source->id}/duplicate")
            ->assertCreated()
            ->json('data.id');

        $this->assertSame($b->id, (int) Property::query()->findOrFail($copie)->user_id);
        $this->assertSame(0, AppNotification::query()->where('code', 'property.assigned_to_owner')->count());
    }
}
