<?php

namespace Tests\Feature\Documents;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Services\Documents\DocumentVault;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Payout\OwnerStatementSnapshots;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use ReflectionMethod;
use RuntimeException;
use Tests\Support\CoffreDeDocuments;
use Tests\TestCase;

/**
 * TCK-2731 — la parité du coffre ENTIER et des générés, amorcés et non amorcés.
 *
 * `DocumentVaultPrimedVerdictParityTest` compare des VERDICTS de policies pour les personnes de son
 * décor. Celui-ci compare ce que l'appelant reçoit — le coffre de `DocumentVault::for()` contre
 * `build()` appelé sans amorce, et les générés de `generatedFor()` contre `generatedOf()` — pour des
 * personnes que l'autre n'a pas : collaborateurs d'un bien (lecteur, agent de A, agent de B, agent
 * suspendu, gestionnaire sans profil), délégation EXPIRÉE, bailleur BLOQUÉ conducteur d'un état des
 * lieux, agent de B sur un bail CROISÉ (bien de A, bail de B), locataire aussi bailleur dans B.
 *
 * Il discrimine : `BailleurDuBien::tientUnProfil` lisant l'amorce `owner` (profils actifs) au lieu
 * de `owner_any` le fait rougir sur « bailleur bloqué conducteur ».
 */
class DocumentVaultPrimedVaultParityTest extends TestCase
{
    use CoffreDeDocuments;
    use RefreshDatabase;

    private Agency $agencyB;

    /** @var array<string, array{0: User, 1: list<Model|null>}> personne → (compte, profils actifs à essayer) */
    private array $personas = [];

    /** @var array<string, Lease|Property> les cibles des générés */
    private array $targets = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->batirLeCoffre();
        $this->agencyB = Agency::factory()->create();
        $this->assertTrue(app(OwnerStatementSnapshots::class)->record($this->agency, $this->landlord, '2025-12', now()));

        $collaborateur = function (CollaboratorRole $role, ?Agency $agence, AgentProfileStatus $statut = AgentProfileStatus::Active): array {
            $user = User::factory()->create();
            $profil = $agence !== null
                ? AgentProfile::query()->create(['user_id' => $user->id, 'agency_id' => $agence->id, 'status' => $statut])
                : null;
            PropertyCollaborator::query()->create(['property_id' => $this->property->id, 'user_id' => $user->id, 'role' => $role]);

            return [$user, $profil === null ? [null] : [null, $profil]];
        };

        // 6. Profil propriétaire actif dans A, délégation de rôle EXPIRÉE (hier).
        $exDelegue = User::factory()->create();
        $exDelegueProfil = OwnerProfile::query()->create(['user_id' => $exDelegue->id, 'agency_id' => $this->agency->id]);
        RoleDelegation::factory()->create([
            'user_id' => $exDelegue->id, 'agency_id' => $this->agency->id, 'delegator_id' => $this->admin->id,
            'role' => 'agent', 'ends_at' => now()->subDay(),
        ]);

        // 7. Bailleur BLOQUÉ de A, conducteur d'un état des lieux signé sur le bail du décor.
        $bloque = User::factory()->create();
        $bloqueProfil = OwnerProfile::query()->create(['user_id' => $bloque->id, 'agency_id' => $this->agency->id, 'status' => OwnerProfileStatus::Blocked]);
        Inventory::factory()->signed()->moveOut()->create([
            'lease_id' => $this->lease->id, 'property_id' => $this->property->id,
            'tenant_id' => $this->lease->tenant_id, 'conducted_by' => $bloque->id,
        ]);

        // 8. Bail CROISÉ : bien de A (bailleur du décor), bail porté par B, état des lieux signé
        //    conduit par le bailleur ; et un agent de B.
        $bienCroise = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->landlord->id, 'title' => 'Maison croisée']);
        $bailCroise = Lease::factory()->create([
            'property_id' => $bienCroise->id, 'agency_id' => $this->agencyB->id, 'landlord_id' => $this->landlord->id,
            'tenant_id' => Customer::factory()->create(['agency_id' => $this->agencyB->id])->id, 'status' => LeaseStatus::Active,
        ]);
        Inventory::factory()->signed()->create([
            'lease_id' => $bailCroise->id, 'property_id' => $bienCroise->id,
            'tenant_id' => $bailCroise->tenant_id, 'conducted_by' => $this->landlord->id,
        ]);
        $agentB = User::factory()->create();
        $agentBProfil = AgentProfile::query()->create(['user_id' => $agentB->id, 'agency_id' => $this->agencyB->id]);

        // 9. Le locataire du décor, AUSSI bailleur dans B : un bien et un bail là-bas.
        $locataireBailleurProfil = OwnerProfile::query()->create(['user_id' => $this->tenant->id, 'agency_id' => $this->agencyB->id]);
        $bienDuLocataire = Property::factory()->create(['agency_id' => $this->agencyB->id, 'user_id' => $this->tenant->id, 'title' => 'Studio du locataire']);
        $this->leaseFor(User::factory()->create(), $bienDuLocataire, LeaseStatus::Active);

        $this->personas = [
            '1. collaborateur lecteur, agent de A' => $collaborateur(CollaboratorRole::Viewer, $this->agency),
            '2. collaborateur agent, agent de A' => $collaborateur(CollaboratorRole::Agent, $this->agency),
            '3. collaborateur agent, agent de B' => $collaborateur(CollaboratorRole::Agent, $this->agencyB),
            '4. collaborateur agent, agent de A suspendu' => $collaborateur(CollaboratorRole::Agent, $this->agency, AgentProfileStatus::Suspended),
            '5. collaborateur gestionnaire sans profil' => $collaborateur(CollaboratorRole::Manager, null),
            '6. délégation expirée' => [$exDelegue, [null, $exDelegueProfil]],
            '7. bailleur bloqué conducteur' => [$bloque, [null, $bloqueProfil]],
            '8. agent de B, bail croisé' => [$agentB, [null, $agentBProfil]],
            '9. locataire aussi bailleur dans B' => [$this->tenant, [null, $locataireBailleurProfil]],
            '10. bailleur' => [$this->landlord, [null, OwnerProfile::query()->where('user_id', $this->landlord->id)->where('agency_id', $this->agency->id)->sole()]],
            '10. agent' => [$this->agent, [null, AgentProfile::query()->where('user_id', $this->agent->id)->sole()]],
            '10. autre locataire' => [$this->otherTenant, [null]],
        ];

        $this->targets = [
            'bien' => $this->property, 'autre bien' => $this->otherProperty,
            'bail' => $this->lease, 'autre bail' => $this->otherLease,
            'bail croisé' => $bailCroise, 'bien du locataire-bailleur' => $bienDuLocataire,
        ];
    }

    /**
     * `$appel` sous le profil actif posé dans la requête, puis retiré — avec un compte relu, pour
     * qu'aucun profil ni relation chargé par un appel précédent ne serve au suivant.
     *
     * @template T
     *
     * @param  callable(User): T  $appel
     * @return T
     */
    private function sous(User $qui, ?Model $profil, callable $appel): mixed
    {
        request()->attributes->set('active_profile', $profil?->fresh());
        try {
            return $appel(User::query()->findOrFail($qui->id));
        } finally {
            request()->attributes->remove('active_profile');
        }
    }

    /** @return array<string, mixed> le coffre construit SANS amorce (`build()`, privée) */
    private function construire(User $user, ?Model $profil): array
    {
        return (new ReflectionMethod(DocumentVault::class, 'build'))->invoke(new DocumentVault, $user, $profil?->fresh());
    }

    /** @return list<array<string, mixed>> les générés d'une cible SANS amorce (`generatedOf()`, privée) */
    private function generesSansAmorce(User $user, Lease|Property $cible): array
    {
        $cible = $cible::query()->findOrFail($cible->getKey());
        $baux = $cible instanceof Lease
            ? new Collection([$cible->loadMissing(['property', 'tenant'])])
            : $cible->leases()->with(['property', 'tenant'])->get();

        return (new ReflectionMethod(DocumentVault::class, 'generatedOf'))->invoke(new DocumentVault, $user, $cible, $baux);
    }

    public function test_le_coffre_et_les_generes_sont_les_memes_amorces_et_non_amorces(): void
    {
        $generesNonVides = 0;

        foreach ($this->personas as $nom => [$qui, $profils]) {
            foreach ($profils as $profil) {
                $contexte = $nom.' / '.($profil === null ? 'sans profil actif' : class_basename($profil));

                $sansAmorce = $this->sous($qui, $profil, fn (User $u) => $this->construire($u, $profil));
                $amorce = $this->sous($qui, $profil, fn (User $u) => (new DocumentVault)->for($u, $profil?->fresh()));
                $this->assertSame($sansAmorce, $amorce, "{$contexte} : le coffre");

                foreach ([$this->agency, $this->agencyB] as $agence) {
                    $partiel = $this->sous($qui, $profil, fn (User $u) => MembershipCapabilityResolver::primed(
                        [$u->id], [$agence->id], fn () => $this->construire($u, $profil),
                    ));
                    $this->assertSame($sansAmorce, $partiel, "{$contexte} : le coffre sous l'amorce de la seule agence {$agence->id}");
                }

                foreach ($this->targets as $nomCible => $cible) {
                    $attendus = $this->sous($qui, $profil, fn (User $u) => $this->generesSansAmorce($u, $cible));
                    $recus = $this->sous($qui, $profil, fn (User $u) => (new DocumentVault)->generatedFor($u, $cible::query()->findOrFail($cible->getKey())));
                    $this->assertSame($attendus, $recus, "{$contexte} : générés de « {$nomCible} »");
                    $generesNonVides += $attendus !== [] ? 1 : 0;
                }
            }
        }

        // Un décor qui ne rend rien ne prouve rien.
        $this->assertGreaterThanOrEqual(10, $generesNonVides);
    }

    /** Le cas qui discrimine `owner` et `owner_any` rend bien quelque chose : sans lui, sa parité serait vide. */
    public function test_le_bailleur_bloque_conducteur_lit_les_generes_du_bail(): void
    {
        [$bloque] = $this->personas['7. bailleur bloqué conducteur'];

        $generes = $this->sous($bloque, null, fn (User $u) => $this->generesSansAmorce($u, $this->lease));

        $this->assertNotSame([], $generes);
    }

    public function test_l_amorce_ne_survit_ni_a_une_exception_ni_ne_s_efface_sous_une_amorce_imbriquee(): void
    {
        $a = (int) $this->agency->id;
        $landlord = (int) $this->landlord->id;

        // Remise à `null` après une exception dans le rappel.
        try {
            MembershipCapabilityResolver::primed([$landlord], [$a], fn () => throw new RuntimeException('dans le rappel'));
            $this->fail('L’exception du rappel doit traverser primed().');
        } catch (RuntimeException $e) {
            $this->assertSame('dans le rappel', $e->getMessage());
        }
        $this->assertNull(MembershipCapabilityResolver::amorce('owner', $landlord, $a), 'L’amorce a survécu à l’exception.');

        // Un `primed()` imbriqué n'efface pas l'amorce externe avant la fin de l'externe.
        MembershipCapabilityResolver::primed([$landlord], [$a], function () use ($landlord, $a): void {
            MembershipCapabilityResolver::primed([$landlord], [$a], fn () => null);
            $this->assertTrue(MembershipCapabilityResolver::amorce('owner', $landlord, $a), 'L’amorce interne a effacé l’externe.');
        });
        $this->assertNull(MembershipCapabilityResolver::amorce('owner', $landlord, $a));

        // Le coffre appelé sous l'amorce d'AUTRES utilisateurs rend le même coffre.
        $profil = OwnerProfile::query()->where('user_id', $landlord)->where('agency_id', $a)->sole();
        $seul = $this->sous($this->landlord, $profil, fn (User $u) => (new DocumentVault)->for($u, $profil->fresh()));
        $sousAutrui = $this->sous($this->landlord, $profil, fn (User $u) => MembershipCapabilityResolver::primed(
            [$this->agent->id, $this->otherTenant->id], [$a, $this->agencyB->id], fn () => (new DocumentVault)->for($u, $profil->fresh()),
        ));
        $this->assertSame($seul, $sousAutrui);
        $this->assertNotSame([], $seul['folders']);
    }
}
