<?php

namespace Tests\Feature\Search;

use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\DocumentType;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Policies\DocumentPolicy;
use App\Services\Search\DocumentSearchService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Meilisearch\Endpoints\Indexes;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-2781 — la recherche de documents dit la lecture au moteur par un filtre borné
 * (`DocumentSearchService::filtreDeLecture`), traduction de la règle SQL de la liste :
 * `DocumentPolicy::restreindreAuTeleverseur` (personnel, bailleur) et `restreindreAuxLecteursDInternes`
 * (super-admin). Ce test garde la traduction : pour chaque lecteur de la matrice, l'ensemble rendu par
 * Meilisearch, et son total, égalent l'ensemble que la requête SQL rend, sur un décor qui passe par
 * chaque type de porteur et chaque branche de la règle (agence gardée ou non, sujet épargné, porteur
 * supprimé, interne d'une fiche, d'un bien, d'une fiche sans agence).
 *
 * Meilisearch réel : le pilote `collection` rejouerait la règle SQL elle-même.
 */
class RechercheDocumentsPariteSqlMoteurTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private Agency $a;

    private Agency $b;

    private Agency $c;

    protected function setUp(): void
    {
        parent::setUp();
        $this->a = Agency::factory()->create();
        $this->b = Agency::factory()->create();
        $this->c = Agency::factory()->create();
    }

    private function connecter(User $user): void
    {
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($user->fresh());
    }

    private function piece(Model $porteur, User $auteur, string $libelle, bool $interne = false): int
    {
        return (int) Document::factory()->create([
            'documentable_type' => $porteur::class, 'documentable_id' => $porteur->getKey(),
            'uploaded_by' => $auteur->id, 'name' => "Dossier {$libelle}", 'description' => null,
            'type' => DocumentType::Other, 'is_internal' => $interne,
        ])->id;
    }

    private function fiche(?Agency $agence, ?User $sujet = null): Customer
    {
        return Customer::factory()->create(['agency_id' => $agence?->id, 'user_id' => $sujet?->id]);
    }

    /**
     * Le décor : une pièce téléversée par le lecteur sur chaque porteur. Les porteurs supprimés le
     * sont AVANT la pièce : ce test juge la traduction, pas la réindexation (testée plus bas).
     *
     * @return array<string, int> libellé => identifiant
     */
    private function decor(User $lecteur): array
    {
        [$a, $b, $c] = [$this->a, $this->b, $this->c];
        $tiers = User::factory()->create();
        $p = [];

        $bienA = Property::factory()->create(['agency_id' => $a->id]);
        $p['bien A'] = $this->piece($bienA, $lecteur, 'bien A');
        $p['bien B'] = $this->piece(Property::factory()->create(['agency_id' => $b->id]), $lecteur, 'bien B');
        $p['bien C'] = $this->piece(Property::factory()->create(['agency_id' => $c->id]), $lecteur, 'bien C');
        $p['bien sans agence'] = $this->piece(Property::factory()->create(['agency_id' => null]), $lecteur, 'bien sans agence');
        $p['interne d un bien A'] = $this->piece($bienA, $lecteur, 'interne d un bien A', interne: true);
        $supprime = Property::factory()->create(['agency_id' => $c->id]);
        $inventaireOrphelin = Inventory::factory()->create(['property_id' => $supprime->id]);
        $supprime->delete();
        $p['bien C supprimé'] = $this->piece($supprime, $lecteur, 'bien C supprime');

        $p['bail C'] = $this->piece(Lease::factory()->create(['agency_id' => $c->id, 'tenant_id' => $this->fiche($c)->id]), $lecteur, 'bail C');
        $p['bail C dont il est locataire'] = $this->piece(
            Lease::factory()->create(['agency_id' => $c->id, 'tenant_id' => $this->fiche($c, $lecteur)->id]), $lecteur, 'bail C locataire');
        $locataireParti = $this->fiche($c, $lecteur);
        $bailOrphelin = Lease::factory()->create(['agency_id' => $c->id, 'tenant_id' => $locataireParti->id]);
        $locataireParti->delete();
        $p['bail C dont la fiche du locataire est supprimée'] = $this->piece($bailOrphelin, $lecteur, 'bail C locataire supprime');

        $p['réservation C'] = $this->piece(Booking::factory()->create(['agency_id' => $c->id, 'customer_id' => $this->fiche($c)->id]), $lecteur, 'reservation C');
        $p['réservation C dont il est client'] = $this->piece(
            Booking::factory()->create(['agency_id' => $c->id, 'customer_id' => $this->fiche($c, $lecteur)->id]), $lecteur, 'reservation C client');

        foreach (['A' => $a, 'B' => $b, 'C' => $c] as $nom => $agence) {
            $p["fiche {$nom}"] = $this->piece($fiche = $this->fiche($agence), $lecteur, "fiche {$nom}");
            $p["interne fiche {$nom}"] = $this->piece($fiche, $lecteur, "interne fiche {$nom}", interne: true);
            $p["interne fiche {$nom} d un tiers"] = $this->piece($this->fiche($agence, $tiers), $lecteur, "interne fiche {$nom} tiers", interne: true);
            $p["fiche {$nom} dont il est le sujet"] = $this->piece($sienne = $this->fiche($agence, $lecteur), $lecteur, "fiche {$nom} sujet");
            $p["interne fiche {$nom} dont il est le sujet"] = $this->piece($sienne, $lecteur, "interne fiche {$nom} sujet", interne: true);
        }
        $sansAgence = $this->fiche(null);
        $p['fiche sans agence'] = $this->piece($sansAgence, $lecteur, 'fiche sans agence');
        $p['interne fiche sans agence'] = $this->piece($sansAgence, $lecteur, 'interne fiche sans agence', interne: true);
        $ficheSupprimee = $this->fiche($a);
        $ficheSupprimee->delete();
        $p['fiche A supprimée'] = $this->piece($ficheSupprimee, $lecteur, 'fiche A supprimee');
        $p['interne fiche A supprimée'] = $this->piece($ficheSupprimee, $lecteur, 'interne fiche A supprimee', interne: true);

        $p['agence A'] = $this->piece($a, $lecteur, 'agence A');
        $p['agence C'] = $this->piece($c, $lecteur, 'agence C');
        $p['état des lieux A'] = $this->piece(Inventory::factory()->create(['property_id' => $bienA->id]), $lecteur, 'etat des lieux A');
        $p['état des lieux d un bien supprimé'] = $this->piece($inventaireOrphelin, $lecteur, 'etat des lieux bien supprime');
        $p['demande de passage C'] = $this->piece(AgencyUpgradeRequest::factory()->create(['agency_id' => $c->id]), $lecteur, 'demande C');

        $p['son profil suspendu en C'] = $this->piece(AgentProfile::query()->create([
            'user_id' => $lecteur->id, 'agency_id' => $c->id, 'status' => AgentProfileStatus::Suspended->value,
        ]), $lecteur, 'son profil C');
        $p['profil d un tiers en C'] = $this->piece(OwnerProfile::query()->create(['user_id' => $tiers->id, 'agency_id' => $c->id]), $lecteur, 'profil tiers C');
        $p['son compte'] = $this->piece($lecteur, $lecteur, 'son compte');

        $this->waitForMeilisearch();

        return $p;
    }

    /** @return list<int> */
    private function selonSql(User $lecteur): array
    {
        $lecteur = $lecteur->fresh();
        $requete = $lecteur->isSuperAdmin()
            ? DocumentPolicy::restreindreAuxLecteursDInternes(Document::query(), $lecteur)
            : DocumentPolicy::restreindreAuTeleverseur(Document::query(), $lecteur);

        return $requete->pluck('documents.id')->map(fn ($id) => (int) $id)->sort()->values()->all();
    }

    /** @return array{0: list<int>, 1: int} les identifiants rendus, et le total annoncé */
    private function selonLeMoteur(User $lecteur): array
    {
        $this->connecter($lecteur);
        $reponse = $this->getJson('/api/search/documents?q=dossier&per_page=50')->assertOk();
        $ids = collect($reponse->json('data'))->pluck('id')->map(fn ($id) => (int) $id)->sort()->values()->all();

        return [$ids, (int) $reponse->json('meta.total')];
    }

    /**
     * @param  array<string, int>  $decor
     * @param  list<string>  $lus  les libellés que la règle doit rendre — l'attente explicite, pour
     *                             qu'une faute commune au SQL et au moteur ne passe pas
     */
    private function assertParite(User $lecteur, array $decor, array $lus): void
    {
        $sql = $this->selonSql($lecteur);
        [$moteur, $total] = $this->selonLeMoteur($lecteur);

        $nom = fn (array $ids) => collect($decor)->filter(fn ($id) => in_array($id, $ids, true))->keys()->sort()->values()->all();
        $this->assertSame($nom($sql), $nom($moteur), 'le moteur rend ce que la requête SQL rend');
        $this->assertSame($sql, $moteur);
        $this->assertSame(count($sql), $total, 'le total suit la lecture');

        $attendus = collect($lus)->sort()->values()->all();
        $this->assertSame($attendus, $nom($sql), 'la règle SQL rend les attendus');
    }

    /** Les porteurs que la règle d'auteur ne juge pas, ou qui l'épargnent : lus de tout téléverseur. */
    private const TOUJOURS = [
        'bien sans agence', 'bien C supprimé', 'bail C dont il est locataire', 'réservation C dont il est client',
        'fiche A dont il est le sujet', 'fiche B dont il est le sujet', 'fiche C dont il est le sujet', 'fiche sans agence', 'fiche A supprimée', 'état des lieux d un bien supprimé',
        'son profil suspendu en C', 'son compte',
    ];

    public function test_le_personnel_actif(): void
    {
        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $this->a->id]);
        $decor = $this->decor($admin);

        $this->assertParite($admin, $decor, [...self::TOUJOURS,
            'bien A', 'fiche A', 'interne fiche A', 'interne fiche A d un tiers', 'agence A', 'état des lieux A',
        ]);
    }

    public function test_le_personnel_parti_vers_une_autre_agence(): void
    {
        $parti = User::factory()->create();
        AgentProfile::query()->create(['user_id' => $parti->id, 'agency_id' => $this->a->id])->delete();
        AgentProfile::query()->create(['user_id' => $parti->id, 'agency_id' => $this->b->id]);
        $decor = $this->decor($parti);

        $this->assertParite($parti, $decor, [...self::TOUJOURS,
            'bien B', 'fiche B', 'interne fiche B', 'interne fiche B d un tiers',
        ]);
    }

    public function test_l_agent_suspendu(): void
    {
        $agent = User::factory()->create();
        AgentProfile::query()->create(['user_id' => $agent->id, 'agency_id' => $this->a->id, 'status' => AgentProfileStatus::Suspended->value]);
        $decor = $this->decor($agent);

        $this->assertParite($agent, $decor, self::TOUJOURS);
    }

    /**
     * AC5 — le bailleur BLOQUÉ n'est pas membre (`memberAgencyIds` ne lit que l'actif) : seul son profil
     * de bailleur, de tout statut, garde ses téléversements de l'agence. Un filtre qui l'oublie retire
     * « bien A », et l'attente explicite rougit — le SQL et le moteur partagent la liste des agences.
     */
    public function test_le_bailleur_bloque(): void
    {
        $bailleur = User::factory()->create();
        OwnerProfile::query()->create(['user_id' => $bailleur->id, 'agency_id' => $this->a->id, 'status' => OwnerProfileStatus::Blocked->value]);
        $decor = $this->decor($bailleur);

        $this->assertParite($bailleur, $decor, [...self::TOUJOURS,
            'bien A', 'fiche A', 'agence A', 'état des lieux A',
        ]);
    }

    public function test_le_super_admin_sujet_d_une_fiche(): void
    {
        $superAdmin = User::factory()->create();
        $this->materializeRoleProfile($superAdmin, 'super_admin');
        $decor = $this->decor($superAdmin);

        $internesRefuses = [
            'interne d un bien A', 'interne fiche A dont il est le sujet', 'interne fiche B dont il est le sujet',
            'interne fiche C dont il est le sujet', 'interne fiche A supprimée',
        ];
        $this->assertParite($superAdmin, $decor, array_values(array_diff(array_keys($decor), $internesRefuses)));
    }

    /**
     * AC1 — 3 000 téléversements dans l'agence quittée : le filtre envoyé à Meilisearch est le même
     * qu'avec un seul, et ne nomme aucun document. Lu sur l'appel réel au moteur.
     */
    public function test_le_filtre_envoye_ne_depend_pas_du_nombre_de_documents(): void
    {
        $parti = User::factory()->create();
        AgentProfile::query()->create(['user_id' => $parti->id, 'agency_id' => $this->a->id])->delete();
        AgentProfile::query()->create(['user_id' => $parti->id, 'agency_id' => $this->b->id]);
        $bien = Property::factory()->create(['agency_id' => $this->a->id]);
        $this->piece($bien, $parti, 'premier');
        $this->waitForMeilisearch();

        $espion = new class extends DocumentSearchService
        {
            /** @var list<string> */
            public array $filtres = [];

            protected function interroger(Indexes $index, string $query, array $options): array
            {
                $this->filtres[] = (string) ($options['filter'] ?? '');

                return parent::interroger($index, $query, $options);
            }
        };
        $this->app->instance(DocumentSearchService::class, $espion);

        $this->connecter($parti);
        $this->getJson('/api/search/documents?q=dossier')->assertOk()->assertJsonPath('meta.total', 0);
        $avecUn = end($espion->filtres);

        $maintenant = now();
        foreach (array_chunk(range(1, 3000), 500) as $lot) {
            DB::table('documents')->insert(array_map(fn (int $n) => [
                'documentable_type' => Property::class, 'documentable_id' => $bien->id, 'uploaded_by' => $parti->id,
                'name' => "Dossier {$n}", 'type' => DocumentType::Other->value, 'is_internal' => false,
                'is_verified' => false, 'created_at' => $maintenant, 'updated_at' => $maintenant,
            ], $lot));
        }
        $this->assertSame(3001, Document::query()->where('uploaded_by', $parti->id)->count());

        $this->connecter($parti);
        $this->getJson('/api/search/documents?q=dossier')->assertOk()->assertJsonPath('meta.total', 0);
        $avecTroisMille = end($espion->filtres);

        $this->assertSame($avecUn, $avecTroisMille, 'le filtre ne grandit pas avec les téléversements');
        $this->assertDoesNotMatchRegularExpression('/\bid\b/', $avecTroisMille, 'aucune clause sur `id`');
        $this->assertLessThan(400, strlen($avecTroisMille), $avecTroisMille);
    }

    /**
     * AC4 — un bien qui change d'agence voit ses documents réindexés : le personnel de l'ancienne
     * agence ne retrouve plus le sien, celui de la nouvelle retrouve le sien.
     */
    public function test_un_bien_qui_change_d_agence_reindexe_ses_documents(): void
    {
        $ancien = User::factory()->create();
        AgentProfile::query()->create(['user_id' => $ancien->id, 'agency_id' => $this->a->id]);
        $nouveau = User::factory()->create();
        AgentProfile::query()->create(['user_id' => $nouveau->id, 'agency_id' => $this->b->id]);
        $bien = Property::factory()->create(['agency_id' => $this->a->id]);
        $inventaire = Inventory::factory()->create(['property_id' => $bien->id]);
        $sienne = $this->piece($bien, $ancien, 'de l ancien');
        $etat = $this->piece($inventaire, $ancien, 'etat de l ancien');
        $autre = $this->piece($bien, $nouveau, 'du nouveau');
        $this->waitForMeilisearch();

        $this->assertSame([$sienne, $etat], $this->selonLeMoteur($ancien)[0]);
        $this->assertSame([], $this->selonLeMoteur($nouveau)[0]);

        $bien->update(['agency_id' => $this->b->id]);
        $this->waitForMeilisearch();

        $this->assertSame([], $this->selonLeMoteur($ancien)[0], 'ancienne agence : plus rien');
        $this->assertSame([$autre], $this->selonLeMoteur($nouveau)[0], 'nouvelle agence : son téléversement');
        $this->assertSame($this->selonSql($ancien), $this->selonLeMoteur($ancien)[0]);
        $this->assertSame($this->selonSql($nouveau), $this->selonLeMoteur($nouveau)[0]);
    }

    /** Le sujet d'un bail se lit par sa fiche client : la fiche qui change de compte réindexe le bail. */
    public function test_la_fiche_du_locataire_qui_change_de_compte_reindexe_les_documents_du_bail(): void
    {
        $parti = User::factory()->create();
        AgentProfile::query()->create(['user_id' => $parti->id, 'agency_id' => $this->a->id])->delete();
        $locataire = $this->fiche($this->a);
        $piece = $this->piece(Lease::factory()->create(['agency_id' => $this->a->id, 'tenant_id' => $locataire->id]), $parti, 'bail');
        $this->waitForMeilisearch();
        $this->assertSame([], $this->selonLeMoteur($parti)[0]);

        $locataire->update(['user_id' => $parti->id]);
        $this->waitForMeilisearch();

        $this->assertSame([$piece], $this->selonLeMoteur($parti)[0], 'il est le locataire : la règle d’auteur l’épargne');
        $this->assertSame($this->selonSql($parti), $this->selonLeMoteur($parti)[0]);
    }

    /**
     * La parité APRÈS que les porteurs changent : chaque geste retourne le verdict d'une pièce déjà indexée,
     * et chacun passe par une entrée différente de `DocumentsDuPorteurObserver` (colonne recopiée,
     * suppression, restauration, porteurs qui lisent les faits d'un autre). Lecteur : l'administrateur
     * actif de A (S = A, G = {A}).
     */
    public function test_la_parite_tient_apres_que_les_porteurs_changent(): void
    {
        [$a, $b, $c] = [$this->a, $this->b, $this->c];
        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $a->id]);
        $tiers = User::factory()->create();
        $d = Agency::factory()->create();

        $bienC = Property::factory()->create(['agency_id' => $c->id]);
        $bienRestaure = Property::factory()->create(['agency_id' => $c->id]);
        $bienRestaure->delete();
        $ficheSupprimee = $this->fiche($a);
        $bailC = Lease::factory()->create(['agency_id' => $c->id, 'tenant_id' => $this->fiche($c)->id]);
        $bailLocataire = Lease::factory()->create(['agency_id' => $c->id, 'tenant_id' => $this->fiche($c)->id]);
        $ficheDuBail = $this->fiche($c);
        $bailDeLaFiche = Lease::factory()->create(['agency_id' => $c->id, 'tenant_id' => $ficheDuBail->id]);
        $resaC = Booking::factory()->create(['agency_id' => $c->id, 'customer_id' => $this->fiche($c)->id]);
        $resaClient = Booking::factory()->create(['agency_id' => $c->id, 'customer_id' => $this->fiche($c, $admin)->id]);
        $ficheDeLaResa = $this->fiche($c);
        $resaDeLaFiche = Booking::factory()->create(['agency_id' => $c->id, 'customer_id' => $ficheDeLaResa->id]);
        $ficheB = $this->fiche($b);
        $ficheC = $this->fiche($c);
        $etat = Inventory::factory()->create(['property_id' => Property::factory()->create(['agency_id' => $a->id])->id]);
        $demande = AgencyUpgradeRequest::factory()->create(['agency_id' => $c->id]);
        $proprio = OwnerProfile::query()->create(['user_id' => $tiers->id, 'agency_id' => $c->id]);
        $agent = AgentProfile::query()->create(['user_id' => $tiers->id, 'agency_id' => $c->id]);
        $patron = AgencyAdminProfile::query()->create(['user_id' => User::factory()->create()->id, 'agency_id' => $c->id]);

        $p = [
            'bien C → A' => $this->piece($bienC, $admin, 'bien'),
            'bien restauré' => $this->piece($bienRestaure, $admin, 'restaure'),
            'interne fiche supprimée' => $this->piece($ficheSupprimee, $admin, 'fiche supprimee', interne: true),
            'bail C → A' => $this->piece($bailC, $admin, 'bail'),
            'bail : son locataire' => $this->piece($bailLocataire, $admin, 'bail locataire'),
            'bail : la fiche devient la sienne' => $this->piece($bailDeLaFiche, $admin, 'bail fiche'),
            'réservation C → A' => $this->piece($resaC, $admin, 'resa'),
            'réservation : un autre client' => $this->piece($resaClient, $admin, 'resa client'),
            'réservation : la fiche devient la sienne' => $this->piece($resaDeLaFiche, $admin, 'resa fiche'),
            'fiche B → A' => $this->piece($ficheB, $admin, 'fiche B'),
            'fiche C : il en devient le sujet' => $this->piece($ficheC, $admin, 'fiche C'),
            'état des lieux → bien C' => $this->piece($etat, $admin, 'etat'),
            'demande C → A' => $this->piece($demande, $admin, 'demande'),
            'profil de bailleur C → A' => $this->piece($proprio, $admin, 'proprio'),
            'profil d agent C → A' => $this->piece($agent, $admin, 'agent'),
            'profil d administrateur C → A' => $this->piece($patron, $admin, 'patron'),
            'agence D supprimée' => $this->piece($d, $admin, 'agence D'),
        ];
        $this->waitForMeilisearch();
        $nom = fn (array $ids) => collect($p)->filter(fn ($id) => in_array($id, $ids, true))->keys()->sort()->values()->all();
        $avant = ['bien restauré', 'interne fiche supprimée', 'réservation : un autre client', 'état des lieux → bien C'];
        $this->assertSame(collect($avant)->sort()->values()->all(), $nom($this->selonSql($admin)), 'avant : la règle SQL');
        $this->assertSame($this->selonSql($admin), $this->selonLeMoteur($admin)[0], 'avant : la parité');

        $bienC->update(['agency_id' => $a->id]);
        $bienRestaure->restore();
        $ficheSupprimee->delete();
        $bailC->update(['agency_id' => $a->id]);
        $bailLocataire->update(['tenant_id' => $this->fiche($c, $admin)->id]);
        $ficheDuBail->update(['user_id' => $admin->id]);
        $resaC->update(['agency_id' => $a->id]);
        $resaClient->update(['customer_id' => $this->fiche($c)->id]);
        $ficheDeLaResa->update(['user_id' => $admin->id]);
        $ficheB->update(['agency_id' => $a->id]);
        $ficheC->update(['user_id' => $admin->id]);
        $etat->update(['property_id' => $bienRestaure->id]);
        $demande->update(['agency_id' => $a->id]);
        foreach ([$proprio, $agent, $patron] as $profil) {
            $profil->update(['agency_id' => $a->id]);
        }
        $d->delete();
        $this->waitForMeilisearch();

        $apres = [
            'bien C → A', 'bail C → A', 'bail : son locataire', 'bail : la fiche devient la sienne', 'réservation C → A',
            'réservation : la fiche devient la sienne', 'fiche B → A', 'fiche C : il en devient le sujet', 'demande C → A',
            'profil de bailleur C → A', 'profil d agent C → A', 'profil d administrateur C → A', 'agence D supprimée',
        ];
        $this->assertSame(collect($apres)->sort()->values()->all(), $nom($this->selonSql($admin)), 'après : la règle SQL');
        [$moteur, $total] = $this->selonLeMoteur($admin);
        $this->assertSame($nom($this->selonSql($admin)), $nom($moteur), 'après : la parité');
        $this->assertSame(count($apres), $total);
    }

    /**
     * Le document qui bascule en interne se réindexe (le `saved` de Scout) : le bailleur bloqué, qui lit la
     * pièce visible de sa fiche par son profil de bailleur, ne la retrouve plus une fois gardée pour l'agence.
     */
    public function test_la_piece_qui_devient_interne_n_est_plus_trouvee(): void
    {
        $bailleur = User::factory()->create();
        OwnerProfile::query()->create(['user_id' => $bailleur->id, 'agency_id' => $this->a->id, 'status' => OwnerProfileStatus::Blocked->value]);
        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $this->a->id]);
        $piece = $this->piece($this->fiche($this->a), $bailleur, 'visible');
        $this->waitForMeilisearch();
        $this->assertSame([$piece], $this->selonLeMoteur($bailleur)[0]);

        $this->connecter($admin);
        $this->patchJson("/api/documents/{$piece}/visibility", ['is_internal' => true])->assertOk();
        $this->waitForMeilisearch();

        $this->assertSame([], $this->selonLeMoteur($bailleur)[0]);
        $this->assertSame($this->selonSql($bailleur), $this->selonLeMoteur($bailleur)[0]);
    }

    /**
     * Défense en profondeur : l'index en retard sur la base (file de réindexation pas encore passée) ne fait
     * rien sortir que `view()` refuse. Les deux changements sont écrits sans événement, l'index garde les
     * anciens faits, et le post-filtre SQL des résultats hydratés retient les deux pièces.
     */
    public function test_un_index_en_retard_ne_rend_pas_ce_que_la_lecture_refuse(): void
    {
        $bailleur = User::factory()->create();
        OwnerProfile::query()->create(['user_id' => $bailleur->id, 'agency_id' => $this->a->id, 'status' => OwnerProfileStatus::Blocked->value]);
        $visible = Document::query()->findOrFail($this->piece($this->fiche($this->a), $bailleur, 'visible'));
        $bien = Property::factory()->create(['agency_id' => $this->a->id]);
        $surLeBien = $this->piece($bien, $bailleur, 'bien');
        $this->waitForMeilisearch();
        $this->assertSame([(int) $visible->id, $surLeBien], $this->selonLeMoteur($bailleur)[0], 'index à jour : les deux pièces');

        Document::withoutSyncingToSearch(fn () => $visible->update(['is_internal' => true]));
        Property::withoutEvents(fn () => $bien->update(['agency_id' => $this->c->id]));
        $this->assertSame([], $this->selonSql($bailleur), 'la règle SQL les refuse');
        $this->getJson("/api/documents/{$visible->id}")->assertForbidden();
        $this->getJson("/api/documents/{$surLeBien}")->assertForbidden();

        [$ids, $total] = $this->selonLeMoteur($bailleur);
        $this->assertSame([], $ids, 'index en retard : rien de ce que view() refuse');
        $this->assertSame(0, $total);
    }

    /**
     * Un document indexé avant ces attributs (déploiement dont la réimportation n'a pas encore tourné)
     * n'est rendu à personne : le filtre échoue fermé.
     */
    public function test_un_document_indexe_sans_les_faits_du_porteur_n_est_pas_rendu(): void
    {
        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $this->a->id]);
        $document = Document::withoutSyncingToSearch(fn () => Document::factory()->create([
            'documentable_type' => Property::class, 'documentable_id' => Property::factory()->create(['agency_id' => $this->a->id])->id,
            'uploaded_by' => $admin->id, 'name' => 'Dossier ancien', 'description' => null, 'type' => DocumentType::Other,
        ]));
        $ancienneForme = collect($document->toSearchableArray())
            ->except(['is_internal', 'carrier_present', 'carrier_agency_id', 'subject_user_id'])->all();
        $document->searchableUsing()->index($document->searchableAs())->addDocuments([$ancienneForme], 'id');
        $this->waitForMeilisearch();

        $this->assertSame([], $this->selonLeMoteur($admin)[0], 'ancienne forme : fermé');

        $document->searchable();
        $this->waitForMeilisearch();
        $this->assertSame([(int) $document->id], $this->selonLeMoteur($admin)[0], 'forme courante : rendu');
    }
}
