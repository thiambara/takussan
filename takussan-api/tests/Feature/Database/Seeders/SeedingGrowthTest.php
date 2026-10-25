<?php

namespace Tests\Feature\Database\Seeders;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Profiles\AgentProfile;
use Database\Seeders\Support\ReferentialIntegrityChecker;
use Database\Seeders\Support\SeedingConfig;
use Database\Seeders\Support\Timeline;
use Database\Seeders\YearOfActivitySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-2378 — le seed dessine une vie d'agence : des agences d'âges et de tailles différents, une
 * activité qui monte, des arrivées et un départ, des fils et des notifications qui vieillissent.
 *
 * Mesuré le 2026-10-25 : quatre agences nées le même jour avec 214 biens chacune, toutes les équipes
 * arrivées le premier mois, 87 % des messages des fils de plus de six mois datés du dernier mois,
 * des notifications de six mois non lues à 47 %, et aucun auteur au journal d'activité.
 */
class SeedingGrowthTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_jeu_seme_raconte_la_vie_des_agences(): void
    {
        app()->instance(SeedingConfig::class, new SeedingConfig(
            agencies: 1,
            propertiesPerAgency: 60,
            customersPerAgency: 60,
            bookingsPerAgency: 15,
            leasesPerAgency: 30,
            maintenanceRequestsPerAgency: 10,
            conversationsPerAgency: 20,
            documentsPerAgency: 2,
            includeDemoUsers: false,
        ));
        config(['scout.driver' => null]);
        $this->seed(YearOfActivitySeeder::class);

        $violations = (new ReferentialIntegrityChecker)->violations();
        foreach (['visite_menee_par_un_agent_absent', 'bail_suivi_par_un_agent_absent', 'reservation_saisie_par_un_agent_absent', 'agence_individuelle_avec_un_agent'] as $invariant) {
            $this->assertSame(0, $violations[$invariant], $invariant);
        }

        // AC1 — ni deux dates de fondation, ni deux tailles égales ; l'agence individuelle est seule.
        $agences = Agency::query()->withCount('properties')->get();
        $this->assertGreaterThanOrEqual(4, $agences->count());
        $this->assertCount($agences->count(), $agences->pluck('founded_at')->map(fn ($d) => (string) $d)->unique());
        $this->assertCount($agences->count(), $agences->pluck('properties_count')->unique(), 'Deux agences ont le même nombre de biens.');
        $individuelle = $agences->firstWhere('kind', AgencyKind::Individual);
        $this->assertNotNull($individuelle);
        $this->assertSame(0, AgentProfile::query()->where('agency_id', $individuelle->id)->count());
        $this->assertGreaterThan(0, DB::table('leases')->where('agency_id', $individuelle->id)->count(), 'L\'agence individuelle n\'a aucune activité.');

        // AC2 — l'activité monte : le dernier tiers de la fenêtre a plus de biens que le premier.
        $tiers = Timeline::seedStart()->diffInSeconds(Timeline::seedEnd()) / 3;
        $premier = DB::table('properties')->whereBetween('created_at', [Timeline::seedStart(), Timeline::seedStart()->addSeconds((int) $tiers)])->count();
        $dernier = DB::table('properties')->whereBetween('created_at', [Timeline::seedEnd()->subSeconds((int) $tiers), Timeline::seedEnd()])->count();
        // Le double au moins : un tirage uniforme passe « dernier > premier » une fois sur deux, par le
        // seul hasard (vérifié par ablation) ; la croissance linéaire en donne environ cinq fois plus.
        $this->assertGreaterThanOrEqual(2 * $premier, $dernier, "Premier tiers {$premier}, dernier {$dernier}.");

        // AC3 — des arrivées chacun des six derniers mois, et un départ dont l'historique reste.
        for ($m = 0; $m < 6; $m++) {
            $this->assertGreaterThan(0, DB::table('users')
                ->whereBetween('created_at', [now()->subDays(30 * ($m + 1)), now()->subDays(30 * $m)])->count(), "Aucune arrivée il y a {$m} mois.");
        }
        // Les comptes clients suffisaient à tenir la boucle ci-dessus sans aucune arrivée dans l'équipe
        // (vérifié par ablation) : il faut aussi un agent arrivé dans les six derniers mois.
        $this->assertGreaterThan(0, AgentProfile::query()
            ->whereHas('user', fn ($q) => $q->where('created_at', '>', now()->subMonths(6)))->count(), 'Aucun agent arrivé dans les six derniers mois.');
        $parti = AgentProfile::query()->where('status', AgentProfileStatus::Suspended)->firstOrFail();
        $this->assertGreaterThan(0, DB::table('property_visits')->where('agent_id', $parti->user_id)->where('scheduled_at', '<', $parti->updated_at)->count());
        $this->assertSame(0, DB::table('property_visits')->where('agent_id', $parti->user_id)->where('scheduled_at', '>=', $parti->updated_at)->count());
        $this->assertSame(0, DB::table('users')->whereNull('last_login_at')->whereExists(fn ($q) => $q->from('agent_profiles')->whereColumn('agent_profiles.user_id', 'users.id'))->count());

        // AC4 — un fil ancien a son activité près de son ouverture, pas dans le dernier mois.
        $messages = DB::table('messages as m')
            ->join('conversations as c', 'c.id', '=', 'm.conversation_id')
            ->where('c.created_at', '<', now()->subMonths(6))
            ->selectRaw('count(*) AS total, count(*) FILTER (WHERE m.created_at > ?) AS recents', [now()->subDays(30)])
            ->first();
        $this->assertGreaterThan(20, $messages->total);
        $this->assertLessThan(0.3, $messages->recents / $messages->total, "{$messages->recents} messages récents sur {$messages->total}.");

        // AC5 — une notification ancienne est lue ; une récente l'est moins souvent.
        $nonLues = fn ($q) => DB::table('app_notifications')->where($q)->selectRaw('count(*) AS total, count(*) FILTER (WHERE read_at IS NULL) AS non_lues')->first();
        $anciennes = $nonLues(fn ($q) => $q->where('created_at', '<', now()->subMonths(6)));
        $recentes = $nonLues(fn ($q) => $q->where('created_at', '>', now()->subDays(7)));
        $this->assertGreaterThan(0, $anciennes->total);
        $this->assertGreaterThan(0, $recentes->total);
        $this->assertLessThan(0.1, $anciennes->non_lues / $anciennes->total);
        $this->assertLessThan($recentes->non_lues / $recentes->total, $anciennes->non_lues / $anciennes->total);
        $this->assertGreaterThan(0, DB::table('app_notifications')->where('code', 'lease_payment.overdue_landlord')->count(), 'Aucune relance d\'impayé.');

        // AC6 — le journal d'activité nomme un auteur pour plus de la moitié de ses lignes.
        $journal = DB::table('activity_log')->selectRaw('count(*) AS total, count(causer_id) AS avec_auteur')->first();
        $this->assertGreaterThan(0.5, $journal->avec_auteur / $journal->total, "{$journal->avec_auteur} lignes avec auteur sur {$journal->total}.");
    }
}
