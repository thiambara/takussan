<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\CustomerNote;
use App\Models\Enums\ContactGestureChannel;
use App\Models\Enums\CustomerNoteKind;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Crm\ContactGestureService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2589 — `GET /api/customers/{customer}/timeline`, le fil de la fiche client.
 *
 * Autorisé EXACTEMENT comme la lecture de la fiche ; les visites et les gestes de contact au seul
 * personnel de l'agence de la fiche, et des visites rien de plus que ce que la liste des visites
 * rend à ce lecteur (jamais leurs notes) ; un ordre total (deux entrées du même instant ne changent
 * pas de page) ; un nombre de requêtes qui ne dépend pas de la taille de la page.
 */
class CustomerTimelineTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $admin;

    private User $bailleurAuteur;

    private Customer $fiche;

    private Property $bien;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agence = $this->agence();
        $this->admin = $this->personnel($this->agence, 'agency_admin');
        $this->bailleurAuteur = $this->bailleur($this->agence);
        $this->fiche = $this->ficheClient($this->agence, null, [
            'added_by_id' => $this->bailleurAuteur->id,
            'pipeline_stage' => CustomerPipelineStage::Lead,
        ]);
        $this->bien = $this->bienDe($this->agence, $this->bailleur($this->agence));
        Activity::query()->delete();
    }

    private function fil(string $query = ''): array
    {
        return $this->getJson("/api/customers/{$this->fiche->id}/timeline{$query}")->assertOk()->json();
    }

    private function note(array $attributes = []): CustomerNote
    {
        return CustomerNote::factory()->create($attributes + [
            'customer_id' => $this->fiche->id,
            'author_id' => $this->admin->id,
            'body' => 'Cherche un F3 à Mermoz',
        ]);
    }

    private function visite(?Property $bien = null, array $attributes = []): PropertyVisit
    {
        return PropertyVisit::factory()->create($attributes + [
            'property_id' => ($bien ?? $this->bien)->id,
            'customer_id' => $this->fiche->id,
            'agent_id' => $this->admin->id,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => now()->addDays(2),
            'notes' => 'Note libre de la visite, jamais servie',
        ]);
    }

    public function test_le_personnel_lit_notes_visites_contacts_et_etapes_du_plus_recent_au_plus_ancien(): void
    {
        Carbon::setTestNow('2026-11-10 09:00:00');
        $note = $this->note();
        Carbon::setTestNow('2026-11-10 10:00:00');
        $visite = $this->visite();
        Carbon::setTestNow('2026-11-10 11:00:00');
        app(ContactGestureService::class)->onCustomer($this->fiche, $this->admin, ContactGestureChannel::Call);
        Carbon::setTestNow('2026-11-10 12:00:00');
        Sanctum::actingAs($this->admin);
        $this->patchJson("/api/customers/{$this->fiche->id}/pipeline-stage", ['pipeline_stage' => 'qualified'])->assertOk();

        $json = $this->fil();

        $this->assertSame(['stage', 'contact', 'visit', 'note'], array_column($json['data'], 'type'));
        $this->assertSame(4, $json['meta']['total']);
        [$etape, $contact, $lue, $notee] = $json['data'];

        $this->assertSame(['lead', 'qualified', $this->admin->id], [$etape['from'], $etape['to'], $etape['causer']['id']]);
        $this->assertSame(['call', $this->admin->id], [$contact['channel'], $contact['causer']['id']]);
        $this->assertSame([$visite->id, 'confirmed', $this->bien->id], [$lue['id'], $lue['status'], $lue['property']['id']]);
        $this->assertSame(['id', 'title'], array_keys($lue['property']));
        $this->assertSame([$note->id, 'Cherche un F3 à Mermoz', $this->admin->id], [$notee['id'], $notee['body'], $notee['author']['id']]);
        $this->assertStringNotContainsString('jamais servie', json_encode($json));
    }

    public function test_le_compte_rendu_porte_son_verdict_courant_au_personnel(): void
    {
        $visite = $this->visite(null, ['report_outcome' => 'interested', 'report_objections' => ['price'], 'report_note' => 'Libre : ne pas servir']);
        $this->note(['kind' => CustomerNoteKind::VisitReport, 'property_visit_id' => $visite->id, 'body' => 'Intéressée']);

        Sanctum::actingAs($this->admin);
        $note = collect($this->fil('?filter[type]=note')['data'])->firstWhere('kind', 'visit_report');

        $this->assertSame(['visit_id' => $visite->id, 'outcome' => 'interested', 'objections' => ['price'], 'follow_up' => null], $note['report']);
        $this->assertStringNotContainsString('ne pas servir', json_encode($note));
    }

    public function test_le_bailleur_auteur_ne_lit_ni_visites_ni_contacts_ni_notes_reservees_au_personnel(): void
    {
        $libre = $this->note(['body' => 'Note ouverte']);
        $visite = $this->visite();
        // Une visite sur SON bien : la liste des visites la lui rend (propriétaire), le fil non —
        // les visites de la fiche sont des faits de l'agence.
        $surSonBien = $this->visite($this->bienDe($this->agence, $this->bailleurAuteur));
        $this->note(['kind' => CustomerNoteKind::VisitReport, 'property_visit_id' => $visite->id, 'body' => 'Compte rendu interne']);
        $this->note(['kind' => CustomerNoteKind::LeadMessage, 'body' => 'Message du prospect à l agence']);
        app(ContactGestureService::class)->onCustomer($this->fiche, $this->admin, ContactGestureChannel::Whatsapp);

        Sanctum::actingAs($this->bailleurAuteur);
        $this->assertContains($surSonBien->id, array_column($this->getJson("/api/property-visits?filter[customer_id]={$this->fiche->id}")->assertOk()->json('data'), 'id'));
        $json = $this->fil();

        $this->assertSame([['note', $libre->id]], array_map(fn ($e) => [$e['type'], $e['id']], $json['data']));
        $this->assertSame(1, $json['meta']['total']);
        $this->assertStringNotContainsString('interne', json_encode($json));

        // Demander les seules visites ne lui rend rien, sans erreur.
        $this->assertSame([], $this->fil('?filter[type]=visit')['data']);
    }

    public function test_une_visite_du_client_que_la_liste_des_visites_ne_rend_pas_au_lecteur_n_entre_pas_dans_son_fil(): void
    {
        $ailleurs = $this->agence();
        $bienAilleurs = $this->bienDe($ailleurs, $this->bailleur($ailleurs));
        $lisible = $this->visite();
        $illisible = $this->visite($bienAilleurs, ['agent_id' => $this->personnel($ailleurs)->id]);

        Sanctum::actingAs($this->admin);
        $listees = collect($this->getJson("/api/property-visits?filter[customer_id]={$this->fiche->id}")->assertOk()->json('data'))->pluck('id');
        $this->assertTrue($listees->contains($lisible->id));
        $this->assertFalse($listees->contains($illisible->id));

        $this->assertSame([$lisible->id], array_column($this->fil('?filter[type]=visit')['data'], 'id'));
    }

    public function test_l_autorisation_est_celle_de_la_lecture_de_la_fiche_pour_chaque_lecteur(): void
    {
        $ailleurs = $this->agence();
        $lecteurs = [
            'admin de l agence' => $this->admin,
            'agent de l agence non auteur' => $this->personnel($this->agence),
            'bailleur auteur' => $this->bailleurAuteur,
            'autre bailleur de l agence' => $this->bailleur($this->agence),
            'admin d une autre agence' => $this->personnel($ailleurs, 'agency_admin'),
            'client de la fiche' => tap($this->client(), fn (User $u) => $this->fiche->update(['user_id' => $u->id])),
        ];

        $vus = [];
        foreach ($lecteurs as $nom => $lecteur) {
            Sanctum::actingAs($lecteur);
            $show = $this->getJson("/api/customers/{$this->fiche->id}")->status();
            $fil = $this->getJson("/api/customers/{$this->fiche->id}/timeline")->status();
            $this->assertSame($show, $fil, "{$nom} : la fiche rend {$show}, le fil {$fil}");
            $vus[$nom] = $fil;
        }

        // Les deux versants sont bien éprouvés : un lecteur admis, un refusé hors de l'agence.
        $this->assertSame(200, $vus['admin de l agence']);
        $this->assertSame(200, $vus['bailleur auteur']);
        $this->assertSame(403, $vus['autre bailleur de l agence']);
        $this->assertContains($vus['admin d une autre agence'], [403, 404]);
    }

    public function test_sans_authentification_401(): void
    {
        $this->getJson("/api/customers/{$this->fiche->id}/timeline")->assertUnauthorized();
    }

    public function test_un_filtre_mal_forme_rend_422_au_lecteur_admis_et_403_au_lecteur_refuse(): void
    {
        Sanctum::actingAs($this->admin);
        $this->getJson("/api/customers/{$this->fiche->id}/timeline?filter[type]=note,task")->assertUnprocessable();

        Sanctum::actingAs($this->bailleur($this->agence));
        $this->getJson("/api/customers/{$this->fiche->id}/timeline?filter[type]=note,task")->assertForbidden();
    }

    public function test_le_filtre_par_type_ne_rend_que_les_types_demandes(): void
    {
        $this->note();
        $this->visite();
        app(ContactGestureService::class)->onCustomer($this->fiche, $this->admin, ContactGestureChannel::Sms);

        Sanctum::actingAs($this->admin);
        $types = array_column($this->fil('?filter[type]=note,contact')['data'], 'type');

        $this->assertEqualsCanonicalizing(['note', 'contact'], $types);
    }

    public function test_deux_entrees_du_meme_instant_ne_changent_pas_de_page(): void
    {
        Carbon::setTestNow('2026-11-10 09:00:00');
        $a = $this->note(['body' => 'A']);
        $b = $this->note(['body' => 'B']);
        // Un identifiant de visite plus grand que ceux des notes : sans le départage par type,
        // l'identifiant seul ferait passer la visite en tête.
        $visite = $this->visite(null, ['id' => $b->id + 1000]);
        Carbon::setTestNow();

        Sanctum::actingAs($this->admin);
        $pages = fn () => collect([1, 2, 3])
            ->map(fn (int $p) => array_map(fn ($e) => $e['type'].':'.$e['id'], $this->fil("?per_page=1&page={$p}")['data']))
            ->all();

        $premiere = $pages();
        $this->assertSame($premiere, $pages(), 'deux lectures rendent les mêmes pages');
        // Même instant : la note passe avant la visite (rang), la plus récente des deux notes d'abord (id).
        $this->assertSame([["note:{$b->id}"], ["note:{$a->id}"], ["visit:{$visite->id}"]], $premiere);
    }

    public function test_le_nombre_de_requetes_ne_depend_pas_de_la_taille_de_la_page(): void
    {
        Sanctum::actingAs($this->admin);
        $compter = function (): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->fil('?per_page=50');
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };

        $remplir = function (int $n): void {
            for ($i = 0; $i < $n; $i++) {
                $visite = $this->visite();
                $this->note(['author_id' => $this->personnel($this->agence)->id]);
                $this->note(['kind' => CustomerNoteKind::VisitReport, 'property_visit_id' => $visite->id]);
                app(ContactGestureService::class)->onCustomer($this->fiche, $this->personnel($this->agence), ContactGestureChannel::Call);
                $this->fiche->update(['pipeline_stage' => $this->fiche->pipeline_stage === CustomerPipelineStage::Lead ? CustomerPipelineStage::Qualified : CustomerPipelineStage::Lead]);
            }
        };

        $remplir(1);
        // Une première lecture chauffe ce que l'application garde d'une requête à l'autre.
        $compter();
        $petite = $compter();
        $remplir(6);
        $grande = $compter();

        $this->assertSame(35, $this->fil('?per_page=50')['meta']['total']);
        $this->assertSame($petite, $grande, "{$petite} requêtes pour 5 entrées, {$grande} pour 35");
    }

    public function test_reservations_et_baux_comptes_dans_l_agence_de_la_fiche_et_au_seul_personnel(): void
    {
        $ailleurs = $this->agence();
        Booking::factory()->count(2)->create(['customer_id' => $this->fiche->id, 'agency_id' => $this->agence->id, 'property_id' => $this->bien->id]);
        Booking::factory()->create(['customer_id' => $this->fiche->id, 'agency_id' => $ailleurs->id]);
        Lease::factory()->create(['tenant_id' => $this->fiche->id, 'agency_id' => $this->agence->id, 'property_id' => $this->bien->id]);
        Lease::factory()->count(2)->create(['tenant_id' => $this->fiche->id, 'agency_id' => $ailleurs->id]);

        $url = "/api/customers/{$this->fiche->id}?fields[customers]=id,agency_id&include=bookingsCount,leasesCount";

        Sanctum::actingAs($this->admin);
        $data = $this->getJson($url)->assertOk()->json('data');
        $this->assertSame([2, 1], [$data['bookings_count'], $data['leases_count']]);

        Sanctum::actingAs($this->bailleurAuteur);
        $data = $this->getJson($url)->assertOk()->json('data');
        $this->assertArrayNotHasKey('bookings_count', $data);
        $this->assertArrayNotHasKey('leases_count', $data);
    }
}
