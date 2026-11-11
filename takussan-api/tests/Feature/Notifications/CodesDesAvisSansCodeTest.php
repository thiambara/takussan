<?php

namespace Tests\Feature\Notifications;

use App\Jobs\EscalateUrgentMaintenanceJob;
use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\AppNotification;
use App\Models\BoostProduct;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use App\Notifications\AgencyUpgradeRequestSubmittedNotification;
use App\Notifications\Boost\BoostEndedNotification;
use App\Notifications\PropertyProposedNotification;
use App\Notifications\UrgentMaintenanceCreatedNotification;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2704 — les quatre avis de la cloche qui n'avaient pas de code en portent un : la ligne est
 * rangée et marquée « à traiter » par sa table (`NotificationClassification::CODES`), elle ouvre
 * son objet, et son texte est rendu dans la langue du destinataire.
 *
 * Chaque ligne est écrite par la classe réelle, par le canal réel (`database`), et lue par
 * `GET /api/notifications` : c'est ce que la cloche reçoit.
 */
class CodesDesAvisSansCodeTest extends TestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    /**
     * La ligne telle que la cloche la lit, dans la langue de la requête (`?lang=`) : une ligne à
     * code est re-rendue à la lecture, dans la langue de qui la lit.
     *
     * @return array<string, mixed>
     */
    private function laLigneDe(User $user, string $lang = 'fr'): array
    {
        Sanctum::actingAs($user);

        $data = $this->getJson("/api/notifications?lang={$lang}")->assertOk()->json('data');
        $this->assertCount(1, $data);

        return $data[0];
    }

    /** AC1 */
    public function test_un_bien_propose_par_un_bailleur_est_a_traiter_et_ouvre_le_bien(): void
    {
        $admin = User::factory()->create(['preferred_language' => 'fr']);
        $property = Property::factory()->create(['title' => 'Villa des Almadies']);

        $admin->notify(new PropertyProposedNotification($property));

        $ligne = $this->laLigneDe($admin);
        $this->assertSame(['property.proposed', 'bien', true], [$ligne['code'], $ligne['famille'], $ligne['a_traiter']]);
        $this->assertSame(['property' => 'Villa des Almadies'], $ligne['params']);
        $this->assertSame("/app/properties/{$property->id}", $ligne['target']['path']);
        $this->assertSame('Bien proposé par un bailleur : Villa des Almadies', $ligne['title']);
    }

    /** AC2 */
    public function test_l_intervention_urgente_puis_son_escalade_sont_a_traiter_et_ouvrent_l_intervention(): void
    {
        $agent = User::factory()->create(['preferred_language' => 'fr']);
        $demande = MaintenanceRequest::factory()->create(['title' => 'Fuite au plafond']);

        $agent->notify(new UrgentMaintenanceCreatedNotification($demande));
        $agent->notify(new UrgentMaintenanceCreatedNotification($demande, isEscalation: true));
        Sanctum::actingAs($agent);

        $lignes = collect($this->getJson('/api/notifications?lang=fr')->assertOk()->json('data'))->keyBy('code');

        $this->assertEqualsCanonicalizing(['maintenance.urgent_created', 'maintenance.urgent_escalated'], $lignes->keys()->all());
        foreach ($lignes as $code => $ligne) {
            $this->assertSame(['demande', true], [$ligne['famille'], $ligne['a_traiter']], $code);
            $this->assertSame("/app/maintenance/{$demande->id}", $ligne['target']['path'], $code);
        }
        $this->assertSame('Urgent : Fuite au plafond', $lignes['maintenance.urgent_created']['title']);
        $this->assertSame('Escalade urgente : Fuite au plafond', $lignes['maintenance.urgent_escalated']['title']);
    }

    /** Le passage en urgent d'une demande existante garde le code de la création. */
    public function test_le_passage_en_urgent_porte_le_code_de_la_creation(): void
    {
        $agent = User::factory()->create();

        $agent->notify(new UrgentMaintenanceCreatedNotification(MaintenanceRequest::factory()->create(), becameUrgent: true));

        $this->assertSame('maintenance.urgent_created', $this->laLigneDe($agent)['code']);
    }

    /** AC3 */
    public function test_la_demande_de_passage_en_agence_est_a_traiter_et_ouvre_sa_revue(): void
    {
        $superAdmin = User::factory()->create();
        $demande = AgencyUpgradeRequest::factory()->create();

        $superAdmin->notify(new AgencyUpgradeRequestSubmittedNotification($demande, User::factory()->create()));

        $ligne = $this->laLigneDe($superAdmin);
        $this->assertSame(['agency.upgrade_requested', 'systeme', true], [$ligne['code'], $ligne['famille'], $ligne['a_traiter']]);
        $this->assertSame("/super-admin/agency-upgrade-requests/{$demande->id}", $ligne['target']['path']);
        $this->assertSame(['agency' => $demande->agency->name], $ligne['params']);
    }

    /**
     * AC4 — le texte STOCKÉ est écrit dans la langue du destinataire ; la cloche, elle, le re-rend
     * par le code dans la langue de qui lit — ce que la ligne sans code ne savait pas faire.
     */
    public function test_la_mise_en_avant_terminee_est_un_bien_a_lire_dans_la_langue_du_destinataire(): void
    {
        $titulaire = User::factory()->create(['preferred_language' => 'en']);

        $titulaire->notify(new BoostEndedNotification(7, 'Villa à Ngor'));

        $stockee = AppNotification::query()->where('user_id', $titulaire->id)->sole();
        $this->assertSame(['Promotion ended', 'The promotion of “Villa à Ngor” has ended.'], [$stockee->title, $stockee->body]);

        $ligne = $this->laLigneDe($titulaire, 'en');
        $this->assertSame(['boost.ended', 'bien', false], [$ligne['code'], $ligne['famille'], $ligne['a_traiter']]);
        $this->assertSame(['property' => 'Villa à Ngor'], $ligne['params']);
        $this->assertSame('/app/properties/7', $ligne['target']['path']);
        $this->assertSame('Promotion ended', $ligne['title']);
        $this->assertSame('Mise en avant terminée', $this->laLigneDe($titulaire, 'fr')['title']);
    }

    // ─── Par les vrais émetteurs ─────────────────────────────────────────────────────────────
    //
    // Les tests ci-dessus appellent `notify()` en direct : ils prouvent la forme de la ligne, pas
    // qu'elle arrive. Ceux-ci passent par le geste ou le balayage réel, SANS `Notification::fake()` :
    // `via()` et le choix des destinataires sont exercés, et la ligne est lue par la cloche.

    /**
     * Vérification adverse de TCK-2704 (m1) — le texte STOCKÉ (titre et corps : repli, diffusions)
     * est écrit dans la langue du destinataire, et non dans celle de la requête qui l'émet : ce
     * qu'AC4 épinglait pour `boost.ended` seul. Comparé à la cloche re-rendue en anglais, et distinct
     * du français, pour qu'un rendu en langue fixe rougisse.
     */
    private function assertStockeeDansSaLangue(User $destinataire, string $code): void
    {
        $stockee = AppNotification::query()->where('user_id', $destinataire->id)->where('code', $code)->sole();
        $en = $this->laClocheDe($destinataire, 'en')->get($code);
        $fr = $this->laClocheDe($destinataire, 'fr')->get($code);

        $this->assertSame([$en['title'], $en['body']], [$stockee->title, $stockee->body], "{$code} : stocké en anglais");
        $this->assertNotSame($fr['title'], $stockee->title, "{$code} : le titre anglais diffère du français");
    }

    /**
     * Les lignes de la cloche de ce lecteur, rangées par code.
     *
     * @return Collection<string, array<string, mixed>>
     */
    private function laClocheDe(User $user, string $lang = 'fr'): Collection
    {
        Sanctum::actingAs($user);

        return collect($this->getJson("/api/notifications?lang={$lang}")->assertOk()->json('data'))->keyBy('code');
    }

    /** AC1 — chaque admin actif de l'agence reçoit la proposition d'un bailleur, à traiter. */
    public function test_par_l_emetteur_chaque_admin_actif_recoit_le_bien_propose(): void
    {
        $agency = Agency::factory()->create();
        $admins = [$this->agencyAdmin($agency), $this->agencyAdmin($agency)];
        $admins[1]->forceFill(['preferred_language' => 'en'])->save();

        Sanctum::actingAs(User::factory()->withOwnerProfile($agency)->create());
        $id = $this->postJson('/api/properties', [
            'title' => 'Villa des Almadies', 'type' => 'apartment', 'contract_type' => 'rent',
            'rent_period' => 'monthly', 'price' => 450000,
        ])->assertCreated()->json('data.id');

        foreach ($admins as $admin) {
            $ligne = $this->laClocheDe($admin)->get('property.proposed');
            $this->assertNotNull($ligne, "admin {$admin->id}");
            $this->assertSame(['bien', true], [$ligne['famille'], $ligne['a_traiter']]);
            $this->assertSame("/app/properties/{$id}", $ligne['target']['path']);
        }
        $this->assertStockeeDansSaLangue($admins[1], 'property.proposed');
    }

    /** AC2 — l'agence (son administrateur principal) reçoit l'intervention urgente, à traiter. */
    public function test_par_l_emetteur_l_agence_recoit_l_intervention_urgente(): void
    {
        $agency = Agency::factory()->create();
        $principal = $this->agencyAdmin($agency);
        $principal->forceFill(['preferred_language' => 'en'])->save();
        $agency->update(['primary_admin_id' => $principal->id]);
        $bailleur = User::factory()->withOwnerProfile($agency)->create();
        $property = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $bailleur->id]);

        Sanctum::actingAs($bailleur);
        $id = $this->postJson('/api/maintenance-requests', [
            'property_id' => $property->id, 'title' => 'Fuite au plafond', 'description' => 'L’eau coule',
            'category' => 'plumbing', 'priority' => 'urgent',
        ])->assertCreated()->json('data.id');

        $ligne = $this->laClocheDe($principal)->get('maintenance.urgent_created');
        $this->assertNotNull($ligne);
        $this->assertSame(['demande', true], [$ligne['famille'], $ligne['a_traiter']]);
        $this->assertSame("/app/maintenance/{$id}", $ligne['target']['path']);
        $this->assertStockeeDansSaLangue($principal, 'maintenance.urgent_created');
    }

    /** AC2 — l'escalade du balayage porte son propre code, à traiter. */
    public function test_par_le_balayage_l_escalade_urgente_porte_son_code(): void
    {
        $agency = Agency::factory()->create();
        $principal = $this->agencyAdmin($agency);
        $principal->forceFill(['preferred_language' => 'en'])->save();
        $agency->update(['primary_admin_id' => $principal->id]);
        $demande = MaintenanceRequest::factory()->create([
            'property_id' => Property::factory()->create(['agency_id' => $agency->id])->id,
            'priority' => MaintenancePriority::Urgent->value,
            'status' => MaintenanceStatus::Open->value,
            'created_at' => now()->subMinutes(35),
            'metadata' => [],
        ]);

        (new EscalateUrgentMaintenanceJob)->handle();

        $ligne = $this->laClocheDe($principal)->get('maintenance.urgent_escalated');
        $this->assertNotNull($ligne);
        $this->assertSame(['demande', true], [$ligne['famille'], $ligne['a_traiter']]);
        $this->assertSame("/app/maintenance/{$demande->id}", $ligne['target']['path']);
        $this->assertStockeeDansSaLangue($principal, 'maintenance.urgent_escalated');
    }

    /** AC3 — chaque super-admin reçoit la demande de passage en agence, à traiter. */
    public function test_par_l_emetteur_chaque_super_admin_recoit_la_demande_de_passage_en_agence(): void
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Individual]);
        $superAdmins = [User::factory()->create(), User::factory()->create()];
        foreach ($superAdmins as $superAdmin) {
            $this->materializeRoleProfile($superAdmin, 'super_admin');
        }
        $superAdmins[1]->forceFill(['preferred_language' => 'en'])->save();

        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);
        $this->postJson("/api/agencies/{$agency->id}/upgrade-requests", [
            'rc' => 'RC-DKR-2026-001', 'ninea' => '0123456789012', 'rib_pro' => 'SN012 01234 0123456789012 34',
            'company_legal_name' => 'Takussan Immo SARL', 'address_fiscale' => '12 Avenue Léopold Sédar Senghor, Dakar',
            'planned_agents_count' => 5,
            'statuts_doc' => UploadedFile::fake()->create('statuts.pdf', 800, 'application/pdf'),
        ])->assertCreated();
        $demande = AgencyUpgradeRequest::query()->where('agency_id', $agency->id)->sole();

        foreach ($superAdmins as $superAdmin) {
            $ligne = $this->laClocheDe($superAdmin)->get('agency.upgrade_requested');
            $this->assertNotNull($ligne, "super-admin {$superAdmin->id}");
            $this->assertSame(['systeme', true], [$ligne['famille'], $ligne['a_traiter']]);
            $this->assertSame("/super-admin/agency-upgrade-requests/{$demande->id}", $ligne['target']['path']);
        }
        $this->assertStockeeDansSaLangue($superAdmins[1], 'agency.upgrade_requested');
    }

    /** AC4 — une mise en avant close par la modération : un bien à lire, écrit dans la langue du titulaire. */
    public function test_par_l_emetteur_la_mise_en_avant_terminee_arrive_dans_la_langue_du_titulaire(): void
    {
        $this->travelTo(Carbon::parse('2026-10-12 10:00:00'));
        $agency = Agency::factory()->create();
        $admin = $this->actingAsRole('agency_admin', ['agency' => $agency]);
        $admin->forceFill(['preferred_language' => 'en'])->save();
        $property = Property::factory()->published()->create(['agency_id' => $agency->id, 'title' => 'Villa à Ngor']);
        app(CreditLedger::class)->grant($agency, CreditLotOrigin::Welcome, 500, now()->addDays(180));
        app(BoostPurchaseService::class)->purchase(
            $property->fresh(),
            BoostProduct::query()->where('kind', 'featured')->where('duration_days', 7)->sole(),
            $admin,
        );

        // Ce qu'écrit `PropertyModerationService::hold()` — la clôture sans remboursement.
        $property->forceFill([
            'status' => PropertyStatus::Rejected, 'visibility' => PropertyVisibility::Private,
            'published_at' => null, 'platform_hold_at' => now(),
        ])->save();

        $stockee = AppNotification::query()->where('user_id', $admin->id)->where('code', 'boost.ended')->sole();
        $this->assertSame('Promotion ended', $stockee->title);

        $ligne = $this->laClocheDe($admin, 'en')->get('boost.ended');
        $this->assertNotNull($ligne);
        $this->assertSame(['bien', false], [$ligne['famille'], $ligne['a_traiter']]);
        $this->assertSame("/app/properties/{$property->id}", $ligne['target']['path']);
    }
}
