<?php

namespace Tests\Feature\Property;

use App\Jobs\Property\RevalidatePublicPropertyPage;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\PropertyContactLead;
use App\Models\User;
use App\Services\Property\PrimaryAgentDesignator;
use App\Services\Property\PrimaryPropertyContact;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as RequeteSortante;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-504 — **une agence CHOISIT l'agent principal d'un bien**, et ce choix est celui que toutes les
 * surfaces nomment.
 *
 * Le bien de référence a deux collaborateurs `agent` : `$ancien`, invité le premier — celui que la
 * règle de TCK-502 désigne —, et `$second`, créé et inséré AVANT lui (plus petit `id`, plus petit
 * `user_id`), pour qu'aucune règle « première ligne » ne puisse passer pour le choix explicite.
 */
class PrimaryAgentDesignationTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Property $property;

    private User $admin;

    private User $ancien;

    private User $second;

    private PropertyCollaborator $ligneAncien;

    private PropertyCollaborator $ligneSecond;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Http::preventStrayRequests();

        $agency = $this->agence();
        $this->admin = $this->personnel($agency, 'agency_admin');
        $this->property = $this->bienDe($agency);
        $this->second = $this->personnel($agency, attributes: ['first_name' => 'Second', 'phone' => '+221770000222']);
        $this->ancien = $this->personnel($agency, attributes: ['first_name' => 'Ancien', 'phone' => '+221770000111']);
        $this->ligneSecond = $this->collaborateur($this->property, $this->second, '2026-05-20 09:00:00');
        $this->ligneSecond->update(['commission_share' => 30]);
        $this->ligneAncien = $this->collaborateur($this->property, $this->ancien, '2026-01-10 09:00:00');
    }

    private function designer(PropertyCollaborator $ligne, ?User $acteur = null)
    {
        return $this->actingAsApi($acteur ?? $this->admin)
            ->apiPut("/api/properties/{$this->property->id}/collaborators/{$ligne->id}/primary");
    }

    /**
     * Les surfaces que `PrimaryPropertyContact` sert, chacune par sa route : la carte de la fiche,
     * le téléphone public, le lead anonyme, la résolution du fil et le message authentifié.
     */
    private function assertToutesLesSurfacesNomment(User $attendu): void
    {
        $slug = $this->property->slug;
        $this->app['auth']->forgetGuards();

        $this->getJson("/api/public/properties/{$slug}")->assertOk()
            ->assertJsonPath('data.primary_contact.id', $attendu->id);
        $this->getJson("/api/public/properties/{$slug}/contact")->assertOk()
            ->assertExactJson(['phone' => $attendu->phone]);

        PropertyContactLead::query()->delete();
        $this->postJson("/api/public/properties/{$slug}/contact-lead", [
            'name' => 'Awa Diop',
            'phone' => '+221771234567',
            'message' => 'Bonjour, ce bien est-il encore disponible ?',
        ])->assertCreated();
        $this->assertSame($attendu->id, PropertyContactLead::query()->sole()->recipient_user_id);

        $visiteur = $this->client();
        Sanctum::actingAs($visiteur);
        $this->getJson("/api/public/properties/{$slug}/conversation")->assertOk()
            ->assertJsonPath('data.recipient.id', $attendu->id);
        $conversationId = $this->postJson("/api/public/properties/{$slug}/contact-message", ['message' => 'Bonjour'])
            ->assertCreated()->json('data.conversation_id');
        $this->assertSame($attendu->id, (int) DB::table('conversation_participants')
            ->where('conversation_id', $conversationId)->where('user_id', '!=', $visiteur->id)->value('user_id'));
    }

    /** AC1 — désigner le second : la carte, le téléphone, le lead, la résolution et le message le nomment. */
    public function test_designer_le_second_agent_le_fait_nommer_par_toutes_les_surfaces(): void
    {
        $this->assertToutesLesSurfacesNomment($this->ancien);

        $this->designer($this->ligneSecond)->assertOk()
            ->assertJsonPath('primary_contact.user_id', $this->second->id)
            ->assertJsonPath('primary_contact.collaborator_id', $this->ligneSecond->id)
            ->assertJsonPath('primary_contact.source', 'designated');

        $this->assertToutesLesSurfacesNomment($this->second);
    }

    /**
     * Re-désigner déplace la marque : un seul principal, l'ancien garde sa ligne, son rôle et sa
     * part de commission (ADR-0053 §3.5).
     */
    public function test_redesigner_deplace_la_marque_et_l_ancien_principal_garde_sa_ligne(): void
    {
        $this->designer($this->ligneSecond)->assertOk();
        $this->designer($this->ligneAncien)->assertOk()->assertJsonPath('primary_contact.user_id', $this->ancien->id);

        $this->assertSame([$this->ligneAncien->id], PropertyCollaborator::query()
            ->where('property_id', $this->property->id)->where('is_primary', true)->pluck('id')->all());
        $second = $this->ligneSecond->fresh();
        $this->assertSame(CollaboratorRole::Agent, $second->role);
        $this->assertSame('30.00', $second->commission_share);
        $this->assertFalse($second->is_primary);
    }

    /** AC3 — un `viewer`, un `manager` ou un `co_owner` n'est jamais principal : refus SERVEUR. */
    public function test_designer_un_role_autre_qu_agent_est_refuse_par_le_serveur(): void
    {
        $agency = $this->property->agency;
        $lignes = [
            CollaboratorRole::Viewer->value => $this->personnel($agency),
            CollaboratorRole::Manager->value => $this->personnel($agency),
            CollaboratorRole::CoOwner->value => $this->bailleur($agency),
        ];

        foreach ($lignes as $role => $user) {
            $ligne = PropertyCollaborator::create([
                'property_id' => $this->property->id, 'user_id' => $user->id, 'role' => $role, 'invited_at' => '2025-01-01 09:00:00',
            ]);

            $this->designer($ligne)->assertStatus(422)->assertJsonPath('code', 'property.primary_requires_agent');
            $this->assertFalse($ligne->fresh()->is_primary, "Un {$role} a reçu la marque.");
        }

        $this->assertSame(0, PropertyCollaborator::query()->where('is_primary', true)->count());
    }

    /**
     * Le service juge l'éligibilité comme la règle de lecture : marquer un agent bloqué ou suspendu
     * désignerait quelqu'un que `PrimaryPropertyContact` écarte aussitôt.
     */
    public function test_un_agent_bloque_ou_suspendu_ne_peut_pas_etre_designe(): void
    {
        $this->second->update(['status' => UserStatus::Blocked]);
        $this->designer($this->ligneSecond)->assertStatus(422)->assertJsonPath('code', 'property.primary_not_eligible');

        $this->second->update(['status' => UserStatus::Active]);
        AgentProfile::query()->where('user_id', $this->second->id)->update(['status' => AgentProfileStatus::Suspended->value]);
        $this->designer($this->ligneSecond)->assertStatus(422)->assertJsonPath('code', 'property.primary_not_eligible');

        $this->assertSame(0, PropertyCollaborator::query()->where('is_primary', true)->count());
    }

    /** La ligne d'un AUTRE bien ne se désigne pas par la route de celui-ci. */
    public function test_la_ligne_d_un_autre_bien_rend_404(): void
    {
        $autre = $this->bienDe($this->property->agency);
        $ligne = $this->collaborateur($autre, $this->personnel($this->property->agency));

        $this->designer($ligne)->assertNotFound();
        $this->assertFalse($ligne->fresh()->is_primary);
    }

    /**
     * AC4 — supprimer le principal ramène le repli de TCK-502, et aucun écran ne rend de contact
     * vide : avec deux agents, l'autre ; avec le dernier, le propriétaire.
     */
    public function test_supprimer_le_principal_ramene_le_repli_sans_contact_vide(): void
    {
        $this->designer($this->ligneSecond)->assertOk();

        $this->actingAsApi($this->admin)
            ->apiDelete("/api/properties/{$this->property->id}/collaborators/{$this->ligneSecond->id}")
            ->assertNoContent();
        $this->assertToutesLesSurfacesNomment($this->ancien);
        $this->actingAsApi($this->admin)->apiGet("/api/properties/{$this->property->id}/collaborators")->assertOk()
            ->assertJsonPath('primary_contact.user_id', $this->ancien->id)
            ->assertJsonPath('primary_contact.source', 'invitation_order');

        $this->designer($this->ligneAncien)->assertOk();
        $this->actingAsApi($this->admin)
            ->apiDelete("/api/properties/{$this->property->id}/collaborators/{$this->ligneAncien->id}")
            ->assertNoContent();

        $owner = $this->property->owner;
        $this->getJson("/api/public/properties/{$this->property->slug}")->assertOk()
            ->assertJsonPath('data.primary_contact.id', $owner->id);
        $this->actingAsApi($this->admin)->apiGet("/api/properties/{$this->property->id}/collaborators")->assertOk()
            ->assertJsonPath('primary_contact.user_id', $owner->id)
            ->assertJsonPath('primary_contact.source', 'owner');
    }

    /** Le principal retiré de l'agence, bloqué, ou passé `viewer` : le repli reprend aussi. */
    public function test_le_principal_qui_n_est_plus_eligible_ou_plus_agent_laisse_la_place_au_repli(): void
    {
        $this->designer($this->ligneSecond)->assertOk();

        $this->second->update(['status' => UserStatus::Blocked]);
        $this->assertSame($this->ancien->id, $this->contact());
        $this->second->update(['status' => UserStatus::Active]);
        $this->assertSame($this->second->id, $this->contact(), 'Le choix doit revenir quand le désigné est réactivé.');

        $this->actingAsApi($this->admin)
            ->apiPut("/api/properties/{$this->property->id}/collaborators/{$this->ligneSecond->id}", ['role' => CollaboratorRole::Viewer->value])
            ->assertOk();
        $this->assertFalse($this->ligneSecond->fresh()->is_primary);
        $this->assertSame($this->ancien->id, $this->contact());
    }

    private function contact(): ?int
    {
        return PrimaryPropertyContact::for($this->property->fresh()->load(PrimaryPropertyContact::eagerLoads()))?->id;
    }

    /** Contrainte 4 — l'autorisation est celle de la gestion des collaborateurs (`update` du bien). */
    public function test_l_autorisation_est_celle_de_la_gestion_des_collaborateurs(): void
    {
        $autreAgence = $this->agence();

        $this->designer($this->ligneSecond, $this->personnel($autreAgence, 'agency_admin'))->assertForbidden();
        $this->designer($this->ligneSecond, $this->client())->assertForbidden();
        $this->app['auth']->forgetGuards();
        $this->putJson("/api/properties/{$this->property->id}/collaborators/{$this->ligneSecond->id}/primary")->assertUnauthorized();

        $this->assertSame(0, PropertyCollaborator::query()->where('is_primary', true)->count());

        // Le propriétaire tient `update` de son bien (`properties.update_own`), comme pour ajouter
        // ou retirer un collaborateur : la désignation suit, sans règle neuve.
        $this->assertSame(
            $this->property->owner->can('update', $this->property),
            $this->designer($this->ligneSecond, $this->property->owner)->isOk(),
        );
    }

    /** 598 — la désignation invalide le cache public de la fiche, une fois ; rien si rien ne change. */
    public function test_la_designation_invalide_le_cache_public_de_la_fiche(): void
    {
        Queue::fake();

        $this->designer($this->ligneSecond)->assertOk();
        Queue::assertPushed(RevalidatePublicPropertyPage::class, 1);
        Queue::assertPushed(RevalidatePublicPropertyPage::class, fn ($job) => $job->slugs === [$this->property->slug]);

        $this->designer($this->ligneSecond)->assertOk();
        Queue::assertPushed(RevalidatePublicPropertyPage::class, 1);
    }

    /**
     * 598 — de bout en bout : avec les clés posées, la désignation part au front en appel signé,
     * pour CE slug. Sans elle, la fiche nommerait l'ancien agent jusqu'à 300 s.
     */
    public function test_la_designation_atteint_le_front_par_l_appel_signe(): void
    {
        config([
            'services.public_cache.revalidate_url' => 'https://front.test/api/revalidation/fiche',
            'services.public_cache.revalidate_secret' => 'secret-de-test',
        ]);
        Http::fake(['https://front.test/*' => Http::response(['ok' => true])]);

        $this->designer($this->ligneSecond)->assertOk();

        Http::assertSent(fn (RequeteSortante $r) => $r->url() === 'https://front.test/api/revalidation/fiche'
            && $r->data() === ['slugs' => [$this->property->slug]]
            && str_starts_with($r->header('X-Takussan-Signature')[0] ?? '', 't='));
    }

    /** Retirer ou ajouter une collaboration change le repli : la fiche est invalidée aussi. */
    public function test_retirer_ou_ajouter_un_collaborateur_invalide_aussi_la_fiche(): void
    {
        Queue::fake();

        $this->actingAsApi($this->admin)
            ->apiDelete("/api/properties/{$this->property->id}/collaborators/{$this->ligneAncien->id}")
            ->assertNoContent();
        Queue::assertPushed(RevalidatePublicPropertyPage::class, fn ($job) => $job->slugs === [$this->property->slug]);

        Queue::fake();
        $this->actingAsApi($this->admin)->apiPost("/api/properties/{$this->property->id}/collaborators", [
            'user_id' => $this->personnel($this->property->agency)->id,
            'role' => CollaboratorRole::Agent->value,
        ])->assertCreated();
        Queue::assertPushed(RevalidatePublicPropertyPage::class, fn ($job) => $job->slugs === [$this->property->slug]);

        // La part de commission n'est pas servie par la fiche : rien à invalider.
        Queue::fake();
        $this->ligneSecond->update(['commission_share' => 12]);
        Queue::assertNotPushed(RevalidatePublicPropertyPage::class);
    }

    /** 601 — la désignation est journalisée sur le bien, avec l'ancien et le nouveau principal. */
    public function test_la_designation_est_journalisee_avec_l_ancien_et_le_nouveau_principal(): void
    {
        $this->designer($this->ligneSecond)->assertOk();
        $this->designer($this->ligneSecond)->assertOk();

        $entrees = Activity::query()->where('event', PrimaryAgentDesignator::EVENT)->get();
        $this->assertCount(1, $entrees, 'Une désignation sans effet ne s\'écrit pas.');
        $entree = $entrees->sole();
        $this->assertSame('Property', $entree->log_name);
        $this->assertSame($this->property->id, (int) $entree->subject_id);
        $this->assertSame($this->admin->id, (int) $entree->causer_id);
        $this->assertSame($this->property->agency_id, $entree->properties['agency_id']);
        $this->assertSame($this->ancien->id, $entree->properties['previous_contact_user_id']);
        $this->assertNull($entree->properties['previous_collaborator_id']);
        $this->assertSame($this->second->id, $entree->properties['user_id']);
        $this->assertSame($this->ligneSecond->id, $entree->properties['collaborator_id']);
    }

    /**
     * Le verrou porte sur la ligne PARENT, jamais sur les collaborateurs ni sur un agrégat (pièges
     * PostgreSQL n° 1 et n° 2). La course réelle à deux processus est rejouée hors PHPUnit (AC2).
     */
    public function test_le_verrou_porte_sur_la_ligne_du_bien_et_sur_elle_seule(): void
    {
        $verrous = [];
        DB::listen(function ($query) use (&$verrous): void {
            if (str_contains(strtolower($query->sql), 'for update')) {
                $verrous[] = $query->sql;
            }
        });

        app(PrimaryAgentDesignator::class)->designate($this->property, $this->ligneSecond, $this->admin);

        $this->assertCount(1, $verrous, implode("\n", $verrous));
        $this->assertMatchesRegularExpression('/from "properties" where "properties"\."id" = \?.*for update/i', $verrous[0]);
        $this->assertDoesNotMatchRegularExpression('/count\(|sum\(|property_collaborators/i', $verrous[0]);
    }

    /** `GET …/collaborators` dit qui répond, et pourquoi : l'ordre d'invitation tant qu'aucun choix. */
    public function test_la_liste_dit_qui_repond_et_pourquoi(): void
    {
        $this->actingAsApi($this->admin)->apiGet("/api/properties/{$this->property->id}/collaborators")->assertOk()
            ->assertJsonPath('primary_contact.user_id', $this->ancien->id)
            ->assertJsonPath('primary_contact.collaborator_id', $this->ligneAncien->id)
            ->assertJsonPath('primary_contact.source', 'invitation_order')
            ->assertJsonPath('data.0.id', $this->ligneSecond->id)
            ->assertJsonPath('data.0.is_primary', false);
    }

    /**
     * Vérification adverse m2 — la liste dit si l'appelant peut désigner, par la règle même de
     * l'endpoint : un agent de l'agence lit la liste, mais ne tient pas `update` d'un bien qu'il n'a
     * pas créé ; il ne doit pas voir un geste que le serveur lui refuse.
     */
    public function test_la_liste_dit_si_l_appelant_peut_designer_par_la_regle_de_l_endpoint(): void
    {
        $this->actingAsApi($this->admin)->apiGet("/api/properties/{$this->property->id}/collaborators")
            ->assertOk()->assertJsonPath('can_designate', true);

        $this->assertFalse($this->ancien->can('update', $this->property));
        $this->actingAsApi($this->ancien)->apiGet("/api/properties/{$this->property->id}/collaborators")
            ->assertOk()->assertJsonPath('can_designate', false);
        $this->designer($this->ligneAncien, $this->ancien)->assertForbidden();

        $this->designer($this->ligneSecond)->assertOk()->assertJsonPath('can_designate', true);
    }
}
