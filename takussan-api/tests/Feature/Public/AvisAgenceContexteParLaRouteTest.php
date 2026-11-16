<?php

namespace Tests\Feature\Public;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * TCK-2577 — un avis d'AGENCE écrit son contexte d'éligibilité (ADR-0043 § 3), comme un avis d'agent
 * (`ReviewContextKindParLaRouteTest`). Tout passe par les routes : dépôt `POST /api/agencies/{id}/reviews`,
 * approbation par la plateforme (un avis d'agence relève d'elle seule, ADR-0043 § 1), lecture sur
 * `GET /api/public/agencies/{slug}`. Aucun avis fabriqué par la factory pour AC1-AC3.
 */
class AvisAgenceContexteParLaRouteTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agence;

    private User $client;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agence = Agency::factory()->create(['status' => AgencyStatus::Active]);
        $this->client = User::factory()->create(['first_name' => 'Moussa', 'last_name' => 'Sarr']);
    }

    private function bailDuClient(): Lease
    {
        return Lease::factory()->create([
            'property_id' => Property::factory()->published()->create(['agency_id' => $this->agence->id])->id,
            'agency_id' => $this->agence->id,
            'tenant_id' => Customer::factory()->create(['user_id' => $this->client->id])->id,
            'status' => LeaseStatus::Active,
        ]);
    }

    private function deposeParLaRoute(User $auteur): Review
    {
        $this->actingAsApi($auteur);
        $this->postJson("/api/agencies/{$this->agence->id}/reviews", [
            'rating' => 5,
            'title' => 'Très bien',
            'content' => 'Agence sérieuse.',
        ])->assertCreated();

        return Review::query()->latest('id')->firstOrFail();
    }

    /** Approuve par la route (plateforme) et rend l'avis tel que la fiche publique d'agence le sert. */
    private function publieParLaRoute(Review $avis): array
    {
        $plateforme = User::factory()->withTwoFactor()->create();
        $this->materializeRoleProfile($plateforme, 'super_admin');
        $this->actingAsApi($plateforme);
        $this->postJson("/api/reviews/{$avis->id}/approve")->assertOk();

        $this->app['auth']->forgetGuards();
        $public = $this->getJson("/api/public/agencies/{$this->agence->slug}")->assertOk();
        $this->assertSame($avis->id, $public->json('data.reviews.recent.0.id'));
        $this->assertStringNotContainsString('"context_id"', $public->getContent());
        $this->assertStringNotContainsString('"context_type"', $public->getContent());

        return $public->json('data.reviews.recent.0');
    }

    public function test_ac1_un_avis_d_agence_depose_par_la_route_ecrit_le_bail_trouve_comme_contexte(): void
    {
        $bail = $this->bailDuClient();

        $avis = $this->deposeParLaRoute($this->client);

        $this->assertSame($bail->getMorphClass(), $avis->context_type);
        $this->assertSame($bail->id, $avis->context_id);
    }

    public function test_ac2_la_fiche_publique_d_agence_sert_le_contexte_bail_de_l_avis_approuve(): void
    {
        $this->bailDuClient();

        $this->assertSame('lease', $this->publieParLaRoute($this->deposeParLaRoute($this->client))['context_kind']);
    }

    /**
     * Décision TCK-2577 : le super-admin, que `authorize()` laisse passer sans bail, dépose toujours ;
     * sans preuve, l'avis reste sans contexte et la fiche n'affiche rien — comme un avis antérieur (AC4).
     */
    public function test_un_super_admin_sans_bail_depose_un_avis_sans_contexte(): void
    {
        $super = User::factory()->withTwoFactor()->create();
        $this->materializeRoleProfile($super, 'super_admin');

        $avis = $this->deposeParLaRoute($super);

        $this->assertNull($avis->context_type);
        $this->assertNull($avis->context_id);
        $this->assertNull($this->publieParLaRoute($avis)['context_kind']);
    }

    public function test_ac4_un_avis_d_agence_anterieur_sans_contexte_reste_sans_contexte_et_n_affiche_rien(): void
    {
        $this->bailDuClient();
        $ancien = Review::factory()->for($this->agence, 'reviewable')->create([
            'author_id' => $this->client->id,
            'context_type' => null,
            'context_id' => null,
            'is_approved' => true,
            'status' => 'approved',
        ]);

        $this->app['auth']->forgetGuards();
        $public = $this->getJson("/api/public/agencies/{$this->agence->slug}")->assertOk();

        $this->assertSame($ancien->id, $public->json('data.reviews.recent.0.id'));
        $this->assertNull($public->json('data.reviews.recent.0.context_kind'));
        $ancien->refresh();
        $this->assertNull($ancien->context_type);
        $this->assertNull($ancien->context_id);
    }
}
