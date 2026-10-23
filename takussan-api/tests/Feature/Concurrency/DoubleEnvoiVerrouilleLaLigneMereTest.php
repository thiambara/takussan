<?php

namespace Tests\Feature\Concurrency;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\Capability;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\Currency;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Invitation;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Membership\AgencyRoleService;
use App\Services\Messaging\GroupConversationService;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\RemoteDiskFake;

/**
 * TCK-1492 (P92.07) — un geste qui contrôle « déjà là ? » puis écrit sous une contrainte d'unicité
 * verrouille d'abord sa ligne mère, dans la transaction qui écrit.
 *
 * Avant : le contrôle courait sans verrou, parfois hors de toute transaction ; deux envois
 * simultanés passaient tous deux le contrôle, et le second heurtait l'index en 500
 * (`UniqueConstraintViolationException`, rejoué par le mesureur pour `addParticipants` et
 * `replaceCapabilities`).
 *
 * Ce que ces tests observent : l'ORDRE des requêtes. Le `SELECT … FOR UPDATE` de la ligne mère
 * précède le contrôle, et le contrôle comme l'écriture courent dans la transaction qui tient le
 * verrou (même niveau de transaction, au-dessus de celui de `RefreshDatabase`). Deux connexions
 * réelles ne se voient pas ici : `RefreshDatabase` garde chaque test dans une transaction jamais
 * validée, que l'autre connexion ne lirait pas — l'ordre est la propriété qui ferme la course.
 */
class DoubleEnvoiVerrouilleLaLigneMereTest extends ApiTestCase
{
    use RefreshDatabase;

    /**
     * @return list<array{sql: string, level: int}>
     */
    private function requetesDe(callable $geste): array
    {
        $requetes = [];
        DB::listen(function (QueryExecuted $q) use (&$requetes): void {
            $requetes[] = ['sql' => strtolower($q->sql), 'level' => $q->connection->transactionLevel()];
        });

        $geste();

        return $requetes;
    }

    /**
     * @param  list<array{sql: string, level: int}>  $requetes
     */
    private function assertVerrouAvant(array $requetes, string $verrou, string $controle, string $ecriture): void
    {
        $base = DB::transactionLevel();
        $trouver = static function (string $motif) use ($requetes): ?int {
            foreach ($requetes as $i => $r) {
                if (preg_match($motif, $r['sql']) === 1) {
                    return $i;
                }
            }

            return null;
        };
        $trace = implode("\n", array_map(static fn (array $r): string => "[{$r['level']}] {$r['sql']}", $requetes));

        $iVerrou = $trouver($verrou);
        $iControle = $trouver($controle);
        $iEcriture = $trouver($ecriture);

        $this->assertNotNull($iVerrou, "aucun verrou de la ligne mère :\n{$trace}");
        $this->assertNotNull($iControle, "contrôle introuvable :\n{$trace}");
        $this->assertNotNull($iEcriture, "écriture introuvable :\n{$trace}");
        $this->assertLessThan($iControle, $iVerrou, "le verrou doit précéder le contrôle :\n{$trace}");
        $this->assertGreaterThan($base, $requetes[$iVerrou]['level'], "le verrou doit courir dans une transaction :\n{$trace}");
        $this->assertSame($requetes[$iVerrou]['level'], $requetes[$iControle]['level'], "contrôle hors de la transaction du verrou :\n{$trace}");
        $this->assertSame($requetes[$iVerrou]['level'], $requetes[$iEcriture]['level'], "écriture hors de la transaction du verrou :\n{$trace}");
    }

    public function test_ajouter_des_participants_verrouille_la_conversation_avant_de_lire_les_presents(): void
    {
        Notification::fake();
        $createur = User::factory()->create();
        $membre = User::factory()->create();
        $nouveau = User::factory()->create();
        $groupes = app(GroupConversationService::class);
        $conversation = $groupes->create($createur, 'Groupe', [$membre->id], sendInvites: false);

        $requetes = $this->requetesDe(fn () => $groupes->addParticipants($conversation, $createur, [$nouveau->id]));

        $this->assertVerrouAvant(
            $requetes,
            '/from "conversations" .*for update/',
            '/"conversation_participants"/',
            '/insert into "conversation_participants"/',
        );
    }

    public function test_remplacer_les_capacites_verrouille_le_role_avant_de_lire_les_siennes(): void
    {
        $agency = Agency::factory()->create();
        $role = AgencyRole::query()->create([
            'agency_id' => $agency->id,
            'name' => 'Direct',
            'base_profile_type' => 'agent',
            'is_system' => false,
            'is_clonable' => true,
        ]);
        $service = app(AgencyRoleService::class);
        $service->replaceCapabilities($role, [Capability::PropertiesCreate]);

        $requetes = $this->requetesDe(fn () => $service->replaceCapabilities($role, [Capability::PropertiesUpdateAny]));

        $this->assertVerrouAvant(
            $requetes,
            '/from "agency_roles" .*for update/',
            '/"agency_role_capabilities"/',
            '/insert into "agency_role_capabilities"/',
        );
    }

    public function test_demander_le_passage_en_agence_verrouille_l_agence_avant_de_chercher_une_demande_en_cours(): void
    {
        Notification::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Individual]);
        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        $requetes = $this->requetesDe(fn () => $this->postJson("/api/agencies/{$agency->id}/upgrade-requests", [
            'rc' => 'RC-DKR-2026-001',
            'ninea' => '0123456789012',
            'rib_pro' => 'SN012 01234 0123456789012 34',
            'company_legal_name' => 'Takussan Immo SARL',
            'address_fiscale' => '12 Avenue Léopold Sédar Senghor, Dakar',
            'statuts_doc' => UploadedFile::fake()->create('statuts.pdf', 800, 'application/pdf'),
        ])->assertCreated());

        $this->assertVerrouAvant(
            $requetes,
            '/from "agencies" .*for update/',
            '/from "agency_upgrade_requests" where "agency_id" = \?/',
            '/insert into "agency_upgrade_requests"/',
        );
    }

    public function test_importer_un_releve_verrouille_l_agence_avant_de_chercher_le_meme_fichier(): void
    {
        Queue::fake();
        RemoteDiskFake::install('r2-private');
        $agency = Agency::factory()->create(['currency' => Currency::XOF]);
        $admin = User::factory()->create(['agency_id' => $agency->id]);
        $agency->update(['primary_admin_id' => $admin->id]);

        $requetes = $this->requetesDe(fn () => $this->actingAs($admin)
            ->postJson("/api/agencies/{$agency->id}/bank-statements", [
                'file' => UploadedFile::fake()->createWithContent('s.csv', "date,amount,label\n01/04/2026,150000,A\n"),
                'source_format' => 'csv',
            ])->assertStatus(202));

        $this->assertVerrouAvant(
            $requetes,
            '/from "agencies" .*for update/',
            // Le contrôle qui fait foi, celui du contrôleur ; le `exists()` de la FormRequest n'est
            // qu'un refus anticipé lisible, que la course peut toujours passer.
            '/^select \* from "bank_statements" where "agency_id" = \? and "file_hash" = \?$/',
            '/insert into "bank_statements"/',
        );
    }

    public function test_creer_une_integration_d_agence_verrouille_l_agence_avant_de_chercher_la_vivante(): void
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->withTwoFactor()->create(['agency_id' => $agency->id]);
        $this->materializeRoleProfile($admin, 'agency_admin', $agency);
        Sanctum::actingAs($admin);

        $requetes = $this->requetesDe(fn () => $this->postJson('/api/integrations', [
            'provider' => 'sms_orange',
            'credentials' => ['client_id' => 'c', 'client_secret' => 's'],
        ])->assertCreated());

        $this->assertVerrouAvant(
            $requetes,
            '/from "agencies" .*for update/',
            '/select exists\(select \* from "integrations"/',
            '/insert into "integrations"/',
        );
    }

    public function test_creer_une_integration_de_plateforme_prend_un_verrou_consultatif_avant_de_chercher_la_vivante(): void
    {
        $operateur = User::factory()->withTwoFactor()->create();
        $this->materializeRoleProfile($operateur, 'super_admin');
        Sanctum::actingAs($operateur);

        $requetes = $this->requetesDe(fn () => $this->postJson('/api/integrations', [
            'provider' => 'sms_orange',
            'credentials' => ['client_id' => 'c', 'client_secret' => 's'],
        ])->assertCreated()->assertJsonPath('data.agency_id', null));

        $this->assertVerrouAvant(
            $requetes,
            '/pg_advisory_xact_lock/',
            '/select exists\(select \* from "integrations"/',
            '/insert into "integrations"/',
        );
    }

    public function test_ajouter_un_collaborateur_verrouille_le_bien_avant_de_chercher_le_doublon(): void
    {
        $agence = Agency::factory()->create();
        $bailleur = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $agence->id]);
        $property = Property::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $agence->id]);
        $agent = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agence->id]);
        Sanctum::actingAs($bailleur);

        $requetes = $this->requetesDe(fn () => $this->postJson("/api/properties/{$property->id}/collaborators", [
            'user_id' => $agent->id,
            'role' => CollaboratorRole::Agent->value,
            'commission_share' => 30,
        ])->assertCreated());

        $this->assertVerrouAvant(
            $requetes,
            '/from "properties" .*for update/',
            '/select exists\(select \* from "property_collaborators"/',
            '/insert into "property_collaborators"/',
        );

        // Le second envoi, séquentiel, garde son refus écrit.
        $this->postJson("/api/properties/{$property->id}/collaborators", [
            'user_id' => $agent->id,
            'role' => CollaboratorRole::Agent->value,
        ])->assertStatus(422)->assertJsonPath('code', 'property.collaborator_exists');
    }

    public function test_accepter_une_collaboration_de_prestataire_verrouille_son_profil_avant_de_chercher_la_collaboration(): void
    {
        Mail::fake();
        $agencyA = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $agencyB = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $sp = User::factory()->create(['email' => 'presta@example.com']);
        $profile = ServiceProviderProfile::factory()->create([
            'user_id' => $sp->id,
            'status' => ServiceProviderProfileStatus::Active->value,
        ]);
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $profile->id,
            'agency_id' => $agencyA->id,
            'status' => CollaborationStatus::Active->value,
            'started_at' => now()->subYear()->toDateString(),
        ]);

        $this->actingAsRole('agency_admin', ['agency_id' => $agencyB->id]);
        $this->postJson("/api/agencies/{$agencyB->id}/service-providers/invite", [
            'email' => 'presta@example.com',
            'first_name' => 'A',
            'last_name' => 'B',
            'trades' => ['plumbing'],
            'intervention_zones' => ['Dakar'],
        ])->assertCreated();
        $this->app['auth']->forgetGuards();
        $invitation = Invitation::query()->where('email', 'presta@example.com')->latest('id')->firstOrFail();

        Sanctum::actingAs($sp);
        $requetes = $this->requetesDe(fn () => $this->postJson('/api/invitations/'.$invitation->token.'/accept')->assertOk());

        $this->assertVerrouAvant(
            $requetes,
            '/from "service_provider_profiles" .*for update/',
            '/from "service_provider_agency_collaborations" where "service_provider_profile_id" = \? and "agency_id" = \?/',
            '/insert into "service_provider_agency_collaborations"/',
        );
    }
}
