<?php

namespace Tests\Unit\Services\Membership;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\Capability;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2739 (AC1) — l'amorce de {@see MembershipCapabilityResolver::primed()} charge les rôles des profils
 * actifs, les collaborations de prestataire, les délégations en vigueur, les rôles système et le niveau
 * de plateforme de tous ses couples. Elle doit juger EXACTEMENT comme le jugement unitaire : capacité par
 * capacité, pour chaque membre du décor, dans l'agence de l'amorce et dans une agence qui n'en est pas.
 *
 * Le décor porte, pour chaque portée, une ligne qu'elle écarte : un profil suspendu dont le rôle
 * accorde tout, une collaboration en pause, un profil de prestataire supprimé, une délégation échue
 * (par l'horloge et par le statut), un délégué sans profil actif, un délégant dépouillé, un profil
 * super-admin révoqué, un délégant hors de l'amorce.
 */
class MembershipCapabilityResolverPrimedParityTest extends TestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private const AUSSI_HORS_AGENCE = ['agent système', 'prestataire', 'super-admin', 'délégué en vigueur'];

    /**
     * Les capacités que juge la boucle d'`allows()`. L'amorce porte des IDENTIFIANTS de rôle, de
     * délégation et de niveau, jamais un verdict par capacité : la capacité n'agit qu'en aval, par
     * `AgencyRoleCapabilityCache`, que l'amorce ne touche pas. Six capacités qui départagent le décor
     * (chaque portée y écarte un verdict « vrai ») éprouvent donc l'amorce autant que les 49 : mesuré
     * par le vérificateur de TCK-2739, les ablations P1 à P6 rougissent à l'identique, pour 5 s au lieu
     * de 15. La boucle complète reste dans le second test (`filterAllowed`).
     */
    private const CAPACITES_JUGEES = [
        Capability::TeamInvite, Capability::TeamRemove, Capability::MaintenanceClose,
        Capability::MaintenanceAssign, Capability::PropertiesUpdateOwn, Capability::ReportsViewGlobal,
    ];

    private Agency $agency;

    private Agency $autre;

    /** @var array<string, User> */
    private array $membres = [];

    /** @var array<string, User> jugés, mais hors de la liste d'utilisateurs de l'amorce */
    private array $horsAmorce = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create(['primary_admin_id' => null]);
        $this->autre = Agency::factory()->create(['primary_admin_id' => null]);
        $tout = Capability::cases();

        $this->membres['agent système'] = $this->agencyAgent($this->agency);
        $this->membres['admin système'] = $this->agencyAdmin($this->agency);
        $this->membres['admin sans team.invite'] = $this->adminWithout($this->agency, Capability::TeamInvite, Capability::ReportsViewGlobal);
        $this->membres['agent avec team.invite'] = $this->agentWith($this->agency, Capability::TeamInvite);

        // Un agent SUSPENDU dont le rôle personnalisé accorde tout : `active()` l'écarte.
        $suspendu = $this->memberWithRoleFor(AgencyRoleBaseType::Agent, $tout);
        AgentProfile::query()->where('user_id', $suspendu->id)->update(['status' => AgentProfileStatus::Suspended->value]);
        $this->membres['agent suspendu'] = $suspendu;

        // Deux profils dans l'agence : un agent système et un bailleur actif (rôle propriétaire).
        $double = $this->agencyAgent($this->agency);
        OwnerProfile::factory()->create(['user_id' => $double->id, 'agency_id' => $this->agency->id]);
        $this->membres['agent et bailleur'] = $double;
        $this->membres['bailleur actif'] = User::factory()->withOwnerProfile($this->agency)->create();
        $bloque = User::factory()->withOwnerProfile($this->agency)->create();
        OwnerProfile::query()->where('user_id', $bloque->id)->update(['status' => OwnerProfileStatus::Blocked->value]);
        $this->membres['bailleur bloqué'] = $bloque;
        // TCK-2753 (ADR-0108 § 5) — le bailleur PARTI n'écrit pas plus que le bloqué, amorce comprise.
        $parti = User::factory()->withOwnerProfile($this->agency)->create();
        OwnerProfile::query()->where('user_id', $parti->id)->update(['status' => OwnerProfileStatus::Inactive->value]);
        $this->membres['bailleur parti'] = $parti;

        // Prestataires : une collaboration active à rôle restreint ; une en pause à rôle large ; un
        // profil de prestataire SUPPRIMÉ dont la collaboration reste active.
        $prestataire = User::factory()->create();
        $profil = ServiceProviderProfile::factory()->create(['user_id' => $prestataire->id]);
        $this->collaboration($profil, $this->agency, [Capability::MaintenanceClose], CollaborationStatus::Active);
        $this->collaboration($profil, $this->autre, [Capability::MaintenanceAssign], CollaborationStatus::Active);
        $this->membres['prestataire'] = $prestataire;
        $enPause = User::factory()->create();
        $this->collaboration(ServiceProviderProfile::factory()->create(['user_id' => $enPause->id]), $this->agency, $tout, CollaborationStatus::Paused);
        $this->membres['prestataire en pause'] = $enPause;
        $collaborationSupprimee = User::factory()->create();
        $this->collaboration(ServiceProviderProfile::factory()->create(['user_id' => $collaborationSupprimee->id]), $this->agency, $tout, CollaborationStatus::Active);
        ServiceProviderAgencyCollaboration::query()->whereHas('serviceProviderProfile', fn ($q) => $q->where('user_id', $collaborationSupprimee->id))->firstOrFail()->delete();
        $this->membres['prestataire à collaboration supprimée'] = $collaborationSupprimee;
        $supprime = User::factory()->create();
        $profilSupprime = ServiceProviderProfile::factory()->create(['user_id' => $supprime->id]);
        $this->collaboration($profilSupprime, $this->agency, $tout, CollaborationStatus::Active);
        $profilSupprime->delete();
        $this->membres['prestataire supprimé'] = $supprime;

        // Délégations. Le délégué est un agent au rôle VIDE : tout ce qu'il obtient en plus vient d'elle.
        $admin = $this->membres['admin système'];
        $this->membres['délégué en vigueur'] = $this->delegue($admin, 'agency_admin');
        $this->membres['délégué échu (horloge)'] = $this->delegue($admin, 'agency_admin', ['ends_at' => now()->subMinute()]);
        $this->membres['délégué échu (statut)'] = $this->delegue($admin, 'agency_admin', ['status' => RoleDelegationStatus::Expired, 'expired_at' => now()->subDay()]);
        $this->membres['délégué d’un dépouillé'] = $this->delegue($this->membres['admin sans team.invite'], 'agency_admin');
        $sansProfil = $this->delegue($admin, 'agency_admin');
        AgentProfile::query()->where('user_id', $sansProfil->id)->update(['status' => AgentProfileStatus::Suspended->value]);
        $this->membres['délégué sans profil actif'] = $sansProfil;
        $delegantHors = $this->agencyAdmin($this->agency);
        $this->horsAmorce['délégant hors amorce'] = $delegantHors;
        $this->membres['délégué d’un délégant hors amorce'] = $this->delegue($delegantHors, 'agency_admin');

        // Plateforme : un super-admin, un super-admin révoqué (agent de l'agence par ailleurs).
        $super = User::factory()->create();
        PlatformProfile::factory()->superAdmin()->create(['user_id' => $super->id]);
        $this->membres['super-admin'] = $super;
        $revoque = $this->agencyAgent($this->agency);
        PlatformProfile::factory()->superAdmin()->revoked()->create(['user_id' => $revoque->id]);
        $this->membres['super-admin révoqué'] = $revoque;

        $this->membres['sans profil'] = User::factory()->create();
    }

    public function test_allows_juge_pareil_avec_et_sans_amorce_capacite_par_capacite(): void
    {
        $resolver = app(MembershipCapabilityResolver::class);
        $juger = function () use ($resolver): array {
            $verdicts = [];
            foreach ([...$this->membres, ...$this->horsAmorce] as $nom => $user) {
                // L'autre agence n'est que dans la seconde amorce. Quelques membres suffisent à prouver
                // qu'un couple hors amorce ne lit pas l'amorce, et qu'une amorce de deux agences ne les
                // confond pas (le prestataire y collabore) ; les juger tous doublerait la durée sans rien
                // éprouver de plus.
                $agences = in_array($nom, self::AUSSI_HORS_AGENCE, true) ? [$this->agency, $this->autre] : [$this->agency];
                foreach ($agences as $agency) {
                    foreach (self::CAPACITES_JUGEES as $capability) {
                        $verdicts["{$nom} @ {$agency->id} : {$capability->value}"] = $resolver->allows($user, $capability, $agency);
                    }
                }
            }

            return $verdicts;
        };

        $seul = $juger();
        $amorce = MembershipCapabilityResolver::primed(
            collect($this->membres)->pluck('id'),
            [$this->agency->id],
            $juger,
        );

        $this->assertSame([], array_keys(array_diff_assoc($amorce, $seul)), 'verdicts qui changent sous l’amorce');
        $this->assertSame(count($seul), count($amorce));

        // Les appelants réels amorcent plusieurs agences : le prestataire y a des verdicts opposés, une
        // table indexée sans l'agence les confondrait.
        $deuxAgences = MembershipCapabilityResolver::primed(collect($this->membres)->pluck('id'), [$this->agency->id, $this->autre->id], $juger);
        $this->assertSame([], array_keys(array_diff_assoc($deuxAgences, $seul)), 'verdicts qui changent sous l’amorce de deux agences');

        // Le décor discrimine : chaque portée écarte quelque chose qui, sans elle, accorderait.
        $tient = fn (string $nom, Capability $c, ?Agency $a = null): bool => $seul["{$nom} @ ".($a ?? $this->agency)->id." : {$c->value}"];
        $this->assertTrue($tient('délégué en vigueur', Capability::TeamInvite));
        $this->assertFalse($tient('délégué échu (horloge)', Capability::TeamInvite));
        $this->assertFalse($tient('délégué échu (statut)', Capability::TeamInvite));
        $this->assertFalse($tient('délégué sans profil actif', Capability::TeamInvite));
        $this->assertFalse($tient('délégué d’un dépouillé', Capability::TeamInvite));
        $this->assertTrue($tient('délégué d’un dépouillé', Capability::TeamRemove));
        $this->assertTrue($tient('délégué d’un délégant hors amorce', Capability::TeamInvite));
        $this->assertFalse($tient('agent suspendu', Capability::TeamInvite));
        $this->assertTrue($tient('agent avec team.invite', Capability::TeamInvite));
        $this->assertFalse($tient('admin sans team.invite', Capability::TeamInvite));
        $this->assertTrue($tient('prestataire', Capability::MaintenanceClose));
        $this->assertFalse($tient('prestataire', Capability::MaintenanceAssign));
        $this->assertTrue($tient('prestataire', Capability::MaintenanceAssign, $this->autre));
        $this->assertFalse($tient('prestataire supprimé', Capability::MaintenanceClose));
        $this->assertFalse($tient('prestataire en pause', Capability::MaintenanceClose));
        $this->assertFalse($tient('prestataire à collaboration supprimée', Capability::MaintenanceClose));
        $this->assertTrue($tient('super-admin', Capability::TeamInvite, $this->autre));
        $this->assertFalse($tient('super-admin révoqué', Capability::TeamInvite));
        $this->assertTrue($tient('agent et bailleur', Capability::PropertiesUpdateOwn));
        $this->assertFalse($tient('bailleur bloqué', Capability::PropertiesUpdateOwn));
        $this->assertFalse($tient('bailleur parti', Capability::PropertiesUpdateOwn));
    }

    public function test_filter_allowed_et_allows_directly_jugent_pareil_avec_et_sans_amorce(): void
    {
        $resolver = app(MembershipCapabilityResolver::class);
        $juger = function () use ($resolver): array {
            $verdicts = [];
            foreach ($this->membres as $nom => $user) {
                $verdicts[$nom] = [
                    'filtre' => array_map(fn (Capability $c): string => $c->value, $resolver->filterAllowed($user, Capability::cases(), $this->agency)),
                ];
                if (str_starts_with($nom, 'délégué')) {
                    $verdicts[$nom]['propre'] = array_values(array_filter(Capability::cases(), fn (Capability $c): bool => $resolver->allowsDirectly($user, $c, $this->agency)));
                }
            }

            return $verdicts;
        };

        $seul = $juger();
        $this->assertEquals($seul, MembershipCapabilityResolver::primed(collect($this->membres)->pluck('id'), [$this->agency->id], $juger));
        $this->assertContains(Capability::TeamInvite->value, $seul['délégué en vigueur']['filtre']);
        $this->assertNotContains(Capability::TeamInvite, $seul['délégué en vigueur']['propre']);
    }

    /** @param  array<int, Capability>  $capabilities */
    private function memberWithRoleFor(AgencyRoleBaseType $type, array $capabilities): User
    {
        $role = AgencyRole::factory()->ofType($type)->withCapabilities($capabilities)->create(['agency_id' => $this->agency->id]);
        $user = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $this->agency->id, 'agency_role_id' => $role->id]);

        return $user;
    }

    /** @param  array<int, Capability>  $capabilities */
    private function collaboration(ServiceProviderProfile $profil, Agency $agency, array $capabilities, CollaborationStatus $statut): void
    {
        $role = AgencyRole::factory()->ofType(AgencyRoleBaseType::ServiceProvider)->withCapabilities($capabilities)->create(['agency_id' => $agency->id]);
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $profil->id,
            'agency_id' => $agency->id,
            'status' => $statut->value,
            'started_at' => now()->subMonth(),
            'agency_role_id' => $role->id,
        ]);
    }

    /** @param  array<string, mixed>  $etat */
    private function delegue(User $delegant, string $role, array $etat = []): User
    {
        $delegue = $this->memberWithRoleFor(AgencyRoleBaseType::Agent, []);
        RoleDelegation::factory()->forRole($role)->create([
            'user_id' => $delegue->id,
            'delegator_id' => $delegant->id,
            'agency_id' => $this->agency->id,
        ] + $etat);

        return $delegue;
    }
}
