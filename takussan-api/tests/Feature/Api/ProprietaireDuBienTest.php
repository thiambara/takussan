<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Notifications\NewContactLeadNotification;
use App\Notifications\VisitRequestedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-590, vérification adverse passe 2 (M7) — `property.user_id` est le CRÉATEUR du bien, pas
 * forcément son propriétaire. Sur un bien d'agence, il ne vaut propriétaire que s'il y détient un
 * profil propriétaire ACTIF. L'agent qui a créé le bien puis quitté l'agence n'est ni contact
 * principal, ni lecteur des demandes, ni porte-parole de l'agence auprès du visiteur.
 */
class ProprietaireDuBienTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $x;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->x = $this->agence();
        $this->admin = $this->personnel($this->x, 'agency_admin');
    }

    /** Un agent de X, créateur d'un bien de X, puis retiré de l'agence. */
    private function agentParti(array $attributes = []): array
    {
        $a = $this->personnel($this->x, attributes: $attributes);
        $bien = $this->bienDe($this->x, $a);
        AgentProfile::query()->where('user_id', $a->id)->get()->each->delete();

        return [$a->fresh(), $bien];
    }

    /** N3 — le repli du contact principal ne le désigne plus : ni numéro public, ni demande reçue. */
    public function test_n3_l_agent_parti_createur_n_est_plus_contact_principal(): void
    {
        [$a, $bien] = $this->agentParti(['phone' => '+221770001111']);

        $this->postJson("/api/public/properties/{$bien->slug}/contact-lead", [
            'name' => 'Awa', 'phone' => '+221771234567', 'message' => 'Bonjour, disponible ?',
        ])->assertCreated();
        $lead = PropertyContactLead::query()->latest('id')->firstOrFail();

        $this->assertNotSame($a->id, $lead->recipient_user_id);
        Notification::assertNotSentTo($a, NewContactLeadNotification::class);
        Notification::assertSentTo($this->admin, NewContactLeadNotification::class);
        $this->assertNotSame('+221770001111', $this->getJson("/api/public/properties/{$bien->slug}/contact")->json('phone'));

        $this->postJson("/api/public/properties/{$bien->slug}/visit-request", [
            'visitor_name' => 'Awa', 'visitor_phone' => '+221771234567', 'scheduled_at' => $this->creneau(),
        ])->assertCreated();
        Notification::assertNotSentTo($a, VisitRequestedNotification::class);
        Notification::assertSentTo($this->admin, VisitRequestedNotification::class);

        Sanctum::actingAs($a);
        $this->assertNotContains($lead->id, collect($this->getJson('/api/contact-leads')->json('data'))->pluck('id')->all());
    }

    /** S3-créateur — sur une demande qui lui est adressée, l'agent parti ne lit ni ne convertit plus. */
    public function test_s3_l_agent_parti_createur_ne_lit_ni_ne_convertit(): void
    {
        [$a, $bien] = $this->agentParti();
        $lead = PropertyContactLead::factory()->create([
            'property_id' => $bien->id, 'agency_id' => $this->x->id, 'recipient_user_id' => $a->id,
        ]);

        Sanctum::actingAs($a);
        $this->assertNotContains($lead->id, collect($this->getJson('/api/contact-leads')->json('data'))->pluck('id')->all());
        $this->getJson("/api/contact-leads/{$lead->id}")->assertForbidden();
        $this->postJson("/api/contact-leads/{$lead->id}/convert")->assertForbidden();
        $this->assertDatabaseMissing('customers', ['agency_id' => $this->x->id, 'phone' => $lead->phone]);
    }

    /** N4 — il ne prévient plus le visiteur « au nom de l'agence », ni ne voit la visite dans sa liste. */
    public function test_n4_l_agent_parti_createur_ne_previent_pas_le_visiteur(): void
    {
        [$a, $bien] = $this->agentParti();
        $visite = fn (int $jours) => PropertyVisit::factory()->create([
            'property_id' => $bien->id, 'visitor_id' => null, 'visitor_phone' => '+221771010103',
            'visitor_email' => null, 'visitor_name' => 'Awa', 'status' => VisitStatus::Confirmed,
            'scheduled_at' => $this->creneau(jours: $jours),
        ]);
        $annulee = $visite(3);
        $deplacee = $visite(4);

        Sanctum::actingAs($a);
        $this->assertSame([], $this->getJson('/api/property-visits')->json('data'));
        // Passe 2, écart (b) — sur un bien d'agence, le geste lui-même est refusé.
        $this->postJson("/api/property-visits/{$annulee->id}/cancel", ['reason' => 'x'])->assertForbidden();
        $this->patchJson("/api/property-visits/{$deplacee->id}", ['scheduled_at' => $this->creneau(jours: 5)])->assertForbidden();

        Notification::assertNothingSentTo(new AnonymousNotifiable);
    }

    /** Le bailleur ACTIF de l'agence reste propriétaire : contact principal à défaut d'agent, il lit sa demande. */
    public function test_le_bailleur_actif_reste_proprietaire(): void
    {
        $b = $this->bailleur($this->x, ['phone' => '+221770002222']);
        $bien = $this->bienDe($this->x, $b);

        $this->assertSame('+221770002222', $this->getJson("/api/public/properties/{$bien->slug}/contact")->json('phone'));
        $this->postJson("/api/public/properties/{$bien->slug}/contact-lead", [
            'name' => 'Awa', 'phone' => '+221771234567', 'message' => 'Bonjour, disponible ?',
        ])->assertCreated();
        $lead = PropertyContactLead::query()->latest('id')->firstOrFail();
        $this->assertSame($b->id, $lead->recipient_user_id);

        Sanctum::actingAs($b);
        $this->getJson("/api/contact-leads/{$lead->id}")->assertOk();
        $this->assertContains($lead->id, collect($this->getJson('/api/contact-leads')->json('data'))->pluck('id')->all());
    }

    /** Un bailleur dont le profil n'est plus actif perd la même chose que l'agent parti. */
    public function test_le_bailleur_inactif_n_est_plus_proprietaire(): void
    {
        $b = $this->bailleur($this->x, ['phone' => '+221770003333']);
        $bien = $this->bienDe($this->x, $b);
        $lead = PropertyContactLead::factory()->create([
            'property_id' => $bien->id, 'agency_id' => $this->x->id, 'recipient_user_id' => $b->id,
        ]);
        OwnerProfile::query()->where('user_id', $b->id)->update(['status' => OwnerProfileStatus::Inactive->value]);

        $this->assertNotSame('+221770003333', $this->getJson("/api/public/properties/{$bien->slug}/contact")->json('phone'));
        Sanctum::actingAs($b->fresh());
        $this->getJson("/api/contact-leads/{$lead->id}")->assertForbidden();
        $this->assertNotContains($lead->id, collect($this->getJson('/api/contact-leads')->json('data'))->pluck('id')->all());
    }

    /** Un bien SANS agence : le particulier qui l'a créé en est le propriétaire, sans profil. */
    public function test_le_particulier_reste_proprietaire_d_un_bien_sans_agence(): void
    {
        $p = $this->client(['phone' => '+221770004444']);
        $bien = $this->bienDe(null, $p);

        $this->assertSame('+221770004444', $this->getJson("/api/public/properties/{$bien->slug}/contact")->json('phone'));
    }

    /** Une visite planifiée par le personnel pour une fiche du CRM de X, sur ce bien. */
    private function visitePourUneFiche($bien, array $attributes = []): PropertyVisit
    {
        $fiche = $this->ficheClient($this->x, attributes: [
            'first_name' => 'Fatou', 'last_name' => 'Sarr', 'phone' => '+221776665544', 'email' => 'fatou@exemple.sn',
        ]);

        return PropertyVisit::factory()->create($attributes + [
            'property_id' => $bien->id, 'customer_id' => $fiche->id, 'visitor_id' => null,
            'agent_id' => $this->admin->id, 'visitor_name' => 'Fatou Sarr', 'visitor_phone' => '+221776665544',
            'status' => VisitStatus::Confirmed, 'scheduled_at' => $this->creneau(jours: 3),
        ]);
    }

    /** Passe 3 (M7′) — l'agent parti créateur du bien ne lit plus la visite, ni ne la clôt. */
    public function test_m7prime_l_agent_parti_createur_ne_lit_ni_ne_clot_la_visite(): void
    {
        [$a, $bien] = $this->agentParti();
        $visite = $this->visitePourUneFiche($bien);

        Sanctum::actingAs($a);
        $this->getJson("/api/property-visits/{$visite->id}")->assertForbidden();
        $this->postJson("/api/property-visits/{$visite->id}/complete")->assertForbidden();
        $this->assertSame([], $this->getJson('/api/property-visits?include=customer')->json('data'));
        $this->assertSame(VisitStatus::Confirmed, $visite->fresh()->status);
    }

    /** Passe 3 (M7′) — l'agent assigné puis retiré de l'agence perd la lecture, au détail et à l'index. */
    public function test_m7prime_l_agent_assigne_parti_ne_lit_plus_la_visite(): void
    {
        $g = $this->personnel($this->x);
        $visite = $this->visitePourUneFiche($this->bienDe($this->x), ['agent_id' => $g->id]);
        AgentProfile::query()->where('user_id', $g->id)->get()->each->delete();

        Sanctum::actingAs($g->fresh());
        $this->getJson("/api/property-visits/{$visite->id}")->assertForbidden();
        $this->assertSame([], $this->getJson('/api/property-visits?include=customer')->json('data'));
    }

    /**
     * Passe 3 (M7′) — le bailleur actif lit la visite de son bien, au détail ET à l'index, sans la
     * fiche client : ni `customer`, ni `customer_id`, ni le nom ou le téléphone de la fiche.
     */
    public function test_m7prime_le_bailleur_actif_lit_la_visite_sans_la_fiche_client(): void
    {
        $b = $this->bailleur($this->x);
        $visite = $this->visitePourUneFiche($this->bienDe($this->x, $b));

        Sanctum::actingAs($b);
        $detail = $this->getJson("/api/property-visits/{$visite->id}")->assertOk();
        $detail->assertJsonPath('data.customer_id', null)->assertJsonPath('data.customer', null);
        $liste = $this->getJson('/api/property-visits?include=customer')->assertOk();
        $this->assertSame([$visite->id], collect($liste->json('data'))->pluck('id')->all());
        $liste->assertJsonPath('data.0.customer_id', null)->assertJsonPath('data.0.customer', null);

        foreach ([$detail, $liste] as $reponse) {
            $this->assertStringNotContainsString('fatou@exemple.sn', $reponse->getContent());
            $this->assertStringNotContainsString('"Sarr"', $reponse->getContent());
        }
    }

    /** Passe 3 (M7′) — le personnel de l'agence garde la fiche, au détail et à l'index. */
    public function test_m7prime_le_personnel_lit_la_fiche_client(): void
    {
        $visite = $this->visitePourUneFiche($this->bienDe($this->x));

        Sanctum::actingAs($this->personnel($this->x));
        $this->getJson("/api/property-visits/{$visite->id}")->assertOk()
            ->assertJsonPath('data.customer_id', $visite->customer_id)
            ->assertJsonPath('data.customer.phone', '+221776665544');
        $this->getJson('/api/property-visits?include=customer')->assertOk()
            ->assertJsonPath('data.0.customer_id', $visite->customer_id)
            ->assertJsonPath('data.0.customer.email', 'fatou@exemple.sn');
    }
}
