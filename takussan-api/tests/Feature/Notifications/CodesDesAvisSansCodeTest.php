<?php

namespace Tests\Feature\Notifications;

use App\Models\AgencyUpgradeRequest;
use App\Models\AppNotification;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use App\Notifications\AgencyUpgradeRequestSubmittedNotification;
use App\Notifications\Boost\BoostEndedNotification;
use App\Notifications\PropertyProposedNotification;
use App\Notifications\UrgentMaintenanceCreatedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
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
}
