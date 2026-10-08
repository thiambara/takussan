<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\VisitStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-590, passe 5 (X1′) — le personnel se juge à l'agence du PROFIL ACTIF (ADR-0031 §1), pour
 * les visites comme pour la boîte des demandes.
 *
 * Le correctif de X1 jugeait par `estPersonnel` sur TOUTES les agences du compte : un agent de X,
 * sous son profil actif Y, lisait les visites de X et leur fiche client, que le CRM lui cache
 * dans le même contexte. Le prédicat du lecteur est désormais unique :
 * `PersonnelDeLAgence::personnelActifDe` — compte joignable, et agence du profil actif.
 */
class PersonnelAuProfilActifTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $x;

    private User $u;

    private int $profilX;

    private int $profilY;

    private PropertyVisit $visite;

    private PropertyContactLead $demande;

    protected function setUp(): void
    {
        parent::setUp();

        $this->x = $this->agence();
        $y = $this->agence();
        $this->personnel($this->x, 'agency_admin');
        $autre = $this->personnel($this->x);

        // U est agent ACTIF de X et de Y.
        $this->u = $this->personnel($this->x);
        $this->profilX = (int) AgentProfile::query()->where('user_id', $this->u->id)->where('agency_id', $this->x->id)->value('id');
        $this->profilY = AgentProfile::factory()->create(['user_id' => $this->u->id, 'agency_id' => $y->id])->id;

        // Un AUTRE agent de X planifie, pour une fiche de X, une visite d'un bien de X.
        $bien = $this->bienDe($this->x);
        $fiche = $this->ficheClient($this->x, null, [
            'first_name' => 'Fiche', 'last_name' => 'Secrete', 'phone' => '+221775551503', 'email' => 'secrete@example.com',
        ]);
        Sanctum::actingAs($autre);
        $id = $this->postJson('/api/property-visits', [
            'property_id' => $bien->id, 'customer_id' => $fiche->id, 'scheduled_at' => $this->creneau(jours: 3),
        ])->assertCreated()->json('data.id');
        $this->visite = PropertyVisit::query()->findOrFail($id);

        // Une demande de contact de X, adressée à U.
        $this->demande = PropertyContactLead::query()->create([
            'property_id' => $bien->id, 'agency_id' => $this->x->id, 'recipient_user_id' => $this->u->id,
            'name' => 'Awa Diop', 'phone' => '+221771234599', 'message' => 'Toujours disponible ?',
        ]);
    }

    private function sous(int $profil): array
    {
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($this->u->fresh());

        return ['X-Profile-Id' => "agent:{$profil}"];
    }

    public function test_sous_le_profil_actif_y_ni_la_visite_ni_la_demande_de_x(): void
    {
        $entetes = $this->sous($this->profilY);

        $this->getJson("/api/property-visits/{$this->visite->id}", $entetes)->assertForbidden();
        $liste = $this->getJson('/api/property-visits?per_page=100&include=customer', $entetes)->assertOk();
        $this->assertNotContains($this->visite->id, collect($liste->json('data'))->pluck('id')->all());
        $this->assertStringNotContainsString('Secrete', $liste->getContent());
        $this->patchJson("/api/property-visits/{$this->visite->id}", ['notes' => 'x'], $entetes)->assertForbidden();

        $boite = $this->getJson('/api/contact-leads', $entetes)->assertOk();
        $this->assertNotContains($this->demande->id, collect($boite->json('data'))->pluck('id')->all());
        $this->getJson("/api/contact-leads/{$this->demande->id}", $entetes)->assertForbidden();
    }

    public function test_sous_le_profil_actif_x_la_visite_sa_fiche_et_la_demande(): void
    {
        $entetes = $this->sous($this->profilX);

        $this->getJson("/api/property-visits/{$this->visite->id}?include=customer", $entetes)->assertOk()
            ->assertJsonPath('data.customer_id', $this->visite->customer_id)
            ->assertJsonPath('data.visitor_name', 'Fiche Secrete');
        $liste = $this->getJson('/api/property-visits?per_page=100', $entetes)->assertOk();
        $this->assertContains($this->visite->id, collect($liste->json('data'))->pluck('id')->all());

        $boite = $this->getJson('/api/contact-leads', $entetes)->assertOk();
        $this->assertContains($this->demande->id, collect($boite->json('data'))->pluck('id')->all());
        $this->getJson("/api/contact-leads/{$this->demande->id}", $entetes)->assertOk();
    }

    /**
     * La planification par le personnel suit la même règle : sous Y, U n'est pas personnel du bien
     * de X — il réserve POUR LUI-MÊME, comme tout visiteur (la fiche envoyée est ignorée, la
     * visite attend le geste de l'agence), et ne lit pas la fiche de X dans la réponse.
     */
    public function test_sous_le_profil_actif_y_pas_de_planification_pour_un_bien_de_x(): void
    {
        $entetes = $this->sous($this->profilY);

        $reponse = $this->postJson('/api/property-visits', [
            'property_id' => $this->visite->property_id,
            'customer_id' => $this->visite->customer_id,
            'scheduled_at' => $this->creneau(jours: 4),
        ], $entetes)->assertCreated()
            ->assertJsonPath('data.visitor_id', $this->u->id)
            ->assertJsonPath('data.customer_id', null)
            ->assertJsonPath('data.status', VisitStatus::Scheduled->value);
        $this->assertStringNotContainsString('Secrete', $reponse->getContent());
        $this->assertSame(1, PropertyVisit::query()->where('customer_id', $this->visite->customer_id)->count());
    }
}
