<?php

namespace Tests\Feature\Reporting;

use App\Models\Agency;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\ContactLeadChannel;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Models\RoleDelegation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2623 (ADR-0096) — « Équipe aujourd'hui » : par agent ACTIF de l'agence, les visites du jour (heure
 * de Dakar), les demandes de contact à traiter et l'absence en cours, en requêtes groupées.
 */
class TeamTodayTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private Property $property;

    private ?string $fuseauDOrigine = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-11-10 10:00:00', 'Africa/Dakar'));
        $this->agency = Agency::factory()->create();
        $this->property = Property::factory()->create(['agency_id' => $this->agency->id]);
    }

    protected function tearDown(): void
    {
        // Le test « serveur hors de Dakar » déplace le fuseau du processus : il ne doit pas fuir.
        if ($this->fuseauDOrigine !== null) {
            date_default_timezone_set($this->fuseauDOrigine);
            config(['app.timezone' => $this->fuseauDOrigine]);
            $this->fuseauDOrigine = null;
        }
        parent::tearDown();
    }

    private function agent(string $prenom, string $nom): User
    {
        $user = $this->agencyAgent($this->agency);
        $user->forceFill(['first_name' => $prenom, 'last_name' => $nom])->save();

        return $user;
    }

    /** Une visite, l'heure écrite à l'heure de Dakar. */
    private function visite(User $agent, string $aDakar, VisitStatus $status = VisitStatus::Confirmed, ?Property $bien = null): PropertyVisit
    {
        return PropertyVisit::factory()->create([
            'property_id' => ($bien ?? $this->property)->id,
            'agent_id' => $agent->id,
            'status' => $status,
            'scheduled_at' => Carbon::parse($aDakar, 'Africa/Dakar')->setTimezone(config('app.timezone')),
        ]);
    }

    private function demande(User $destinataire, array $etat = []): PropertyContactLead
    {
        return PropertyContactLead::factory()->create(array_merge([
            'property_id' => $this->property->id,
            'agency_id' => $this->agency->id,
            'recipient_user_id' => $destinataire->id,
        ], $etat));
    }

    private function absence(User $absent, User $remplacant, array $etat = []): RoleDelegation
    {
        return RoleDelegation::factory()->create(array_merge([
            'user_id' => $remplacant->id,
            'replaces_user_id' => $absent->id,
            'delegator_id' => $absent->id,
            'agency_id' => $this->agency->id,
            'role' => RoleDelegation::ABSENCE_ROLE,
            'status' => RoleDelegationStatus::Active,
            'starts_at' => Carbon::parse('2026-11-08 00:00:00', 'Africa/Dakar'),
            'ends_at' => Carbon::parse('2026-11-14 23:59:59', 'Africa/Dakar'),
        ], $etat));
    }

    private function url(?Agency $agency = null): string
    {
        return '/api/agencies/'.($agency ?? $this->agency)->id.'/team-today';
    }

    /** @return array<int, array<string, mixed>> */
    private function lignes(): array
    {
        return collect($this->getJson($this->url())->assertOk()->json('data.agents'))->keyBy('user_id')->all();
    }

    /** AC1. */
    public function test_ac1_visites_du_jour_demandes_ouvertes_et_absence_en_cours(): void
    {
        $awa = $this->agent('Awa', 'Ndiaye');
        $ibrahima = $this->agent('Ibrahima', 'Sow');
        $khady = $this->agent('Khady', 'Fall');

        $this->visite($awa, '2026-11-10 15:00:00');
        $this->visite($awa, '2026-11-10 09:00:00', VisitStatus::Scheduled);
        // Ni annulée, ni manquée, ni d'une autre agence : aucune ne compte.
        $this->visite($awa, '2026-11-10 11:00:00', VisitStatus::Cancelled);
        $this->visite($awa, '2026-11-10 12:00:00', VisitStatus::NoShow);
        $this->visite($awa, '2026-11-10 13:00:00', bien: Property::factory()->create(['agency_id' => Agency::factory()->create()->id]));

        $this->demande($awa);
        // Traitée, simple clic WhatsApp, ou adressée à une autre : aucune ne compte.
        $this->demande($awa, ['handled_at' => now()]);
        $this->demande($awa, ['channel' => ContactLeadChannel::Whatsapp, 'name' => null, 'email' => null, 'phone' => null, 'message' => null]);
        $this->demande($khady);

        $this->absence($ibrahima, $khady);

        $this->actingAsApi($this->agencyAdmin($this->agency));
        $reponse = $this->getJson($this->url())->assertOk();
        $lignes = collect($reponse->json('data.agents'))->keyBy('user_id');

        $reponse->assertJsonPath('data.date', '2026-11-10');
        $this->assertSame(['user_id', 'name', 'avatar_url', 'visits_today_count', 'first_visit_at', 'open_leads_count', 'current_absence'], array_keys($lignes[$awa->id]));
        $this->assertSame('Awa Ndiaye', $lignes[$awa->id]['name']);
        $this->assertSame(2, $lignes[$awa->id]['visits_today_count']);
        $this->assertSame('2026-11-10T09:00:00+00:00', $lignes[$awa->id]['first_visit_at']);
        $this->assertSame(1, $lignes[$awa->id]['open_leads_count']);
        $this->assertNull($lignes[$awa->id]['current_absence']);

        $this->assertSame(0, $lignes[$ibrahima->id]['visits_today_count']);
        $this->assertNull($lignes[$ibrahima->id]['first_visit_at']);
        $this->assertSame('Khady Fall', $lignes[$ibrahima->id]['current_absence']['substitute']['name']);
        $this->assertSame($khady->id, $lignes[$ibrahima->id]['current_absence']['substitute']['id']);
        $this->assertSame('2026-11-14T23:59:59+00:00', $lignes[$ibrahima->id]['current_absence']['ends_at']);

        $this->assertSame(1, $lignes[$khady->id]['open_leads_count']);
    }

    /**
     * AC2 — les bornes du jour : la veille à 23:30 n'en est pas, minuit et demi en est, le lendemain à
     * minuit n'en est plus. (Le ticket écrivait « 23:30 à Dakar = 00:30 UTC » : Dakar EST à UTC+0.)
     */
    public function test_ac2_les_bornes_du_jour_a_dakar(): void
    {
        $agent = $this->agent('Moussa', 'Diop');
        $this->visite($agent, '2026-11-09 23:30:00');
        $this->visite($agent, '2026-11-10 00:30:00');
        $this->visite($agent, '2026-11-10 23:59:00');
        $this->visite($agent, '2026-11-11 00:00:00');

        $this->actingAsApi($this->agencyAdmin($this->agency));
        $ligne = $this->lignes()[$agent->id];

        $this->assertSame(2, $ligne['visits_today_count']);
        $this->assertSame('2026-11-10T00:30:00+00:00', $ligne['first_visit_at']);
    }

    /**
     * AC2 (ablation) — « aujourd'hui » est le jour de DAKAR, même quand le serveur tourne ailleurs : à
     * 20:00 à Dakar, il est déjà le 11 à Tokyo, et la visite de 10:00 à Dakar est bien d'aujourd'hui.
     */
    public function test_le_jour_est_celui_de_dakar_meme_si_le_serveur_n_y_est_pas(): void
    {
        $this->fuseauDOrigine = date_default_timezone_get();
        date_default_timezone_set('Asia/Tokyo');
        config(['app.timezone' => 'Asia/Tokyo']);
        $this->travelTo(Carbon::parse('2026-11-10 20:00:00', 'Africa/Dakar')->setTimezone('Asia/Tokyo'));

        $agent = $this->agent('Moussa', 'Diop');
        $this->visite($agent, '2026-11-10 10:00:00');
        $this->visite($agent, '2026-11-11 10:00:00');

        $this->actingAsApi($this->agencyAdmin($this->agency));
        $reponse = $this->getJson($this->url())->assertOk();
        $ligne = collect($reponse->json('data.agents'))->keyBy('user_id')[$agent->id];

        $reponse->assertJsonPath('data.date', '2026-11-10');
        $this->assertSame(1, $ligne['visits_today_count']);
        $this->assertSame('2026-11-10T10:00:00+00:00', $ligne['first_visit_at']);
    }

    /** Une absence finie, révoquée ou à venir n'est pas « en cours » : la règle du cycle de vie (`active()`). */
    public function test_seule_l_absence_en_cours_est_rendue(): void
    {
        $absent = $this->agent('Awa', 'Ndiaye');
        $remplacant = $this->agent('Khady', 'Fall');
        $this->absence($absent, $remplacant, ['status' => RoleDelegationStatus::Expired, 'ends_at' => now()->subDay()]);
        $this->absence($absent, $remplacant, ['status' => RoleDelegationStatus::Revoked]);
        $this->absence($absent, $remplacant, [
            'status' => RoleDelegationStatus::Scheduled,
            'starts_at' => now()->addDays(3),
            'ends_at' => now()->addDays(5),
        ]);

        $this->actingAsApi($this->agencyAdmin($this->agency));

        $this->assertNull($this->lignes()[$absent->id]['current_absence']);
    }

    /** AC5. */
    public function test_ac5_un_agent_recoit_403(): void
    {
        $agent = $this->agent('Awa', 'Ndiaye');

        $this->actingAsApi($agent)->getJson($this->url())->assertForbidden();
    }

    public function test_l_admin_d_une_autre_agence_recoit_403(): void
    {
        $this->agent('Awa', 'Ndiaye');

        $this->actingAsApi($this->agencyAdmin(Agency::factory()->create()))->getJson($this->url())->assertForbidden();
    }

    /** Même porte que `team-performance` : une agence `individual` n'a pas d'équipe. */
    public function test_une_agence_individuelle_recoit_403(): void
    {
        $agence = Agency::factory()->individual()->create();

        $this->actingAsApi($this->agencyAdmin($agence))->getJson($this->url($agence))
            ->assertForbidden()
            ->assertJsonPath('code', 'agency.standard_only');
    }

    public function test_un_agent_inactif_n_est_pas_dans_l_equipe(): void
    {
        $actif = $this->agent('Awa', 'Ndiaye');
        $suspendu = $this->agent('Moussa', 'Diop');
        AgentProfile::query()->where('user_id', $suspendu->id)->update(['status' => AgentProfileStatus::Suspended]);
        $this->visite($suspendu, '2026-11-10 09:00:00');

        $this->actingAsApi($this->agencyAdmin($this->agency));

        $this->assertSame([$actif->id], array_keys($this->lignes()));
    }

    /** Une requête par agrégat : le compte ne suit pas l'effectif (règle de `PortfolioMetrics`). */
    public function test_le_nombre_de_requetes_ne_suit_pas_l_effectif(): void
    {
        $admin = $this->agencyAdmin($this->agency);
        $compter = function (int $effectif) use ($admin): int {
            $agents = [];
            while (count($agents) < $effectif) {
                $agents[] = $this->agent('Agent', (string) count($agents));
            }
            foreach ($agents as $i => $agent) {
                $this->visite($agent, '2026-11-10 09:00:00');
                $this->demande($agent);
                $this->absence($agent, $agents[($i + 1) % $effectif]);
            }

            $this->app['auth']->forgetGuards();
            $this->actingAsApi($admin);
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson($this->url())->assertOk();
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            RoleDelegation::query()->delete();
            PropertyContactLead::query()->delete();
            PropertyVisit::query()->delete();
            AgentProfile::query()->where('agency_id', $this->agency->id)->delete();

            return $n;
        };

        // Une première lecture met en cache ce qui ne dépend pas de l'équipe (capacités du rôle).
        $this->actingAsApi($admin)->getJson($this->url())->assertOk();

        $this->assertSame($compter(2), $compter(6));
    }
}
