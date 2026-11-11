<?php

namespace Tests\Feature\Documents;

use App\Http\Controllers\Api\DocumentPdfController;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Policies\DocumentPolicy;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Tests\Support\CoffreDeDocuments;
use Tests\TestCase;

/**
 * TCK-2655 (vérification adverse) — le coffre juge ses cibles SOUS AMORCE
 * ({@see MembershipCapabilityResolver::primed()}) pour ne plus poser de requêtes par bien, bail et
 * état des lieux. Les policies restent les seules juges ; ce test garde que l'amorce ne change AUCUN
 * verdict : pour chaque personne, chaque profil actif possible et chaque cible du décor, `view`,
 * `attachTo`, `readsTarget` et la règle des quittances rendent la même chose amorcés et non amorcés.
 *
 * Le décor porte les cas qui séparent les portées : bailleur BLOQUÉ (il garde la lecture : profil de
 * tout statut, sorte `owner_any`), profil propriétaire SUPPRIMÉ, personnel par seule délégation,
 * double casquette (agent de A, bailleur de B), bail dont `landlord_id` est l'agent saisisseur
 * (TCK-1926), état des lieux conduit par le bailleur (branche « conducteur »), état des lieux non
 * signé, bien sans agence.
 */
class DocumentVaultPrimedVerdictParityTest extends TestCase
{
    use CoffreDeDocuments;
    use RefreshDatabase;

    private Agency $agencyB;

    /** @var array<string, array{0: User, 1: list<Model|null>}> personne → (compte, profils actifs à essayer) */
    private array $personas = [];

    /** @var array<string, Model> */
    private array $targets = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->batirLeCoffre();
        $this->agencyB = Agency::factory()->create();

        // Bailleur bloqué dans A : il lit encore son bien et son bail.
        $blocked = User::factory()->create();
        $blockedProfile = OwnerProfile::query()->create(['user_id' => $blocked->id, 'agency_id' => $this->agency->id, 'status' => OwnerProfileStatus::Blocked]);
        $blockedProperty = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $blocked->id]);
        $blockedLease = $this->leaseFor(User::factory()->create(), $blockedProperty, LeaseStatus::Active);

        // Profil propriétaire supprimé : plus bailleur de rien.
        $gone = User::factory()->create();
        OwnerProfile::query()->create(['user_id' => $gone->id, 'agency_id' => $this->agency->id])->delete();
        $goneProperty = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $gone->id]);

        // Personnel par délégation seule (avec un profil actif dans l'agence, condition d'une délégation en vigueur).
        $delegate = User::factory()->create();
        $delegateProfile = OwnerProfile::query()->create(['user_id' => $delegate->id, 'agency_id' => $this->agency->id]);
        RoleDelegation::factory()->create(['user_id' => $delegate->id, 'agency_id' => $this->agency->id, 'delegator_id' => $this->admin->id, 'role' => 'agent']);

        // Double casquette : agent de A, bailleur de B.
        $double = User::factory()->create();
        $doubleAgent = AgentProfile::query()->create(['user_id' => $double->id, 'agency_id' => $this->agency->id]);
        $doubleOwner = OwnerProfile::query()->create(['user_id' => $double->id, 'agency_id' => $this->agencyB->id]);
        $doubleProperty = Property::factory()->create(['agency_id' => $this->agencyB->id, 'user_id' => $double->id]);
        $doubleLease = $this->leaseFor($this->tenant, $doubleProperty, LeaseStatus::Active);

        // Bail saisi par un agent (TCK-1926) : `landlord_id` est l'agent, pas un bailleur.
        $seizer = User::factory()->create();
        $seizerProfile = AgentProfile::query()->create(['user_id' => $seizer->id, 'agency_id' => $this->agency->id]);
        $seizedProperty = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $seizer->id]);
        $seizedLease = $this->leaseFor(User::factory()->create(), $seizedProperty, LeaseStatus::Active);

        // État des lieux conduit par le bailleur ; bien sans agence et son bail.
        $landlordInventory = Inventory::factory()->signed()->moveOut()->create([
            'lease_id' => $this->otherLease->id, 'property_id' => $this->otherProperty->id,
            'tenant_id' => $this->otherLease->tenant_id, 'conducted_by' => $this->landlord->id,
        ]);
        $private = User::factory()->create();
        $privateProperty = Property::factory()->create(['agency_id' => null, 'user_id' => $private->id]);
        $privateLease = $this->leaseFor($this->tenant, $privateProperty, LeaseStatus::Active);

        $landlordProfile = OwnerProfile::query()->where('user_id', $this->landlord->id)->sole();
        $this->personas = [
            'bailleur' => [$this->landlord, [null, $landlordProfile]],
            'bailleur bloqué' => [$blocked, [null, $blockedProfile]],
            'profil supprimé' => [$gone, [null]],
            'locataire' => [$this->tenant, [null]],
            'autre locataire' => [$this->otherTenant, [null]],
            'agent' => [$this->agent, [null, AgentProfile::query()->where('user_id', $this->agent->id)->sole()]],
            'admin' => [$this->admin, [null]],
            'délégué' => [$delegate, [null, $delegateProfile]],
            'double casquette' => [$double, [null, $doubleAgent, $doubleOwner]],
            'agent saisisseur' => [$seizer, [null, $seizerProfile]],
            'particulier' => [$private, [null]],
        ];

        $this->targets = [
            'bail' => $this->lease, 'autre bail' => $this->otherLease, 'bail brouillon' => $this->draftLease,
            'bail du bloqué' => $blockedLease, 'bail de B' => $doubleLease, 'bail saisi' => $seizedLease, 'bail sans agence' => $privateLease,
            'bien' => $this->property, 'autre bien' => $this->otherProperty, 'bien du bloqué' => $blockedProperty,
            'bien du supprimé' => $goneProperty, 'bien de B' => $doubleProperty, 'bien saisi' => $seizedProperty, 'bien sans agence' => $privateProperty,
            'edl signé' => $this->signedInventory, 'edl brouillon' => $this->draftInventory, 'edl du bailleur' => $landlordInventory,
            'fiche client' => Customer::query()->findOrFail($this->lease->tenant_id),
        ];
    }

    /** @return array<string, array<string, bool>> cible → capacité → verdict */
    private function verdicts(User $who, ?Model $profile): array
    {
        $user = User::query()->findOrFail($who->id);
        request()->attributes->set('active_profile', $profile?->fresh());
        $policy = app(DocumentPolicy::class);

        $out = [];
        foreach ($this->targets as $key => $target) {
            $target = $target::query()->findOrFail($target->getKey());
            $target->loadMissing(match (true) {
                $target instanceof Lease, $target instanceof Inventory => ['property', 'tenant'],
                default => [],
            });
            $row = ['reads' => $policy->readsTarget($user, $target)];
            if ($target instanceof Lease || $target instanceof Inventory) {
                $row['view'] = Gate::forUser($user)->allows('view', $target);
            }
            if ($target instanceof Lease || $target instanceof Property) {
                $row['attachTo'] = Gate::forUser($user)->allows('attachTo', [Document::class, $target]);
            }
            if ($target instanceof Lease) {
                $row['receipts'] = DocumentPdfController::mayReadReceipts($user, $target);
            }
            $out[$key] = $row;
        }
        request()->attributes->remove('active_profile');

        return $out;
    }

    public function test_priming_changes_no_verdict(): void
    {
        $agencies = [$this->agency->id, $this->agencyB->id];
        $granted = 0;
        $refused = 0;

        foreach ($this->personas as $name => [$user, $profiles]) {
            foreach ($profiles as $profile) {
                $context = $name.' / '.($profile === null ? 'sans profil actif' : class_basename($profile));
                $plain = $this->verdicts($user, $profile);
                $primed = MembershipCapabilityResolver::primed([$user->id], $agencies, fn () => $this->verdicts($user, $profile));

                $this->assertSame($plain, $primed, $context);
                array_walk_recursive($plain, function (bool $v) use (&$granted, &$refused): void {
                    $v ? $granted++ : $refused++;
                });
            }
        }

        // Le décor sépare : des verdicts des deux sens, et ceux qui distinguent les portées.
        $this->assertGreaterThan(30, $granted);
        $this->assertGreaterThan(30, $refused);
    }

    /** Les verdicts qui séparent les portées sont ceux qu'on attend — sans eux, la parité serait vide. */
    public function test_the_discriminating_verdicts_are_the_expected_ones(): void
    {
        [$blocked] = $this->personas['bailleur bloqué'];
        [$gone] = $this->personas['profil supprimé'];
        [$delegate] = $this->personas['délégué'];
        [$seizer] = $this->personas['agent saisisseur'];

        $this->assertTrue($this->verdicts($blocked, null)['bien du bloqué']['reads']);
        $this->assertTrue($this->verdicts($blocked, null)['bail du bloqué']['view']);
        $this->assertFalse($this->verdicts($blocked, null)['bien du bloqué']['attachTo']);
        $this->assertFalse($this->verdicts($gone, null)['bien du supprimé']['reads']);
        $this->assertTrue($this->verdicts($delegate, $this->personas['délégué'][1][1])['bail']['view']);
        $this->assertTrue($this->verdicts($seizer, $this->personas['agent saisisseur'][1][1])['bail saisi']['view']);
        $this->assertTrue($this->verdicts($this->landlord, null)['edl du bailleur']['view']);
        $this->assertFalse($this->verdicts($this->tenant, null)['edl signé']['reads']);
        $this->assertTrue($this->verdicts($this->tenant, null)['bail sans agence']['receipts']);
    }

    /**
     * Par HTTP, sous l'amorce de `documents/generated` : le bailleur bloqué (il ne peut plus activer
     * son profil, donc pas de dossier « bien » au coffre) lit encore les générés de son bien, comme
     * `view` les lui ouvre.
     */
    public function test_the_blocked_landlord_reads_the_generated_entries_of_his_property(): void
    {
        [$blocked] = $this->personas['bailleur bloqué'];
        $lease = $this->targets['bail du bloqué'];

        $this->connecter($blocked);
        $paths = array_column($this->getJson("/api/documents/generated?target=property:{$lease->property_id}")->assertOk()->json('data'), 'download_path');

        $this->assertSame(["/api/leases/{$lease->id}/contract/pdf"], $paths);
        $this->get($paths[0])->assertOk();
    }

    /**
     * `documents/generated` vise une cible hors du profil actif : la double casquette, agent de A
     * (profil actif), lit son bien de B. Les agences de la cible sont amorcées : le même nombre de
     * requêtes pour 1 bail ou 7, états des lieux compris.
     */
    public function test_generated_entries_outside_the_active_agency_cost_the_same_whatever_the_leases(): void
    {
        [$double, [, $agentProfile]] = $this->personas['double casquette'];
        $property = $this->targets['bien de B'];

        // Un premier état des lieux : sans lui, le chargement de ses relations n'a pas lieu, et la
        // différence serait celle d'une liste vide, pas une pente.
        $first = $this->targets['bail de B'];
        Inventory::factory()->signed()->create(['lease_id' => $first->id, 'property_id' => $property->id, 'tenant_id' => $first->tenant_id, 'conducted_by' => $double->id]);

        $this->connecter($double, $agentProfile);
        $call = fn () => $this->getJson("/api/documents/generated?target=property:{$property->id}")->assertOk();
        $call();
        $one = $this->requetes($call);

        foreach (range(1, 6) as $_) {
            $lease = $this->leaseFor(User::factory()->create(), $property, LeaseStatus::Expired);
            Inventory::factory()->signed()->create(['lease_id' => $lease->id, 'property_id' => $property->id, 'tenant_id' => $lease->tenant_id, 'conducted_by' => $double->id]);
        }

        $this->assertCount(7 + 7, $call()->json('data'));
        $this->assertSame($one, $this->requetes($call));
    }
}
