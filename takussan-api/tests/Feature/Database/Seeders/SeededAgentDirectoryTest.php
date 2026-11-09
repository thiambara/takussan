<?php

namespace Tests\Feature\Database\Seeders;

use App\Models\Enums\AgencyStatus;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Database\Seeders\Catalog\PropertySeeder;
use Database\Seeders\Support\SeedingConfig;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\YearOfActivitySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-2532 — la démo montre un annuaire d'agents EN EXERCICE.
 *
 * Mesuré le 2026-11-09 sur la base de dev semée : `GET /api/public/agents` → `total 0` depuis
 * TCK-2506. Tous les biens avaient pour titulaire (`properties.user_id`) un bailleur
 * (`PropertySeeder` ne tirait que des `OwnerProfile`), et l'annuaire ne liste plus d'office les
 * propriétaires. Le jeu est semé par le PIPELINE entier, à volume réduit : les baux qui suivent
 * font passer des biens en `rented`, et c'est le portefeuille public d'APRÈS qui compte.
 */
class SeededAgentDirectoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_l_annuaire_seme_montre_des_agents_en_exercice_et_un_proprietaire_qui_l_a_choisi(): void
    {
        app()->instance(SeedingConfig::class, new SeedingConfig(
            agencies: 1,
            propertiesPerAgency: 40,
            customersPerAgency: 10,
            bookingsPerAgency: 5,
            leasesPerAgency: 10,
            maintenanceRequestsPerAgency: 1,
            conversationsPerAgency: 1,
            documentsPerAgency: 1,
            includeDemoUsers: false,
            // Les contrats figés (PDF, ~0,25 s par bail) ne changent rien au titulaire des biens.
            contratsFiges: false,
        ));
        config(['scout.driver' => null]);
        $this->seed(YearOfActivitySeeder::class);

        $lignes = collect($this->getJson('/api/public/agents?per_page=48')->assertOk()->json('data'));
        $agents = $lignes->where('public_role', 'agent');

        // Les agents EN EXERCICE : profil actif, agence active. Le parti (profil suspendu) n'en est pas.
        $enExercice = AgentProfile::query()
            ->where('status', AgentProfileStatus::Active->value)
            ->whereHas('agency', fn ($a) => $a->where('status', AgencyStatus::Active->value))
            ->pluck('user_id')->map(fn ($id) => (int) $id)->unique();

        $this->assertGreaterThan(0, $agents->count(), 'Aucun agent dans l\'annuaire semé.');
        // « La majorité des agents actifs » — pour que l'annuaire ait de quoi trier.
        $this->assertGreaterThan($enExercice->count() / 2, $agents->count(), sprintf(
            '%d agents listés sur %d en exercice.', $agents->count(), $enExercice->count(),
        ));

        foreach ($agents as $ligne) {
            $this->assertTrue($enExercice->contains((int) $ligne['id']), "Ligne « agent » {$ligne['id']} sans AgentProfile actif d'une agence active.");
            // Titulaire d'un bien public, pas seulement collaborateur : c'est ce que lit l'annuaire.
            $this->assertTrue(Property::query()->where('user_id', $ligne['id'])->publicPortfolio()->exists());
        }

        // TCK-2506 sur les données semées : un propriétaire listé paraît, un non listé jamais.
        $proprietaires = User::query()->whereHas('ownerProfiles')
            ->whereDoesntHave('agentProfiles')->whereDoesntHave('agencyAdminProfiles')->get();
        $listes = $proprietaires->where('listed_in_public_directory', true)->pluck('id')->map(fn ($id) => (int) $id);
        $nonListes = $proprietaires->where('listed_in_public_directory', false)->pluck('id')->map(fn ($id) => (int) $id);
        $ids = $lignes->pluck('id')->map(fn ($id) => (int) $id);

        $this->assertNotEmpty($nonListes, 'Tous les propriétaires sont listés : le défaut de TCK-2506 n\'est plus exercé.');
        $this->assertGreaterThan(0, $ids->intersect($listes)->count(), 'Aucun propriétaire listé ne paraît dans l\'annuaire.');
        $this->assertSame([], $ids->intersect($nonListes)->values()->all(), 'Un propriétaire non listé paraît dans l\'annuaire.');
        // Non-vacuité du « jamais » : des propriétaires non listés publient bien des biens publics.
        $this->assertTrue(Property::query()->whereIn('user_id', $nonListes)->publicPortfolio()->exists());
        $this->assertGreaterThan(0, OwnerProfile::query()->count());

        $this->assertTourniquetDesTitulaires(app(SeedingContext::class));
    }

    /**
     * Les deux règles du tourniquet de {@see PropertySeeder} (un bien sur
     * {@see PropertySeeder::AGENT_TITULAIRE_UN_SUR} a pour titulaire un agent), jugées sur le jeu déjà
     * semé — aucun seed de plus :
     *
     * 1. un agent PARTI (départ dans `SeedingContext::$departs`, profil d'agent suspendu) n'est jamais
     *    titulaire — l'annuaire ne le liste pas, son portefeuille y serait orphelin ;
     * 2. un agent ARRIVÉ APRÈS le bien n'en est pas titulaire.
     *
     * Chaque règle n'est jugée qu'après avoir vérifié que son cas se produit : sans départ ni arrivée
     * tardive, les deux assertions seraient vraies de toute façon.
     */
    private function assertTourniquetDesTitulaires(SeedingContext $ctx): void
    {
        $profils = AgentProfile::query()->get(['user_id', 'status']);
        $idsAgents = $profils->pluck('user_id')->map(fn ($id) => (int) $id)->unique();
        $suspendus = $profils->where('status', AgentProfileStatus::Suspended)->pluck('user_id')->map(fn ($id) => (int) $id);
        $partis = collect(array_keys($ctx->departs))->map(fn ($id) => (int) $id);

        $tenusParUnAgent = Property::query()->whereIn('user_id', $idsAgents)->get(['id', 'user_id', 'created_at']);
        $arrivees = User::query()->whereIn('id', $idsAgents)->pluck('created_at', 'id');

        $this->assertGreaterThan(0, $tenusParUnAgent->count(), 'Aucun bien tenu par un agent : le tourniquet ne tourne pas.');
        $this->assertNotEmpty($partis, 'Aucun départ dans le jeu : la règle 1 n\'est pas exercée.');
        $this->assertEqualsCanonicalizing($partis->all(), $suspendus->all(), 'Un parti sans profil suspendu, ou l\'inverse.');
        $premierBien = Property::query()->whereNotNull('agency_id')->min('created_at');
        $this->assertNotEmpty(
            $arrivees->filter(fn ($arrivee) => $arrivee->greaterThan($premierBien)),
            'Aucun agent arrivé après le premier bien : la règle 2 n\'est pas exercée.',
        );

        // Règle 1.
        $this->assertSame(
            [],
            $tenusParUnAgent->filter(fn (Property $p) => $partis->contains((int) $p->user_id))->pluck('id')->all(),
            'Des biens ont pour titulaire un agent parti (profil suspendu).',
        );
        // Règle 2.
        $this->assertSame(
            [],
            $tenusParUnAgent->filter(fn (Property $p) => $p->created_at->lessThan($arrivees[(int) $p->user_id]))->pluck('id')->all(),
            'Des biens sont nés avant l\'arrivée de leur agent titulaire.',
        );
    }
}
