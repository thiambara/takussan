<?php

namespace Tests\Feature\Lecture;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\Capability;
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
use App\Policies\TaskPolicy;
use App\Services\Lecture\BauxLisibles;
use App\Services\Lecture\CautionsLisibles;
use App\Services\Lecture\ClientsLisibles;
use App\Services\Lecture\FacturesLisibles;
use App\Services\Lecture\InterventionsLisibles;
use App\Services\Lecture\InventairesLisibles;
use App\Services\Lecture\ReservationsLisibles;
use App\Services\Lecture\ReversementsLisibles;
use App\Services\Lecture\TachesLisibles;
use App\Services\Visit\VisitesLisibles;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-3016 (ADR-0138, ADR-0140 § 3) — qui peut lire, une TABLE DE DÉCISION par module
 * `<Modèle>Lisibles` : pour chaque ligne du décor, les acteurs qui la lisent, écrits à la main
 * d'après la règle (le docblock du module), et joués sur ses DEUX faces — `restreindre` (la liste)
 * et `peut` (la fiche).
 *
 * {@see ListeEtFicheParityTest} compare les deux faces entre elles : une erreur qu'elles partagent
 * (la même branche retirée des deux) la laisse verte. Cette table la voit, parce que l'attendu ne
 * vient d'aucune des deux. Elle appelle les modules directement : le câblage (contrôleur, policy,
 * profil actif résolu par le middleware) reste à la parité, qui passe par HTTP et la Gate.
 *
 * Lecture d'une table : `'libellé de la ligne' => [ligne, [acteurs qui la lisent]]`. Le
 * super-admin lit tout et n'y est pas écrit ; tout acteur absent de la liste ne lit pas la ligne.
 * Une seule classe, une méthode par module : les tables diffèrent par leurs lignes, et un
 * fournisseur de données aurait éloigné chaque ligne de son verdict.
 *
 * Au décor partagé ({@see ActeursDeLecture}) s'ajoute un agent de A privé de `crm.view_all` et de
 * `payouts.create` : sans lui, les branches gardées par une capacité ne se distinguent pas de la
 * simple appartenance à l'agence.
 */
class QuiPeutLireTest extends ApiTestCase
{
    use ActeursDeLecture;
    use RefreshDatabase;

    private const RESTREINT = 'agent de A sans crm.view_all ni payouts.create';

    /** Le personnel de A, par le profil actif : les trois comptes qui n'agissent que dans A. */
    private const PERSONNEL_A = [self::ADMIN, self::AGENT, self::RESTREINT];

    /** Le personnel de B, par le profil actif : l'agent de B et le compte à deux agences, actif dans B. */
    private const PERSONNEL_B = [self::ETRANGER, self::DOUBLE];

    protected function setUp(): void
    {
        parent::setUp();

        $this->poserLesActeurs();
        $this->acteurs[self::RESTREINT] = $this->agentWithout($this->a, Capability::CrmViewAll, Capability::PayoutsCreate);
    }

    public function test_cautions(): void
    {
        $caution = fn (string $auteur, ?int $agence) => Guarantor::factory()->create(['added_by_id' => $this->acteur($auteur)->id, 'agency_id' => $agence]);
        [$a, $b] = [$this->a->id, $this->b->id];

        $this->assertTable([
            'A, ajoutée par l\'agent' => [$caution(self::AGENT, $a), self::PERSONNEL_A],
            'A, ajoutée par le personnel parti' => [$caution(self::PARTI, $a), self::PERSONNEL_A],
            'hors agence, ajoutée par le personnel parti' => [$caution(self::PARTI, null), [self::PARTI]],
            'A, ajoutée par le double, actif dans B' => [$caution(self::DOUBLE, $a), [...self::PERSONNEL_A, self::DOUBLE]],
            'A, ajoutée par le bailleur' => [$caution(self::BAILLEUR, $a), [...self::PERSONNEL_A, self::BAILLEUR]],
            'hors agence, ajoutée par le bailleur' => [$caution(self::BAILLEUR, null), [self::BAILLEUR]],
            'B, ajoutée par le bailleur de A' => [$caution(self::BAILLEUR, $b), self::PERSONNEL_B],
        ], fn (User $u) => CautionsLisibles::restreindre(Guarantor::query(), $u), CautionsLisibles::peut(...));
    }

    public function test_factures(): void
    {
        $facture = fn (?string $emetteur, ?int $agence, ?Customer $client = null) => Invoice::factory()->create([
            'issued_by_id' => $emetteur !== null ? $this->acteur($emetteur)->id : null,
            'agency_id' => $agence,
            'customer_id' => ($client ?? Customer::factory()->create(['agency_id' => $agence]))->id,
        ]);
        [$a, $b] = [$this->a->id, $this->b->id];

        $this->assertTable([
            'A, émise par l\'agent' => [$facture(self::AGENT, $a), self::PERSONNEL_A],
            'A, émise par le personnel parti' => [$facture(self::PARTI, $a), self::PERSONNEL_A],
            'hors agence, émise par le personnel parti' => [$facture(self::PARTI, null), [self::PARTI]],
            'A, émise par le double, actif dans B' => [$facture(self::DOUBLE, $a), [...self::PERSONNEL_A, self::DOUBLE]],
            'A, facturée au client' => [$facture(null, $a, $this->ficheDuClient), [...self::PERSONNEL_A, self::CLIENT]],
            'B, facturée au locataire' => [$facture(null, $b, $this->ficheDuLocataire), [...self::PERSONNEL_B, self::LOCATAIRE]],
            'B, émise par le bailleur de A' => [$facture(self::BAILLEUR, $b), self::PERSONNEL_B],
        ], fn (User $u) => FacturesLisibles::restreindre(Invoice::query(), $u), FacturesLisibles::peut(...));
    }

    public function test_reversements(): void
    {
        $reversement = fn (?string $beneficiaire, ?string $emetteur, ?int $agence) => Payout::factory()->create([
            'landlord_id' => $beneficiaire !== null ? $this->acteur($beneficiaire)->id : User::factory()->create()->id,
            'issued_by_id' => $emetteur !== null ? $this->acteur($emetteur)->id : null,
            'agency_id' => $agence,
        ]);
        [$a, $b] = [$this->a->id, $this->b->id];
        // La branche du personnel exige `payouts.create` : l'agent restreint n'en est pas.
        $tresorerieA = [self::ADMIN, self::AGENT];

        $this->assertTable([
            'A, au bailleur' => [$reversement(self::BAILLEUR, null, $a), [...$tresorerieA, self::BAILLEUR]],
            'A, au personnel parti' => [$reversement(self::PARTI, null, $a), [...$tresorerieA, self::PARTI]],
            'A, émis par le personnel parti' => [$reversement(null, self::PARTI, $a), $tresorerieA],
            'hors agence, émis par le personnel parti' => [$reversement(null, self::PARTI, null), [self::PARTI]],
            'A, émis par l\'agent restreint' => [$reversement(null, self::RESTREINT, $a), [...$tresorerieA, self::RESTREINT]],
            'B, au locataire' => [$reversement(self::LOCATAIRE, null, $b), [...self::PERSONNEL_B, self::LOCATAIRE]],
            'B, émis par le bailleur de A' => [$reversement(null, self::BAILLEUR, $b), self::PERSONNEL_B],
        ], fn (User $u) => ReversementsLisibles::restreindre(Payout::query(), $u), ReversementsLisibles::peut(...));
    }

    public function test_baux(): void
    {
        $bail = fn (?string $bailleur, ?int $agence, ?Customer $locataire = null) => Lease::factory()->create([
            'landlord_id' => $bailleur !== null ? $this->acteur($bailleur)->id : User::factory()->create()->id,
            'agency_id' => $agence,
        ] + ($locataire !== null ? ['tenant_id' => $locataire->id] : []));
        [$a, $b] = [$this->a->id, $this->b->id];

        $this->assertTable([
            'A, au bailleur' => [$bail(self::BAILLEUR, $a), [...self::PERSONNEL_A, self::BAILLEUR]],
            // Désigné sans profil de bailleur dans A : il ne lit qu'au titre du personnel, et le
            // double agit dans B.
            'A, désignant le double, actif dans B' => [$bail(self::DOUBLE, $a), self::PERSONNEL_A],
            'A, désignant le personnel parti' => [$bail(self::PARTI, $a), self::PERSONNEL_A],
            'hors agence, au bailleur' => [$bail(self::BAILLEUR, null), [self::BAILLEUR]],
            'hors agence, au personnel parti' => [$bail(self::PARTI, null), [self::PARTI]],
            'B, au bailleur de A' => [$bail(self::BAILLEUR, $b), self::PERSONNEL_B],
            'B, loué au locataire' => [$bail(null, $b, $this->ficheDuLocataire), [...self::PERSONNEL_B, self::LOCATAIRE]],
        ], fn (User $u) => BauxLisibles::restreindre(Lease::query(), $u), BauxLisibles::peut(...));
    }

    public function test_clients(): void
    {
        $fiche = fn (string $auteur, ?int $agence, ?string $sujet = null) => Customer::factory()->create([
            'added_by_id' => $this->acteur($auteur)->id,
            'agency_id' => $agence,
            'user_id' => $sujet !== null ? $this->acteur($sujet)->id : null,
        ]);
        [$a, $b] = [$this->a->id, $this->b->id];
        // La branche du personnel exige `crm.view_all` : l'agent restreint n'en est pas.
        $crmA = [self::ADMIN, self::AGENT];

        $this->assertTable([
            // Le sujet d'une fiche ne la lit pas.
            'A, la fiche du locataire' => [$this->ficheDuLocataire, $crmA],
            'A, ajoutée par l\'agent restreint' => [$fiche(self::RESTREINT, $a), [...$crmA, self::RESTREINT]],
            'A, ajoutée par le personnel parti' => [$fiche(self::PARTI, $a), $crmA],
            'hors agence, ajoutée par le personnel parti' => [$fiche(self::PARTI, null), [self::PARTI]],
            'A, ajoutée par le bailleur' => [$fiche(self::BAILLEUR, $a), [...$crmA, self::BAILLEUR]],
            'A, ajoutée par le bailleur à son propre sujet' => [$fiche(self::BAILLEUR, $a, self::BAILLEUR), $crmA],
            'A, ajoutée par le double, actif dans B' => [$fiche(self::DOUBLE, $a), [...$crmA, self::DOUBLE]],
            'B, ajoutée par le bailleur de A' => [$fiche(self::BAILLEUR, $b), self::PERSONNEL_B],
        ], fn (User $u) => ClientsLisibles::restreindre(Customer::query(), $u), ClientsLisibles::peut(...));
    }

    public function test_reservations(): void
    {
        $biens = $this->biens() + [
            'A, saisi par le parti' => Property::factory()->create(['agency_id' => $this->a->id, 'user_id' => $this->acteur(self::PARTI)->id]),
        ];
        $reservation = fn (string $bien, string $createur, ?Customer $client = null) => Booking::factory()->create([
            'property_id' => $biens[$bien]->id,
            'agency_id' => $biens[$bien]->agency_id,
            'created_by_id' => $this->acteur($createur)->id,
        ] + ($client !== null ? ['customer_id' => $client->id] : []));

        $this->assertTable([
            'A, créée par le personnel parti' => [$reservation('A', self::PARTI), [...self::PERSONNEL_A, self::BAILLEUR]],
            'hors agence, créée par le personnel parti' => [$reservation('hors agence', self::PARTI), [self::PARTI, self::BAILLEUR]],
            'A (bien saisi par un agent), du client' => [$reservation('A, saisi par un agent', self::ADMIN, $this->ficheDuClient), [...self::PERSONNEL_A, self::CLIENT]],
            // Le créateur du bien n'en est le bailleur que s'il tient un profil de bailleur dans l'agence.
            'A (bien saisi par le personnel parti)' => [$reservation('A, saisi par le parti', self::ADMIN), self::PERSONNEL_A],
            // Le bailleur lit par le bien, que la corbeille lui retire ; l'agence reste sur la ligne.
            'A, bien en corbeille, créée par le personnel parti' => [$reservation('A, en corbeille', self::PARTI), self::PERSONNEL_A],
            'B, créée par le double, actif dans B' => [$reservation('B', self::DOUBLE), self::PERSONNEL_B],
            'B, créée par le bailleur de A' => [$reservation('B', self::BAILLEUR), self::PERSONNEL_B],
        ], fn (User $u) => ReservationsLisibles::restreindre(Booking::query(), $u), ReservationsLisibles::peut(...));
    }

    public function test_etats_des_lieux(): void
    {
        $biens = $this->biens();
        $etat = fn (string $bien, ?string $conducteur, ?Customer $locataire = null) => Inventory::factory()->create([
            'property_id' => $biens[$bien]->id,
            'conducted_by' => $conducteur !== null ? $this->acteur($conducteur)->id : User::factory()->create()->id,
        ] + ($locataire !== null ? ['tenant_id' => $locataire->id] : []));

        $this->assertTable([
            'A, conduit par l\'agent' => [$etat('A', self::AGENT), [...self::PERSONNEL_A, self::BAILLEUR]],
            'A, conduit par le personnel parti' => [$etat('A', self::PARTI), [...self::PERSONNEL_A, self::BAILLEUR]],
            'A en corbeille, conduit par le personnel parti' => [$etat('A, en corbeille', self::PARTI), [...self::PERSONNEL_A, self::BAILLEUR]],
            'hors agence, conduit par le personnel parti' => [$etat('hors agence', self::PARTI), [self::PARTI, self::BAILLEUR]],
            'A, conduit par le double, actif dans B' => [$etat('A', self::DOUBLE), [...self::PERSONNEL_A, self::BAILLEUR, self::DOUBLE]],
            // Le conducteur qui tient un profil de bailleur dans l'agence, sur le bien d'un autre.
            'A (bien saisi par un agent), conduit par le bailleur' => [$etat('A, saisi par un agent', self::BAILLEUR), [...self::PERSONNEL_A, self::BAILLEUR]],
            'B, conduit par le bailleur de A' => [$etat('B', self::BAILLEUR), self::PERSONNEL_B],
            'B, du locataire' => [$etat('B', null, $this->ficheDuLocataire), [...self::PERSONNEL_B, self::LOCATAIRE]],
        ], fn (User $u) => InventairesLisibles::restreindre(Inventory::query(), $u), InventairesLisibles::peut(...));
    }

    public function test_interventions(): void
    {
        $biens = $this->biens();
        $intervention = fn (string $bien, ?string $demandeur, ?string $assigne = null) => MaintenanceRequest::factory()->create([
            'property_id' => $biens[$bien]->id,
            'requester_id' => $demandeur !== null ? $this->acteur($demandeur)->id : User::factory()->create()->id,
            'assigned_to' => $assigne !== null ? $this->acteur($assigne)->id : null,
        ]);

        $this->assertTable([
            'A, demandée par le personnel parti' => [$intervention('A', self::PARTI), [...self::PERSONNEL_A, self::BAILLEUR]],
            'A, demandée par le locataire' => [$intervention('A', self::LOCATAIRE), [...self::PERSONNEL_A, self::BAILLEUR, self::LOCATAIRE]],
            'hors agence, demandée par le personnel parti' => [$intervention('hors agence', self::PARTI), [self::PARTI, self::BAILLEUR]],
            // La corbeille ferme l'intervention : seul le demandeur la garde, hors de l'agence qu'il a quittée.
            'A en corbeille, demandée par le locataire' => [$intervention('A, en corbeille', self::LOCATAIRE), [self::LOCATAIRE]],
            'A en corbeille, demandée par le personnel parti' => [$intervention('A, en corbeille', self::PARTI), []],
            // Assigné : personnel de l'agence du bien, quel que soit son profil actif.
            'A (bien saisi par un agent), assignée au double' => [$intervention('A, saisi par un agent', null, self::DOUBLE), [...self::PERSONNEL_A, self::DOUBLE]],
            'B, assignée à l\'agent de A' => [$intervention('B', null, self::AGENT), self::PERSONNEL_B],
            'B, demandée par le bailleur de A' => [$intervention('B', self::BAILLEUR), [...self::PERSONNEL_B, self::BAILLEUR]],
        ], fn (User $u) => InterventionsLisibles::restreindre(MaintenanceRequest::query(), $u), InterventionsLisibles::peut(...));
    }

    public function test_visites(): void
    {
        $biens = $this->biens();
        $visite = fn (string $bien, ?string $visiteur, ?string $agent = null, ?Customer $client = null) => PropertyVisit::factory()->create([
            'property_id' => $biens[$bien]->id,
            'visitor_id' => $visiteur !== null ? $this->acteur($visiteur)->id : User::factory()->create()->id,
            'agent_id' => $agent !== null ? $this->acteur($agent)->id : null,
        ] + ($client !== null ? ['customer_id' => $client->id] : []));

        $this->assertTable([
            'A, visitée par le personnel parti' => [$visite('A', self::PARTI), [...self::PERSONNEL_A, self::BAILLEUR, self::PARTI]],
            'A, assignée au personnel parti' => [$visite('A', null, self::PARTI), [...self::PERSONNEL_A, self::BAILLEUR]],
            'A en corbeille, assignée au personnel parti' => [$visite('A, en corbeille', null, self::PARTI), [...self::PERSONNEL_A, self::BAILLEUR]],
            'A, du client' => [$visite('A', null, null, $this->ficheDuClient), [...self::PERSONNEL_A, self::BAILLEUR, self::CLIENT]],
            // L'agent assigné ne lit que dans l'agence de son profil actif.
            'A (bien saisi par un agent), assignée au double, actif dans B' => [$visite('A, saisi par un agent', null, self::DOUBLE), self::PERSONNEL_A],
            'hors agence, assignée au personnel parti' => [$visite('hors agence', null, self::PARTI), [self::PARTI, self::BAILLEUR]],
            'B, visitée par le locataire' => [$visite('B', self::LOCATAIRE), [...self::PERSONNEL_B, self::LOCATAIRE]],
            'B, assignée à l\'agent de A' => [$visite('B', null, self::AGENT), self::PERSONNEL_B],
        ], fn (User $u) => VisitesLisibles::restreindre(PropertyVisit::query(), $u), VisitesLisibles::peut(...));
    }

    /**
     * La liste des tâches a deux modes (exception écrite dans `TachesLisibles`) : « mes tâches »
     * (branches 1 à 3) et la vue d'équipe (branche 4), ouverte à qui tient `crm.view_all` dans
     * l'agence de son profil actif ; la face liste est leur réunion. La couverture d'une absence
     * (branche 3, ADR-0035) n'a pas de ligne ici : son décor est celui des tests d'absence.
     */
    public function test_taches(): void
    {
        $biens = $this->biens();
        $parents = [
            'bien A' => $biens['A'],
            'bien A en corbeille' => $biens['A, en corbeille'],
            'bien B' => $biens['B'],
            'réservation A' => Booking::factory()->create(['property_id' => $biens['A']->id, 'agency_id' => $this->a->id]),
            'sans parent' => null,
            'bien effacé pour de bon' => tap(Property::factory()->create(['agency_id' => $this->a->id]))->forceDelete(),
        ];
        $tache = fn (string $parent, ?string $createur, ?string $assigne = null) => Task::factory()->create([
            'taskable_type' => $parents[$parent]?->getMorphClass(),
            'taskable_id' => $parents[$parent]?->getKey(),
            'created_by_id' => $createur !== null ? $this->acteur($createur)->id : null,
            'assigned_to_id' => $assigne !== null ? $this->acteur($assigne)->id : null,
        ]);
        // La vue d'équipe de A : `crm.view_all`, que l'agent restreint n'a pas.
        $equipeA = [self::ADMIN, self::AGENT];

        $this->assertTable([
            'bien A, assignée à l\'agent restreint' => [$tache('bien A', null, self::RESTREINT), [...$equipeA, self::RESTREINT]],
            'bien A, créée par le personnel parti et assignée à lui' => [$tache('bien A', self::PARTI, self::PARTI), []],
            'sans parent, créée par le personnel parti' => [$tache('sans parent', self::PARTI), [self::PARTI]],
            'sans parent, assignée à l\'agent' => [$tache('sans parent', null, self::AGENT), [self::AGENT]],
            'bien A en corbeille, assignée à l\'agent restreint' => [$tache('bien A en corbeille', null, self::RESTREINT), [...$equipeA, self::RESTREINT]],
            'bien A, créée par le bailleur' => [$tache('bien A', self::BAILLEUR), [self::BAILLEUR]],
            // Les branches 1 à 3 lisent toutes les agences de l'appelant, pas la seule du profil actif.
            'bien A, assignée au double, actif dans B' => [$tache('bien A', null, self::DOUBLE), [...$equipeA, self::DOUBLE]],
            'bien B, assignée à l\'agent de B' => [$tache('bien B', null, self::ETRANGER), self::PERSONNEL_B],
            'réservation A, assignée à l\'agent restreint' => [$tache('réservation A', null, self::RESTREINT), [...$equipeA, self::RESTREINT]],
            'bien B, créée par l\'agent de A' => [$tache('bien B', self::AGENT), []],
            // Un parent attendu et introuvable, même en corbeille, ne s'ouvre à personne.
            'bien effacé pour de bon, assignée à l\'agent' => [$tache('bien effacé pour de bon', self::AGENT, self::AGENT), []],
        ], function (User $u) {
            $equipe = TaskPolicy::teamAgencyOf($u);

            return Task::query()->where(fn ($q) => $q
                ->whereIn('id', TachesLisibles::restreindre(Task::query(), $u)->select('tasks.id'))
                ->when($equipe !== null, fn ($q) => $q->orWhereIn('id', TachesLisibles::restreindreALEquipe(Task::query(), $equipe)->select('tasks.id'))));
        }, TachesLisibles::peut(...));
    }

    /**
     * Joue la table sur les deux faces, pour chaque acteur sous son profil actif, et rend TOUS les
     * écarts d'un coup : une branche mutée se lit à la forme du motif, pas au premier écart.
     *
     * @param  array<string, array{0: Model, 1: list<string>}>  $table
     * @param  Closure(User): Builder<Model>  $liste
     * @param  Closure(User, Model): bool  $fiche
     */
    private function assertTable(array $table, Closure $liste, Closure $fiche): void
    {
        $lecteursInconnus = array_diff(array_merge(...array_column($table, 1)), array_keys($this->acteurs));
        $this->assertSame([], array_values($lecteursInconnus), 'lecteur absent du décor');

        $ecarts = [];
        foreach ($this->acteurs as $nom => $acteur) {
            $u = $this->sousLeProfilActif($acteur);
            $requete = $liste($u);
            $ids = array_map('intval', $requete->pluck($requete->getModel()->getQualifiedKeyName())->all());

            foreach ($table as $libelle => [$ligne, $lecteurs]) {
                $attendu = $nom === self::SUPER || in_array($nom, $lecteurs, true);
                $relue = $ligne::query()->findOrFail($ligne->getKey());
                $faces = ['liste' => in_array((int) $ligne->getKey(), $ids, true), 'fiche' => $fiche($u, $relue)];
                foreach ($faces as $face => $lit) {
                    if ($lit !== $attendu) {
                        $ecarts[] = sprintf('%s / %s / %s : %s, attendu %s', $libelle, $nom, $face, $lit ? 'lit' : 'ne lit pas', $attendu ? 'lit' : 'ne lit pas');
                    }
                }
            }
        }

        $this->assertSame([], $ecarts, implode("\n", $ecarts));
    }
}
