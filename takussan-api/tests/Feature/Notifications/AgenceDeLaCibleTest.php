<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\AgenceDeLaCible;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2751 — la cible d'une notification d'objet d'agence porte `agency_id` pour le lecteur qui
 * tient un profil ACTIF dans l'agence de l'objet, et pour lui seul : la cloche bascule alors sur ce
 * profil avant d'ouvrir l'objet (`LienDansLAgence`). Un non-membre n'apprend jamais l'identifiant
 * d'une agence, et sa ligne reste un lien simple.
 */
class AgenceDeLaCibleTest extends TestCase
{
    use RefreshDatabase;

    /**
     * AC1 — la garde : chaque genre de `NotificationTarget::PATHS` est classé dans UNE liste, et
     * chaque objet d'agence se résout par une table et une colonne qui existent.
     */
    public function test_chaque_genre_de_cible_est_classe_une_seule_fois(): void
    {
        $classes = [
            ...array_keys(AgenceDeLaCible::OBJETS),
            ...AgenceDeLaCible::SECTIONS,
            ...AgenceDeLaCible::HORS_AGENCE,
        ];
        $genres = array_keys(NotificationTarget::PATHS);

        $this->assertSame([], array_values(array_diff($genres, $classes)), 'Genre de cible non classé dans AgenceDeLaCible : objet d\'agence, section d\'agence ou hors agence ?');
        $this->assertSame([], array_values(array_diff($classes, $genres)), 'Genre classé qui n\'existe plus dans NotificationTarget::PATHS.');
        $this->assertSame(count($classes), count(array_unique($classes)), 'Un genre est classé deux fois.');

        foreach (AgenceDeLaCible::OBJETS as $genre => [$table, $colonne, $corbeille]) {
            $this->assertStringContainsString('{id}', NotificationTarget::PATHS[$genre], "{$genre} : un objet d'agence s'ouvre par son identifiant.");
            $this->assertTrue(Schema::hasColumn($table, $colonne ?? 'property_id'), "{$genre} : {$table}.".($colonne ?? 'property_id').' introuvable.');
            $this->assertSame(Schema::hasColumn($table, 'deleted_at'), $corbeille, "{$genre} : le drapeau de corbeille ne dit pas ce que fait {$table}.");
        }
    }

    /** AC1 — chaque objet d'agence rend l'agence de son objet au membre qui lit. */
    public function test_chaque_objet_d_agence_rend_son_agence_au_membre(): void
    {
        $agence = Agency::factory()->create();
        $membre = $this->agentDe($agence);
        $bien = Property::factory()->create(['agency_id' => $agence->id]);
        $objets = [
            'lease' => Lease::factory()->create(['property_id' => $bien->id, 'agency_id' => $agence->id])->id,
            'booking' => Booking::factory()->create(['property_id' => $bien->id, 'agency_id' => $agence->id])->id,
            'property' => $bien->id,
            'lead' => PropertyContactLead::factory()->create(['property_id' => $bien->id])->id,
            'visit' => PropertyVisit::factory()->create(['property_id' => $bien->id])->id,
            'maintenance' => MaintenanceRequest::factory()->create(['property_id' => $bien->id])->id,
        ];
        $this->assertSame(array_keys(AgenceDeLaCible::OBJETS), array_keys($objets), 'Un objet d\'agence neuf demande sa ligne ici.');

        foreach ($objets as $genre => $id) {
            $this->notifier($membre, NotificationTarget::of($genre, $id));
        }
        Sanctum::actingAs($membre);

        $lignes = $this->getJson('/api/notifications')->assertOk()->json('data');

        $this->assertCount(count($objets), $lignes);
        foreach ($lignes as $ligne) {
            $this->assertSame($agence->id, $ligne['target']['agency_id'] ?? null, $ligne['target']['kind'].' : agence absente.');
        }
    }

    /**
     * AC2 (côté API) — le compte 176 de la démo : agent de l'agence A, propriétaire dans l'agence B,
     * lisant dans son espace de propriétaire. La notification d'une intervention de A porte A ; sous
     * le profil de B l'intervention est refusée, sous le profil d'agent de A elle s'ouvre.
     */
    public function test_l_agent_qui_lit_dans_un_autre_espace_recoit_l_agence_de_l_intervention(): void
    {
        [$agenceA, $agenceB] = Agency::factory()->count(2)->create();
        $user = User::factory()->create();
        $agent = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agenceA->id]);
        $proprietaire = OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agenceB->id]);
        $intervention = MaintenanceRequest::factory()->create([
            'property_id' => Property::factory()->create(['agency_id' => $agenceA->id])->id,
        ]);
        $this->notifier($user, NotificationTarget::of('maintenance', $intervention->id));
        Sanctum::actingAs($user);
        $espaceProprietaire = ['X-Profile-Id' => "owner:{$proprietaire->id}"];

        $cible = $this->getJson('/api/notifications', $espaceProprietaire)->assertOk()->json('data.0.target');

        $this->assertSame(['kind' => 'maintenance', 'id' => $intervention->id, 'path' => "/app/maintenance/{$intervention->id}", 'agency_id' => $agenceA->id], $cible);
        // Le front choisit son profil dans `/api/me/profiles` : celui de l'agence A doit y être, et la bascule réussir.
        $profilsDeA = array_values(array_filter(
            $this->getJson('/api/me/profiles', $espaceProprietaire)->assertOk()->json('data'),
            fn (array $p): bool => $p['agency_id'] === $agenceA->id,
        ));
        $this->assertSame(["agent:{$agent->id}"], array_column($profilsDeA, 'id'));
        $this->patchJson('/api/me/active-profile', ['profile_id' => "agent:{$agent->id}", 'remember' => false])->assertOk();
        $this->getJson("/api/maintenance-requests/{$intervention->id}", $espaceProprietaire)->assertForbidden();
        $this->getJson("/api/maintenance-requests/{$intervention->id}", ['X-Profile-Id' => "agent:{$agent->id}"])->assertOk();
    }

    /** Un locataire, un client : aucun profil dans l'agence — ni clé, ni identifiant d'agence. */
    public function test_le_non_membre_ne_recoit_pas_l_agence_et_garde_son_lien(): void
    {
        $agence = Agency::factory()->create();
        $demandeur = User::factory()->create();
        $intervention = MaintenanceRequest::factory()->create([
            'property_id' => Property::factory()->create(['agency_id' => $agence->id])->id,
            'requester_id' => $demandeur->id,
        ]);
        $this->notifier($demandeur, NotificationTarget::of('maintenance', $intervention->id));
        Sanctum::actingAs($demandeur);

        $cible = $this->getJson('/api/notifications')->assertOk()->json('data.0.target');

        $this->assertSame(['kind' => 'maintenance', 'id' => $intervention->id, 'path' => "/app/maintenance/{$intervention->id}"], $cible);
    }

    /** Membre d'une AUTRE agence que celle de l'objet : rien non plus. */
    public function test_le_membre_d_une_autre_agence_ne_recoit_pas_l_agence_de_l_objet(): void
    {
        [$agenceA, $agenceB] = Agency::factory()->count(2)->create();
        $user = $this->agentDe($agenceB);
        $bail = Lease::factory()->create([
            'property_id' => Property::factory()->create(['agency_id' => $agenceA->id])->id,
            'agency_id' => $agenceA->id,
        ]);
        $this->notifier($user, NotificationTarget::of('lease', $bail->id));
        Sanctum::actingAs($user);

        $this->assertArrayNotHasKey('agency_id', $this->getJson('/api/notifications')->assertOk()->json('data.0.target'));
    }

    /** Un profil suspendu ne confère rien : la bascule lui serait refusée (`profile.not_accessible`). */
    public function test_le_profil_suspendu_ne_recoit_pas_l_agence(): void
    {
        $agence = Agency::factory()->create();
        $user = User::factory()->create();
        $suspendu = AgentProfile::factory()->suspended()->create(['user_id' => $user->id, 'agency_id' => $agence->id]);
        $visite = PropertyVisit::factory()->create([
            'property_id' => Property::factory()->create(['agency_id' => $agence->id])->id,
        ]);
        $this->notifier($user, NotificationTarget::of('visit', $visite->id));
        Sanctum::actingAs($user);

        $this->assertArrayNotHasKey('agency_id', $this->getJson('/api/notifications')->assertOk()->json('data.0.target'));
        // La garde et la bascule disent la même chose : ce profil ne peut pas être activé.
        $this->assertSame([], $this->getJson('/api/me/profiles')->assertOk()->json('data'));
        $this->patchJson('/api/me/active-profile', ['profile_id' => "agent:{$suspendu->id}"])->assertForbidden();
    }

    /** Le prestataire n'a pas de profil d'agence : sa ligne reste un lien simple, sans agence. */
    public function test_le_prestataire_ne_recoit_pas_l_agence(): void
    {
        $agence = Agency::factory()->create();
        $user = User::factory()->create();
        $this->collaborationDe($user, $agence);
        $intervention = MaintenanceRequest::factory()->create([
            'property_id' => Property::factory()->create(['agency_id' => $agence->id])->id,
            'assigned_to' => $user->id,
        ]);
        $this->notifier($user, NotificationTarget::of('maintenance', $intervention->id));
        Sanctum::actingAs($user);

        $this->assertArrayNotHasKey('agency_id', $this->getJson('/api/notifications')->assertOk()->json('data.0.target'));
    }

    /**
     * Notifié à un autre titre : prestataire assigné ET propriétaire dans l'agence. La cloche le
     * bascule sur son profil de propriétaire ; l'intervention doit s'y ouvrir quand même.
     */
    public function test_le_prestataire_aussi_proprietaire_ouvre_l_intervention_apres_la_bascule(): void
    {
        $agence = Agency::factory()->create();
        $user = User::factory()->create();
        $this->collaborationDe($user, $agence);
        $proprietaire = OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agence->id]);
        $intervention = MaintenanceRequest::factory()->create([
            'property_id' => Property::factory()->create(['agency_id' => $agence->id])->id,
            'assigned_to' => $user->id,
        ]);
        $this->notifier($user, NotificationTarget::of('maintenance', $intervention->id));
        Sanctum::actingAs($user);

        $this->assertSame($agence->id, $this->getJson('/api/notifications')->assertOk()->json('data.0.target.agency_id'));
        $this->getJson("/api/maintenance-requests/{$intervention->id}", ['X-Profile-Id' => "owner:{$proprietaire->id}"])->assertOk();
    }

    /**
     * UNE porte pour les deux sources : l'agence déjà posée par `forAgency()` (section d'agence,
     * TCK-1761) ne sort, elle aussi, que vers le membre actif. Le membre parti ou suspendu qui relit
     * ses anciennes notifications n'y lit plus l'identifiant de l'agence.
     */
    public function test_l_agence_stockee_passe_la_meme_porte(): void
    {
        $agence = Agency::factory()->create();
        $membre = $this->agentDe($agence);
        $suspendu = User::factory()->create();
        AgentProfile::factory()->suspended()->create(['user_id' => $suspendu->id, 'agency_id' => $agence->id]);
        $etranger = User::factory()->create();
        foreach ([$membre, $suspendu, $etranger] as $user) {
            $this->notifier($user, NotificationTarget::of('finances')->forAgency($agence->id));
        }

        Sanctum::actingAs($membre);
        $duMembre = $this->getJson('/api/notifications')->assertOk()->json('data.0');
        $this->assertSame($agence->id, $duMembre['target']['agency_id']);
        foreach ([$suspendu, $etranger] as $user) {
            Sanctum::actingAs($user);
            $ligne = $this->getJson('/api/notifications')->assertOk()->json('data.0');
            $this->assertNull($ligne['target'], 'Section d\'agence retenue par la porte : ni agence, ni lien.');
            // La famille se lit toujours (cible STOCKÉE, `NotificationClassification`) : la ligne reste rangée.
            $this->assertSame($duMembre['famille'], $ligne['famille']);
        }
    }

    /**
     * La régression écartée : un membre PARTI de l'agence A, actif dans l'agence B, relit un avis des
     * finances de A. Un lien simple vers `/app/agency/finances` lui aurait ouvert les finances de B,
     * sans le dire ; la ligne reste donc sans lien. Une notification d'OBJET de A garde, elle, son lien
     * simple : la fiche refuse elle-même.
     */
    public function test_le_membre_parti_actif_ailleurs_n_a_aucun_lien_vers_une_section(): void
    {
        [$agenceA, $agenceB] = Agency::factory()->count(2)->create();
        $user = User::factory()->create();
        AgentProfile::factory()->inactive()->create(['user_id' => $user->id, 'agency_id' => $agenceA->id]);
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agenceB->id]);
        $bail = Lease::factory()->create([
            'property_id' => Property::factory()->create(['agency_id' => $agenceA->id])->id,
            'agency_id' => $agenceA->id,
        ]);
        $this->notifier($user, NotificationTarget::of('finances')->forAgency($agenceA->id));
        $this->notifier($user, NotificationTarget::of('lease', $bail->id));
        Sanctum::actingAs($user);

        $cibles = array_column($this->getJson('/api/notifications')->assertOk()->json('data'), 'target', 'id');
        ksort($cibles);
        [$section, $objet] = array_values($cibles);

        $this->assertNull($section);
        $this->assertSame(['kind' => 'lease', 'id' => $bail->id, 'path' => "/app/leases/{$bail->id}"], $objet);
    }

    /** Un objet supprimé, en corbeille ou introuvable : ni clé, ni erreur. */
    public function test_l_objet_supprime_ou_introuvable_ne_rend_pas_de_cle(): void
    {
        $agence = Agency::factory()->create();
        $membre = $this->agentDe($agence);
        $bien = Property::factory()->create(['agency_id' => $agence->id]);
        $enCorbeille = MaintenanceRequest::factory()->create(['property_id' => $bien->id]);
        $enCorbeille->delete();
        $bienEnCorbeille = Property::factory()->create(['agency_id' => $agence->id]);
        $visite = PropertyVisit::factory()->create(['property_id' => $bienEnCorbeille->id]);
        $bienEnCorbeille->delete();
        $this->notifier($membre, NotificationTarget::of('maintenance', $enCorbeille->id));
        $this->notifier($membre, NotificationTarget::of('visit', $visite->id));
        $this->notifier($membre, NotificationTarget::of('lease', 999_999_999));
        $this->notifier($membre, NotificationTarget::of('lead', 999_999_999));
        Sanctum::actingAs($membre);

        $lignes = $this->getJson('/api/notifications')->assertOk()->json('data');

        $this->assertSoftDeleted($enCorbeille);
        $this->assertCount(4, $lignes);
        foreach ($lignes as $ligne) {
            $this->assertArrayNotHasKey('agency_id', $ligne['target'], $ligne['target']['kind'].' : clé rendue pour un objet absent.');
        }
    }

    /** Les lignes anciennes, dont la cible se déduit de `data`, en profitent sans reprise. */
    public function test_la_cible_deduite_d_une_ligne_ancienne_recoit_l_agence(): void
    {
        $agence = Agency::factory()->create();
        $membre = $this->agentDe($agence);
        $intervention = MaintenanceRequest::factory()->create([
            'property_id' => Property::factory()->create(['agency_id' => $agence->id])->id,
        ]);
        $this->notifier($membre, null, ['maintenance_request_id' => $intervention->id]);
        Sanctum::actingAs($membre);

        $this->assertSame($agence->id, $this->getJson('/api/notifications')->assertOk()->json('data.0.target.agency_id'));
    }

    /** Le nombre de requêtes de la page ne croît pas avec le nombre de ses lignes (5 contre 20). */
    public function test_le_nombre_de_requetes_ne_croit_pas_avec_la_page(): void
    {
        $agence = Agency::factory()->create();
        $membre = $this->agentDe($agence);
        $bien = Property::factory()->create(['agency_id' => $agence->id]);
        $ajouter = function (int $n) use ($membre, $bien, $agence): void {
            for ($i = 0; $i < $n; $i++) {
                $this->notifier($membre, NotificationTarget::of('maintenance', MaintenanceRequest::factory()->create(['property_id' => $bien->id])->id));
                $this->notifier($membre, NotificationTarget::of('lease', Lease::factory()->create(['property_id' => $bien->id, 'agency_id' => $agence->id])->id));
                $this->notifier($membre, NotificationTarget::of('finances')->forAgency($agence->id));
                $this->notifier($membre, null, ['visit_id' => PropertyVisit::factory()->create(['property_id' => $bien->id])->id]);
            }
        };
        $compter = function () use ($membre): array {
            Sanctum::actingAs($membre);
            DB::flushQueryLog();
            DB::enableQueryLog();
            $lignes = $this->getJson('/api/notifications?per_page=50')->assertOk()->json('data');
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return [count($lignes), $n, count(array_filter($lignes, fn (array $l): bool => isset($l['target']['agency_id'])))];
        };

        $ajouter(2);
        [$lignes5, $requetes5, $cles5] = $compter();
        $ajouter(3);
        [$lignes20, $requetes20, $cles20] = $compter();

        $this->assertSame([8, 8], [$lignes5, $cles5]);
        $this->assertSame([20, 20], [$lignes20, $cles20]);
        $this->assertSame($requetes5, $requetes20, "Requêtes : {$requetes5} pour 8 lignes, {$requetes20} pour 20.");
    }

    /** Une page se résout en une requête par genre d'objet, pas une par ligne. */
    public function test_une_page_se_resout_en_une_requete_par_genre(): void
    {
        $agence = Agency::factory()->create();
        $membre = $this->agentDe($agence);
        $bien = Property::factory()->create(['agency_id' => $agence->id]);
        foreach (MaintenanceRequest::factory()->count(5)->create(['property_id' => $bien->id]) as $intervention) {
            $this->notifier($membre, NotificationTarget::of('maintenance', $intervention->id));
        }
        Sanctum::actingAs($membre);
        $requetes = 0;
        DB::listen(function ($query) use (&$requetes): void {
            if (str_contains($query->sql, 'from "maintenance_requests" inner join "properties"')) {
                $requetes++;
            }
        });

        $lignes = $this->getJson('/api/notifications')->assertOk()->json('data');

        $this->assertCount(5, array_filter($lignes, fn (array $l): bool => ($l['target']['agency_id'] ?? null) === $agence->id));
        $this->assertSame(1, $requetes);
    }

    private function agentDe(Agency $agence): User
    {
        $user = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agence->id]);

        return $user;
    }

    private function collaborationDe(User $user, Agency $agence): void
    {
        $profil = ServiceProviderProfile::factory()->create(['user_id' => $user->id]);
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $profil->id,
            'agency_id' => $agence->id,
            'status' => CollaborationStatus::Active->value,
            'started_at' => now()->subMonth(),
            'agency_role_id' => AgencyRole::factory()->ofType(AgencyRoleBaseType::ServiceProvider)->create(['agency_id' => $agence->id])->id,
        ]);
    }

    /** @param  array<string, mixed>|null  $data */
    private function notifier(User $user, ?NotificationTarget $cible, ?array $data = null): void
    {
        AppNotification::create([
            'user_id' => $user->id,
            'type' => NotificationType::System,
            'title' => 'Avis',
            'target' => $cible?->toArray(),
            'data' => $data,
            'delivery_channel' => NotificationChannel::App,
            'sent_at' => now(),
        ]);
    }
}
