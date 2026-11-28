<?php

namespace Tests\Feature\Lecture;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Guarantor;
use App\Models\Inventory;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Payout;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;

/**
 * TCK-3006 (ADR-0138 § 3) — la liste et la fiche disent la même chose, dans les DEUX sens, pour
 * chaque modèle dont « qui peut lire » vit dans un module `<Modèle>Lisibles` :
 *
 *  1. toute ligne que la liste rend (`GET /api/<x>`, par HTTP, profil actif compris) s'ouvre en
 *     fiche (`can('view')`, la policy qui délègue au module) ;
 *  2. toute ligne du décor qui s'ouvre en fiche est dans la liste.
 *
 * Le second sens est celui qui empêche une liste vide de passer le premier. Le décor croise un jeu
 * d'acteurs (super-admin, personnel actif, agent, personnel parti, bailleur, locataire, client,
 * étranger à l'agence, profil dans deux agences) avec des lignes écrites par chacun d'eux, dans
 * l'agence A, l'agence B et hors agence : chaque branche d'une face a au moins une ligne qu'elle
 * seule atteint, de sorte qu'en retirer une d'UNE face fait rougir ce test (ablation : notes de
 * TCK-3006).
 *
 * La fiche se juge par la Gate, sous le profil actif que le middleware aurait résolu : c'est la
 * règle de `show` (`$this->authorize('view', …)`), sans le coût d'une requête HTTP par ligne.
 */
class ListeEtFicheParityTest extends ApiTestCase
{
    use ActeursDeLecture;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->poserLesActeurs();
    }

    /**
     * Les auteurs d'une ligne : chacun des acteurs qui peut en écrire une (tous, sauf le super-admin,
     * qui lit tout et n'éprouve rien).
     *
     * @return list<User>
     */
    private function auteurs(): array
    {
        return array_values(array_filter($this->acteurs, fn (User $u) => ! $u->isSuperAdmin()));
    }

    /** @return list<?int> */
    private function agences(): array
    {
        return [$this->a->id, $this->b->id, null];
    }

    /**
     * @param  Collection<int, Model>  $lignes  le décor du modèle
     * @param  list<string>  $modes  d'autres portées de la même liste (`filter[team]=1`), réunies à la
     *                               première ; un mode refusé à l'acteur (403) n'y ajoute rien
     */
    private function assertParite(string $route, Collection $lignes, array $modes = []): void
    {
        $this->assertNotEmpty($lignes);
        $this->assertLessThanOrEqual(100, $lignes->count(), 'le décor doit tenir dans une page');
        $classe = $lignes->first()::class;
        $verdicts = [];

        foreach ($this->acteurs as $nom => $acteur) {
            $listes = $this->idsListes($route, $acteur);
            foreach ($modes as $mode) {
                $listes = array_values(array_unique([...$listes, ...$this->idsListes($mode, $acteur, refusPossible: true)]));
            }

            foreach ($listes as $id) {
                $ligne = $classe::query()->findOrFail($id);
                $this->assertTrue($this->ouvre($acteur, $ligne), "{$route} / {$nom} : #{$id} listée mais refusée en fiche");
            }

            foreach ($lignes as $ligne) {
                $ouvre = $this->ouvre($acteur, $classe::query()->findOrFail($ligne->getKey()));
                $verdicts[] = $ouvre;
                $this->assertSame(
                    $ouvre,
                    in_array((int) $ligne->getKey(), $listes, true),
                    "{$route} / {$nom} : #{$ligne->getKey()} ".($ouvre ? 'ouverte en fiche mais absente de la liste' : 'refusée en fiche mais listée'),
                );
            }
        }

        // Un décor où tout s'ouvre, ou rien, ne départagerait aucune branche.
        $this->assertContains(true, $verdicts);
        $this->assertContains(false, $verdicts);
    }

    /** @return list<int> */
    private function idsListes(string $route, User $acteur, bool $refusPossible = false): array
    {
        $requete = $this->actingAsApi($acteur);
        if ($acteur->is($this->acteur('profil dans deux agences (actif : B)'))) {
            $requete = $requete->withHeaders(['X-Active-Profile-Hint' => "agent:{$this->profilDuDouble->id}"]);
        }

        $reponse = $requete->getJson($route.(str_contains($route, '?') ? '&' : '?').'per_page=100');
        if ($refusPossible && $reponse->getStatusCode() === 403) {
            return [];
        }
        $reponse->assertOk();
        $this->assertLessThanOrEqual(100, $reponse->json('meta.total'));

        return collect($reponse->json('data'))->pluck('id')->map(fn ($id) => (int) $id)->all();
    }

    /** La fiche, jugée sous le profil actif que le middleware aurait résolu pour cet acteur. */
    private function ouvre(User $acteur, Model $ligne): bool
    {
        return Gate::forUser($this->sousLeProfilActif($acteur))->allows('view', $ligne);
    }

    public function test_cautions(): void
    {
        $lignes = collect();
        foreach ($this->auteurs() as $auteur) {
            foreach ($this->agences() as $agence) {
                $lignes->push(Guarantor::factory()->create(['added_by_id' => $auteur->id, 'agency_id' => $agence]));
            }
        }

        $this->assertParite('/api/guarantors', $lignes);
    }

    /**
     * AC1 — le personnel actif voit en liste la caution de son agence ajoutée par un collègue ;
     * l'auteur parti ne la voit plus, ni en liste ni en fiche.
     */
    public function test_ac1_cautions_du_collegue_et_de_l_auteur_parti(): void
    {
        $agent = $this->acteur('agent de A');
        $personnel = $this->acteur('personnel actif (admin de A)');
        $parti = $this->acteur('personnel parti de A');
        $duCollegue = Guarantor::factory()->create(['added_by_id' => $agent->id, 'agency_id' => $this->a->id]);
        $duParti = Guarantor::factory()->create(['added_by_id' => $parti->id, 'agency_id' => $this->a->id]);

        $this->assertContains($duCollegue->id, $this->idsListes('/api/guarantors', $personnel));
        $this->assertContains($duParti->id, $this->idsListes('/api/guarantors', $personnel));
        $this->assertNotContains($duParti->id, $this->idsListes('/api/guarantors', $parti));
        $this->actingAsApi($parti)->getJson("/api/guarantors/{$duParti->id}")->assertForbidden();
        $this->actingAsApi($personnel)->getJson("/api/guarantors/{$duParti->id}")->assertOk();
    }

    public function test_factures(): void
    {
        $lignes = collect();
        foreach ($this->auteurs() as $auteur) {
            foreach ($this->agences() as $agence) {
                $lignes->push(Invoice::factory()->create([
                    'issued_by_id' => $auteur->id,
                    'agency_id' => $agence,
                    'customer_id' => Customer::factory()->create(['agency_id' => $agence])->id,
                ]));
            }
        }
        foreach ([$this->ficheDuClient, $this->ficheDuLocataire] as $fiche) {
            $lignes->push(Invoice::factory()->create(['agency_id' => $this->a->id, 'customer_id' => $fiche->id]));
        }

        $this->assertParite('/api/invoices', $lignes);
    }

    public function test_reversements(): void
    {
        $lignes = collect();
        foreach ($this->auteurs() as $auteur) {
            foreach ($this->agences() as $agence) {
                $lignes->push(Payout::factory()->create([
                    'issued_by_id' => $auteur->id,
                    'agency_id' => $agence,
                    'landlord_id' => $this->acteur('bailleur de A')->id,
                ]));
            }
        }
        foreach ($this->auteurs() as $beneficiaire) {
            $lignes->push(Payout::factory()->create(['agency_id' => $this->a->id, 'landlord_id' => $beneficiaire->id]));
        }

        $this->assertParite('/api/payouts', $lignes);
    }

    public function test_etats_des_lieux(): void
    {
        $lignes = collect();
        foreach ($this->biens() as $bien) {
            $bail = Lease::factory()->create(['property_id' => $bien->id, 'agency_id' => $bien->agency_id, 'landlord_id' => $bien->user_id]);
            foreach ($this->auteurs() as $conducteur) {
                $lignes->push(Inventory::factory()->create(['lease_id' => $bail->id, 'property_id' => $bien->id, 'conducted_by' => $conducteur->id]));
            }
            $lignes->push(Inventory::factory()->create(['lease_id' => $bail->id, 'property_id' => $bien->id, 'tenant_id' => $this->ficheDuLocataire->id]));
        }

        $this->assertParite('/api/inventories', $lignes);
    }

    /**
     * AC2 — sur un bien supprimé en douceur, l'agent parti n'ouvre plus l'état des lieux qu'il a
     * conduit ; le personnel actif de l'agence le voit en liste et en fiche.
     */
    public function test_ac2_etat_des_lieux_d_un_bien_en_corbeille(): void
    {
        $bien = $this->biens()['A, en corbeille'];
        $parti = $this->acteur('personnel parti de A');
        $personnel = $this->acteur('personnel actif (admin de A)');
        $etat = Inventory::factory()->create(['property_id' => $bien->id, 'conducted_by' => $parti->id]);

        $this->actingAsApi($parti)->getJson("/api/inventories/{$etat->id}")->assertForbidden();
        $this->assertNotContains($etat->id, $this->idsListes('/api/inventories', $parti));
        $this->actingAsApi($personnel)->getJson("/api/inventories/{$etat->id}")->assertOk();
        $this->assertContains($etat->id, $this->idsListes('/api/inventories', $personnel));
    }

    public function test_baux(): void
    {
        $lignes = collect();
        foreach ($this->auteurs() as $bailleur) {
            foreach ($this->agences() as $agence) {
                $lignes->push(Lease::factory()->create(['landlord_id' => $bailleur->id, 'agency_id' => $agence]));
            }
        }
        $lignes->push(Lease::factory()->create(['agency_id' => $this->a->id, 'tenant_id' => $this->ficheDuLocataire->id]));

        $this->assertParite('/api/leases', $lignes);
    }

    public function test_clients(): void
    {
        $lignes = collect([$this->ficheDuLocataire, $this->ficheDuClient]);
        foreach ($this->auteurs() as $auteur) {
            foreach ($this->agences() as $agence) {
                $lignes->push(Customer::factory()->create(['added_by_id' => $auteur->id, 'agency_id' => $agence]));
            }
            // TCK-2757 — l'auteur qui est aussi le sujet de la fiche.
            $lignes->push(Customer::factory()->create(['added_by_id' => $auteur->id, 'user_id' => $auteur->id, 'agency_id' => $this->a->id]));
        }

        $this->assertParite('/api/customers', $lignes);
    }

    public function test_interventions(): void
    {
        $lignes = collect();
        foreach ($this->biens() as $bien) {
            foreach ($this->auteurs() as $demandeur) {
                $lignes->push(MaintenanceRequest::factory()->create(['property_id' => $bien->id, 'requester_id' => $demandeur->id]));
            }
            foreach (['agent de A', 'étranger (agent de B)'] as $assigne) {
                $lignes->push(MaintenanceRequest::factory()->create(['property_id' => $bien->id, 'assigned_to' => $this->acteur($assigne)->id]));
            }
        }

        $this->assertParite('/api/maintenance-requests', $lignes);
    }

    /**
     * ADR-0138 § 4 (vérification adverse) — le bien en corbeille se juge sur SON agence, pour la
     * borne du demandeur aussi : le personnel parti, refusé tant que le bien est actif, ne retrouve
     * pas l'intervention quand le bien passe en corbeille.
     */
    public function test_interventions_le_demandeur_parti_reste_refuse_quand_le_bien_passe_en_corbeille(): void
    {
        $parti = $this->acteur('personnel parti de A');
        $bien = Property::factory()->create(['agency_id' => $this->a->id]);
        $intervention = MaintenanceRequest::factory()->create(['property_id' => $bien->id, 'requester_id' => $parti->id]);
        $this->assertFalse($this->ouvre($parti, $intervention));

        $bien->delete();

        $this->assertFalse($this->ouvre($parti, $intervention->fresh()));
        $this->assertNotContains($intervention->id, $this->idsListes('/api/maintenance-requests', $parti));
    }

    /**
     * Les listes d'objets dont le bien est en corbeille ne relisent pas le bien ligne par ligne :
     * le nombre de requêtes ne croît pas de 1 à 20 lignes (interventions : la ressource lisait
     * `property` sur chaque ligne).
     *
     * @return iterable<string, array{0: string}>
     */
    public static function listesSurUnBienEnCorbeille(): iterable
    {
        yield 'états des lieux' => ['inventories'];
        yield 'visites' => ['property-visits'];
        yield 'interventions' => ['maintenance-requests'];
    }

    #[DataProvider('listesSurUnBienEnCorbeille')]
    public function test_une_liste_sur_un_bien_en_corbeille_ne_fait_pas_une_requete_par_ligne(string $route): void
    {
        $admin = $this->acteur('personnel actif (admin de A)');
        $bien = Property::factory()->create(['agency_id' => $this->a->id]);

        $compter = function (int $lignes) use ($route, $admin, $bien): int {
            foreach (range(1, $lignes) as $_) {
                match ($route) {
                    'inventories' => Inventory::factory()->create(['property_id' => $bien->id]),
                    'property-visits' => PropertyVisit::factory()->create(['property_id' => $bien->id]),
                    'maintenance-requests' => MaintenanceRequest::factory()->create(['property_id' => $bien->id, 'requester_id' => $admin->id]),
                };
            }
            $bien->delete();
            $requete = $this->actingAsApi($admin);
            DB::flushQueryLog();
            DB::enableQueryLog();
            $total = count($requete->getJson("/api/{$route}?per_page=100")->assertOk()->json('data'));
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();
            $bien->restore();
            $this->assertGreaterThanOrEqual($lignes, $total);

            return $n;
        };

        $une = $compter(1);
        $vingt = $compter(19);

        $this->assertSame($une, $vingt, "{$route} : {$une} requêtes pour 1 ligne, {$vingt} pour 20");
    }

    public function test_reservations(): void
    {
        $lignes = collect();
        foreach ($this->biens() as $bien) {
            foreach ($this->auteurs() as $createur) {
                $lignes->push(Booking::factory()->create(['property_id' => $bien->id, 'agency_id' => $bien->agency_id, 'created_by_id' => $createur->id]));
            }
            $lignes->push(Booking::factory()->create(['property_id' => $bien->id, 'agency_id' => $bien->agency_id, 'customer_id' => $this->ficheDuClient->id]));
        }

        $this->assertParite('/api/bookings', $lignes);
    }

    /**
     * La tâche : « mes tâches » et la vue d'équipe (`filter[team]=1`) sont deux modes de la même
     * liste (exception écrite dans `TachesLisibles`) ; la fiche se compare à leur réunion. Parents :
     * des biens (A, B, A en corbeille), une réservation de A (la tâche de remboursement), aucun.
     */
    public function test_taches(): void
    {
        $biens = $this->biens();
        $parents = [
            $biens['A'], $biens['B'], $biens['A, en corbeille'],
            Booking::factory()->create(['property_id' => $biens['A']->id, 'agency_id' => $this->a->id]),
            null,
        ];
        $lignes = collect();
        foreach ($parents as $parent) {
            $rattachement = ['taskable_type' => $parent?->getMorphClass(), 'taskable_id' => $parent?->getKey()];
            foreach ($this->auteurs() as $auteur) {
                $lignes->push(Task::factory()->create($rattachement + ['created_by_id' => $auteur->id]));
                $lignes->push(Task::factory()->create($rattachement + ['assigned_to_id' => $auteur->id]));
            }
        }

        $this->assertParite('/api/tasks', $lignes, ['/api/tasks?filter[team]=1']);
    }

    public function test_visites(): void
    {
        $lignes = collect();
        foreach ($this->biens() as $bien) {
            foreach ($this->auteurs() as $acteur) {
                $lignes->push(PropertyVisit::factory()->create(['property_id' => $bien->id, 'visitor_id' => $acteur->id, 'agent_id' => null]));
                $lignes->push(PropertyVisit::factory()->create(['property_id' => $bien->id, 'agent_id' => $acteur->id]));
            }
            $lignes->push(PropertyVisit::factory()->create(['property_id' => $bien->id, 'customer_id' => $this->ficheDuClient->id]));
        }

        $this->assertParite('/api/property-visits', $lignes);
    }

    /**
     * AC2 — sur un bien supprimé en douceur, l'agent parti n'ouvre plus la visite qui lui était
     * assignée ; le personnel actif de l'agence la voit en liste et en fiche.
     */
    public function test_ac2_visite_d_un_bien_en_corbeille(): void
    {
        $bien = $this->biens()['A, en corbeille'];
        $parti = $this->acteur('personnel parti de A');
        $personnel = $this->acteur('personnel actif (admin de A)');
        $visite = PropertyVisit::factory()->create(['property_id' => $bien->id, 'agent_id' => $parti->id]);

        $this->actingAsApi($parti)->getJson("/api/property-visits/{$visite->id}")->assertForbidden();
        $this->assertNotContains($visite->id, $this->idsListes('/api/property-visits', $parti));
        $this->actingAsApi($personnel)->getJson("/api/property-visits/{$visite->id}")->assertOk();
        $this->assertContains($visite->id, $this->idsListes('/api/property-visits', $personnel));
    }

    /**
     * L'agenda montre un SOUS-ENSEMBLE de la liste, composé sur elle (`CalendarEventCollector`,
     * TCK-3006) : aucune tâche ni intervention qu'il sert ne se refuse en fiche, et la tâche de
     * remboursement (parent `Booking`), que sa copie de la règle ignorait, y figure. Le bien saisi par
     * le personnel parti est la ligne que la copie des interventions lui servait encore.
     */
    public function test_l_agenda_ne_sert_que_ce_que_la_fiche_ouvre(): void
    {
        $biens = $this->biens();
        $biens['A, saisi par le parti'] = Property::factory()->create(['agency_id' => $this->a->id, 'user_id' => $this->acteur('personnel parti de A')->id]);
        $remboursement = Booking::factory()->create(['property_id' => $biens['A']->id, 'agency_id' => $this->a->id]);
        $lignes = collect();
        foreach ([...array_values($biens), $remboursement, null] as $parent) {
            $rattachement = ['taskable_type' => $parent?->getMorphClass(), 'taskable_id' => $parent?->getKey()];
            foreach ($this->auteurs() as $auteur) {
                $lignes->push(Task::factory()->create($rattachement + ['created_by_id' => $auteur->id, 'due_at' => now()->addDay()]));
                $lignes->push(Task::factory()->create($rattachement + ['assigned_to_id' => $auteur->id, 'due_at' => now()->addDay()]));
            }
        }
        foreach ($biens as $bien) {
            $lignes->push(MaintenanceRequest::factory()->create(['property_id' => $bien->id, 'scheduled_at' => now()->addDay()]));
            foreach (['agent de A', 'étranger (agent de B)'] as $assigne) {
                $lignes->push(MaintenanceRequest::factory()->create(['property_id' => $bien->id, 'assigned_to' => $this->acteur($assigne)->id, 'scheduled_at' => now()->addDay()]));
            }
        }
        $classes = ['task' => Task::class, 'maintenance' => MaintenanceRequest::class];
        $route = '/api/calendar?start_date='.now()->toDateString().'&end_date='.now()->addWeek()->toDateString().'&types[]=task&types[]=maintenance';
        $servis = [];

        foreach ($this->acteurs as $nom => $acteur) {
            $requete = $this->actingAsApi($acteur);
            if ($acteur->is($this->acteur('profil dans deux agences (actif : B)'))) {
                $requete = $requete->withHeaders(['X-Active-Profile-Hint' => "agent:{$this->profilDuDouble->id}"]);
            }
            foreach ($requete->getJson($route)->assertOk()->json('data') as $evenement) {
                $ligne = $classes[$evenement['type']]::query()->findOrFail($evenement['id']);
                $this->assertTrue($this->ouvre($acteur, $ligne), "agenda / {$nom} : {$evenement['type']} #{$evenement['id']} servie mais refusée en fiche");
                $servis[$nom][] = $evenement['key'];
            }
        }

        $tache = $lignes->first(fn ($l) => $l instanceof Task && $l->taskable_type === $remboursement->getMorphClass()
            && (int) $l->assigned_to_id === (int) $this->acteur('agent de A')->id);
        $this->assertContains("task-{$tache->id}", $servis['agent de A'] ?? [], 'la tâche de remboursement manque à l\'agenda de son assigné');
    }
}
