<?php

namespace Tests\Feature\Api\Me;

use App\Models\Agency;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Visit\VisitSchedulingService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2847 (ADR-0116 § 5) — `GET /api/me/profiles?include=activity` : les compteurs de l'« Aujourd'hui »
 * de chaque espace, calculés comme si ce profil était actif.
 */
class MeProfilesActivityTest extends TestCase
{
    use RefreshDatabase;

    private Agency $dakar;

    private Agency $thies;

    protected function setUp(): void
    {
        parent::setUp();
        $this->dakar = Agency::factory()->create(['name' => 'Dakar Immo']);
        $this->thies = Agency::factory()->create(['name' => 'Thiès Properties']);
    }

    private function midiADakar(int $jours = 0): CarbonImmutable
    {
        return CarbonImmutable::now(VisitSchedulingService::TIMEZONE)->startOfDay()->addDays($jours)->setTime(12, 0)->utc();
    }

    /** `$demandes` non traitées, `$visites` du jour, plus du bruit qui ne doit jamais compter. */
    private function activiteDe(Agency $agence, int $demandes, int $visites): void
    {
        $bien = Property::factory()->create(['agency_id' => $agence->id]);
        PropertyContactLead::factory()->count($demandes)->create(['property_id' => $bien->id, 'agency_id' => $agence->id]);
        PropertyContactLead::factory()->handled()->create(['property_id' => $bien->id, 'agency_id' => $agence->id]);
        PropertyVisit::factory()->count($visites)->create(['property_id' => $bien->id, 'status' => VisitStatus::Scheduled, 'scheduled_at' => $this->midiADakar()]);
        PropertyVisit::factory()->create(['property_id' => $bien->id, 'status' => VisitStatus::Scheduled, 'scheduled_at' => $this->midiADakar(1)]);
    }

    /** @return array{0: User, 1: AgentProfile, 2: AgentProfile} */
    private function agentDesDeuxAgences(): array
    {
        $user = User::factory()->create();
        $aDakar = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $this->dakar->id]);
        $aThies = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $this->thies->id]);

        return [$user, $aDakar, $aThies];
    }

    /** @return array<string, array<string, int>> */
    private function activite(User $user, ?string $actif = null): array
    {
        Sanctum::actingAs($user);
        $reponse = $this->withHeaders($actif !== null ? ['X-Profile-Id' => $actif] : [])
            ->getJson('/api/me/profiles?include=activity')
            ->assertOk();

        // L'ordre des profils n'est pas le contrat : trié par clé, le test ne dépend plus de l'ordre de lecture.
        return collect($reponse->json('data'))->mapWithKeys(fn (array $p) => [$p['id'] => $p['activity']])->sortKeys(SORT_NATURAL)->all();
    }

    public function test_ac3_l_agent_de_deux_agences_lit_les_compteurs_propres_a_chaque_espace(): void
    {
        [$user, $aDakar, $aThies] = $this->agentDesDeuxAgences();
        $this->activiteDe($this->dakar, demandes: 4, visites: 2);
        $this->activiteDe($this->thies, demandes: 1, visites: 3);

        $attendu = [
            "agent:{$aDakar->id}" => ['unhandled_leads' => 4, 'visits_today' => 2],
            "agent:{$aThies->id}" => ['unhandled_leads' => 1, 'visits_today' => 3],
        ];

        // Le même résultat quel que soit l'espace actif : chaque ligne se calcule sous SON profil.
        $this->assertSame($attendu, $this->activite($user, "agent:{$aDakar->id}"));
        $this->assertSame($attendu, $this->activite($user, "agent:{$aThies->id}"));
        $this->assertSame($attendu, $this->activite($user));
    }

    public function test_ac3_le_bailleur_lit_ses_biens_et_ses_loyers_en_retard_dans_l_agence_du_profil(): void
    {
        $user = User::factory()->create();
        $profil = OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $this->dakar->id]);
        $biens = Property::factory()->count(2)->create(['agency_id' => $this->dakar->id, 'user_id' => $user->id]);
        $bail = Lease::factory()->create(['property_id' => $biens[0]->id, 'agency_id' => $this->dakar->id, 'landlord_id' => $user->id]);
        LeasePayment::factory()->create(['lease_id' => $bail->id, 'due_date' => now()->subDays(10)->toDateString(), 'status' => PaymentStatus::Pending]);
        LeasePayment::factory()->paid()->create(['lease_id' => $bail->id, 'due_date' => now()->subDays(40)->toDateString()]);
        // Bruit : le bien d'un autre bailleur de la même agence.
        Property::factory()->create(['agency_id' => $this->dakar->id]);

        $this->assertSame(
            ["owner:{$profil->id}" => ['properties' => 2, 'rent_overdue' => 1]],
            $this->activite($user),
        );
    }

    /** Bailleur de deux agences : chaque espace ne compte que les biens de son agence. */
    public function test_le_bailleur_de_deux_agences_lit_chaque_portefeuille_a_part(): void
    {
        $user = User::factory()->create();
        $aDakar = OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $this->dakar->id]);
        $aThies = OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $this->thies->id]);
        $biensADakar = Property::factory()->count(2)->create(['agency_id' => $this->dakar->id, 'user_id' => $user->id]);
        Property::factory()->create(['agency_id' => $this->thies->id, 'user_id' => $user->id]);
        $bail = Lease::factory()->create(['property_id' => $biensADakar[0]->id, 'agency_id' => $this->dakar->id, 'landlord_id' => $user->id]);
        LeasePayment::factory()->create(['lease_id' => $bail->id, 'due_date' => now()->subDays(10)->toDateString(), 'status' => PaymentStatus::Pending]);

        $this->assertSame([
            "owner:{$aDakar->id}" => ['properties' => 2, 'rent_overdue' => 1],
            "owner:{$aThies->id}" => ['properties' => 1, 'rent_overdue' => 0],
        ], $this->activite($user)); // $aDakar est créé avant $aThies : son identifiant trie en premier.
    }

    /** Le prestataire (profil sans agence) à côté d'un profil d'agent : chacun ses compteurs. */
    public function test_le_prestataire_qui_est_aussi_agent_lit_ses_interventions_du_jour(): void
    {
        $user = User::factory()->create();
        $sp = ServiceProviderProfile::factory()->create(['user_id' => $user->id]);
        $agent = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $this->dakar->id]);
        $this->activiteDe($this->dakar, demandes: 2, visites: 1);
        $bien = Property::factory()->create(['agency_id' => $this->thies->id]);
        // L'intervention hors de son agence d'agent ne lui reste que par une collaboration active (TCK-592).
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $sp->id,
            'agency_id' => $this->thies->id,
            'status' => CollaborationStatus::Active->value,
            'started_at' => now()->subMonth()->toDateString(),
        ]);
        $base = ['property_id' => $bien->id, 'assigned_to' => $user->id, 'accepted_at' => now()];
        MaintenanceRequest::factory()->create([...$base, 'status' => MaintenanceStatus::Assigned, 'scheduled_at' => $this->midiADakar()]);
        MaintenanceRequest::factory()->create([...$base, 'status' => MaintenanceStatus::Completed, 'scheduled_at' => $this->midiADakar()]);
        MaintenanceRequest::factory()->create([...$base, 'status' => MaintenanceStatus::Assigned, 'scheduled_at' => $this->midiADakar(2)]);

        $activite = $this->activite($user);

        $this->assertSame(['interventions_today' => 1], $activite["service_provider:{$sp->id}"]);
        $this->assertSame(['unhandled_leads' => 2, 'visits_today' => 1], $activite["agent:{$agent->id}"]);
    }

    public function test_sans_l_inclusion_la_cle_est_absente(): void
    {
        [$user] = $this->agentDesDeuxAgences();
        Sanctum::actingAs($user);

        foreach ($this->getJson('/api/me/profiles')->assertOk()->json('data') as $ligne) {
            $this->assertArrayNotHasKey('activity', $ligne);
        }
    }

    /**
     * Pas de N+1 : le nombre de requêtes ne dépend pas du nombre d'objets (1 ou 6 de chaque), et
     * reste borné par profil (mesuré pour 1 puis 4 profils).
     */
    public function test_le_nombre_de_requetes_ne_depend_pas_du_nombre_d_objets(): void
    {
        [$user] = $this->agentDesDeuxAgences();
        $this->activiteDe($this->dakar, demandes: 1, visites: 1);
        // Une première lecture chauffe ce que le test garde d'une requête à l'autre (le compte
        // authentifié et ses profils, le cache des capacités de rôle) : seule la deuxième se compare.
        $this->requetes($user);
        $peu = $this->requetes($user);

        $this->activiteDe($this->dakar, demandes: 6, visites: 6);
        $this->activiteDe($this->thies, demandes: 6, visites: 6);
        $this->assertSame($peu, $this->requetes($user));
    }

    public function test_le_nombre_de_requetes_reste_borne_par_profil(): void
    {
        $user = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $this->dakar->id]);
        $this->requetes($user);
        $sansActivite = $this->requetes($user, include: false);
        $unProfil = $this->requetes($user);

        $autre = Agency::factory()->create();
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $this->thies->id]);
        OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $autre->id]);
        ServiceProviderProfile::factory()->create(['user_id' => $user->id]);
        $user->unsetRelations();
        $this->requetes($user);
        $quatreProfils = $this->requetes($user);

        $parProfil = $unProfil - $sansActivite;
        $this->assertLessThanOrEqual(12, $parProfil);
        $this->assertLessThanOrEqual($sansActivite + 4 * 12, $quatreProfils);
    }

    private function requetes(User $user, bool $include = true): int
    {
        Sanctum::actingAs($user);
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->getJson('/api/me/profiles'.($include ? '?include=activity' : ''))->assertOk();
        $n = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $n;
    }
}
