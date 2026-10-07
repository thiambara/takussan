<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\Capability;
use App\Models\Enums\ContactLeadChannel;
use App\Models\Profiles\AgentProfile;
use App\Models\PropertyContactLead;
use App\Models\User;
use App\Notifications\NewContactLeadNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-590 — la boîte « Demandes » : qui lit quoi (AC13), ce qu'on y lit (AC14), et les gestes.
 *
 * Les pistes étaient enregistrées et illisibles : aucune route ne les relisait.
 */
class ContactLeadInboxTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $x;

    private User $destinataire;

    private PropertyContactLead $sienne;

    private PropertyContactLead $autre;

    protected function setUp(): void
    {
        parent::setUp();

        $this->x = $this->agence();
        $this->destinataire = $this->personnel($this->x);
        $collegue = $this->personnel($this->x);

        $bien = $this->bienDe($this->x);
        $this->sienne = PropertyContactLead::factory()->create([
            'property_id' => $bien->id, 'agency_id' => $this->x->id, 'recipient_user_id' => $this->destinataire->id,
        ]);
        $this->autre = PropertyContactLead::factory()->create([
            'property_id' => $bien->id, 'agency_id' => $this->x->id, 'recipient_user_id' => $collegue->id,
        ]);
    }

    /** @return list<int> */
    private function idsVusPar(User $user): array
    {
        Sanctum::actingAs($user);

        return collect($this->getJson('/api/contact-leads')->assertOk()->json('data'))->pluck('id')->sort()->values()->all();
    }

    private function agentSansVueGlobale(): User
    {
        $role = AgencyRole::factory()->for($this->x)->withCapabilities([Capability::PropertiesCreate])->create();

        return $this->personnel($this->x, agencyRole: $role);
    }

    /** AC13 (R) — chacun ne lit que ce que la policy lui ouvre. */
    public function test_chacun_ne_lit_que_ce_que_la_policy_lui_ouvre(): void
    {
        $tous = collect([$this->sienne->id, $this->autre->id])->sort()->values()->all();

        // L'agent de X détient `crm.view_all` par son rôle système : toute la boîte de X.
        $this->assertSame($tous, $this->idsVusPar($this->destinataire));

        // Sans `crm.view_all`, un agent ne lit que les siennes — ici aucune.
        $this->assertSame([], $this->idsVusPar($this->agentSansVueGlobale()));
        $restreint = $this->agentSansVueGlobale();
        $this->sienne->update(['recipient_user_id' => $restreint->id]);
        $this->assertSame([$this->sienne->id], $this->idsVusPar($restreint));

        // Agent d'une autre agence, bailleur et client de X : rien.
        $this->assertSame([], $this->idsVusPar($this->personnel($this->agence())));
        $this->assertSame([], $this->idsVusPar($this->bailleur($this->x)));
        $this->assertSame([], $this->idsVusPar($this->client()));
    }

    /** AC13 — `show` suit la même règle que la liste. */
    public function test_show_suit_la_meme_regle(): void
    {
        Sanctum::actingAs($this->personnel($this->agence()));
        $this->getJson("/api/contact-leads/{$this->sienne->id}")->assertForbidden();

        Sanctum::actingAs($this->bailleur($this->x));
        $this->getJson("/api/contact-leads/{$this->sienne->id}")->assertForbidden();

        Sanctum::actingAs($this->destinataire);
        $this->getJson("/api/contact-leads/{$this->sienne->id}")->assertOk();
    }

    /** AC14 — un message de 2 000 caractères est rendu entier, avec le téléphone ; jamais `ip` ni `user_agent`. */
    public function test_la_demande_se_lit_en_entier_sans_ip_ni_user_agent(): void
    {
        $message = str_repeat('Bonjour, ce bien est-il encore disponible ? ', 50);
        $message = mb_substr($message, 0, 2000);
        $this->sienne->update(['message' => $message, 'phone' => '+221771234567', 'ip' => '203.0.113.9', 'user_agent' => 'Robot/1.0']);

        Sanctum::actingAs($this->destinataire);

        $show = $this->getJson("/api/contact-leads/{$this->sienne->id}")->assertOk();
        $this->assertSame($message, $show->json('data.message'));
        $this->assertSame(2000, mb_strlen($show->json('data.message')));
        $this->assertSame('+221771234567', $show->json('data.phone'));

        $list = $this->getJson('/api/contact-leads?include=property,recipient')->assertOk();
        foreach ([$show->getContent(), $list->getContent()] as $corps) {
            $this->assertStringNotContainsString('203.0.113.9', $corps);
            $this->assertStringNotContainsString('Robot/1.0', $corps);
            $this->assertStringNotContainsString('"ip"', $corps);
            $this->assertStringNotContainsString('user_agent', $corps);
        }

        $this->getJson('/api/contact-leads?fields[property_contact_leads]=id,ip')->assertStatus(400);
    }

    /** AC20 — un clic n'est pas une demande à traiter : il n'entre ni dans la liste ni dans le compte. */
    public function test_les_clics_restent_hors_de_la_file(): void
    {
        PropertyContactLead::factory()->click(ContactLeadChannel::Whatsapp)->create([
            'property_id' => $this->sienne->property_id, 'agency_id' => $this->x->id, 'recipient_user_id' => $this->destinataire->id,
        ]);

        Sanctum::actingAs($this->destinataire);

        $this->getJson('/api/contact-leads?filter[handled]=0&per_page=1')
            ->assertOk()
            ->assertJsonPath('meta.total', 2);
        $this->getJson('/api/contact-leads?filter[channel]=whatsapp')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    public function test_marquer_traitee_sort_la_demande_des_non_traitees(): void
    {
        Sanctum::actingAs($this->destinataire);

        $this->postJson("/api/contact-leads/{$this->sienne->id}/handle")
            ->assertOk()
            ->assertJsonPath('data.handled_by_id', $this->destinataire->id);

        $this->getJson('/api/contact-leads?filter[handled]=0')->assertOk()->assertJsonPath('meta.total', 1);
        $this->getJson('/api/contact-leads?filter[handled]=1')->assertOk()->assertJsonPath('meta.total', 1);

        Sanctum::actingAs($this->personnel($this->agence()));
        $this->postJson("/api/contact-leads/{$this->autre->id}/handle")->assertForbidden();
    }

    public function test_filtre_mine(): void
    {
        Sanctum::actingAs($this->destinataire);

        $this->getJson('/api/contact-leads?filter[mine]=1')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $this->sienne->id);
    }

    /** `assign` exige `crm.assign`, et vise le personnel de l'agence de la demande. */
    public function test_attribuer_exige_crm_assign_et_vise_le_personnel(): void
    {
        Notification::fake();
        $cible = $this->personnel($this->x);

        Sanctum::actingAs($this->agentSansVueGlobale());
        $this->postJson("/api/contact-leads/{$this->sienne->id}/assign", ['user_id' => $cible->id])->assertForbidden();

        Sanctum::actingAs($this->destinataire);
        $this->postJson("/api/contact-leads/{$this->sienne->id}/assign", ['user_id' => $this->personnel($this->agence())->id])
            ->assertUnprocessable()->assertJsonValidationErrors(['user_id']);
        $this->postJson("/api/contact-leads/{$this->sienne->id}/assign", ['user_id' => $this->bailleur($this->x)->id])
            ->assertUnprocessable()->assertJsonValidationErrors(['user_id']);

        $this->postJson("/api/contact-leads/{$this->sienne->id}/assign", ['user_id' => $cible->id])
            ->assertOk()
            ->assertJsonPath('data.recipient_user_id', $cible->id);
        Notification::assertSentTo($cible, NewContactLeadNotification::class);
    }

    /**
     * Vérification adverse (M1) — l'agent RETIRÉ de l'agence perd la demande qui lui était
     * adressée : ni liste, ni lecture, ni traitement, ni conversion dans l'agence quittée.
     */
    public function test_m1_l_agent_retire_perd_sa_boite(): void
    {
        $restreint = $this->agentSansVueGlobale();
        $this->sienne->update(['recipient_user_id' => $restreint->id]);
        $this->assertSame([$this->sienne->id], $this->idsVusPar($restreint));

        AgentProfile::query()->where('user_id', $restreint->id)->first()->delete();
        $parti = $restreint->fresh();

        $this->assertSame([], $this->idsVusPar($parti));
        $this->getJson("/api/contact-leads/{$this->sienne->id}")->assertForbidden();
        $this->postJson("/api/contact-leads/{$this->sienne->id}/handle")->assertForbidden();
        $this->postJson("/api/contact-leads/{$this->sienne->id}/convert")->assertForbidden();
        $this->assertDatabaseCount('customers', 0);
        $this->assertNull($this->sienne->fresh()->handled_at);
    }

    /** M4 (R) — un agent SUSPENDU n'est pas attribuable. */
    public function test_m4_une_demande_ne_s_attribue_pas_a_un_agent_suspendu(): void
    {
        $suspendu = $this->personnel($this->x);
        AgentProfile::query()->where('user_id', $suspendu->id)->update(['status' => AgentProfileStatus::Suspended->value]);

        Sanctum::actingAs($this->personnel($this->x, 'agency_admin'));
        $this->postJson("/api/contact-leads/{$this->sienne->id}/assign", ['user_id' => $suspendu->id])
            ->assertUnprocessable()->assertJsonValidationErrors(['user_id']);
        $this->assertSame($this->destinataire->id, $this->sienne->fresh()->recipient_user_id);
    }

    /**
     * La requête EXACTE de la console (`useContactLeads`) : champs clairsemés sur trois tables,
     * deux inclusions, tri, filtre. Une colonne refusée ici serait un 400 dans la boîte entière.
     */
    public function test_la_requete_de_la_console_est_acceptee(): void
    {
        Sanctum::actingAs($this->destinataire);

        $champs = 'id,property_id,agency_id,recipient_user_id,channel,source,medium,name,email,phone,message,'
            .'handled_at,handled_by_id,customer_id,created_at';
        $reponse = $this->getJson('/api/contact-leads?'.http_build_query([
            'fields' => [
                'property_contact_leads' => $champs,
                'properties' => 'id,title,slug',
                'users' => 'id,first_name,last_name',
            ],
            'filter' => ['handled' => '0'],
            'include' => 'property,recipient',
            'sort' => '-created_at',
            'page' => 1,
            'per_page' => 20,
        ]))->assertOk();

        $premiere = collect($reponse->json('data'))->firstWhere('id', $this->sienne->id);
        $this->assertNotNull($premiere);
        $this->assertSame($this->sienne->message, $premiere['message']);
        $this->assertSame($this->sienne->property_id, $premiere['property']['id']);
        $this->assertArrayHasKey('slug', $premiere['property']);
        $this->assertSame($this->destinataire->id, $premiere['recipient']['id']);
        $this->assertSame(2, $reponse->json('meta.total'));

        // Le compteur du menu : le seul `id`, une page d'une ligne, le total dans `meta`.
        $this->getJson('/api/contact-leads?fields[property_contact_leads]=id&filter[handled]=0&per_page=1')
            ->assertOk()
            ->assertJsonPath('meta.total', 2);
    }

    /** AC17 — plus aucun titre figé « Nouveau lead anonyme » dans `app/`. */
    public function test_plus_aucun_titre_fige_dans_app(): void
    {
        $fichiers = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator(app_path()));
        $trouves = [];
        foreach ($fichiers as $fichier) {
            if ($fichier->isFile() && str_contains((string) file_get_contents($fichier->getPathname()), 'Nouveau lead anonyme')) {
                $trouves[] = $fichier->getPathname();
            }
        }

        $this->assertSame([], $trouves);
    }
}
