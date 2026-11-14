<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\MaintenanceActors;

/**
 * TCK-2624, AC5 — l'accueil du bailleur ne montre jamais le devis d'un autre bailleur.
 *
 * La fixture tient DEUX bailleurs dans la MÊME agence (le cloisonnement ne peut donc pas venir de
 * l'agence) et un troisième dans une autre. Chaque requête est celle que le front envoie, au
 * paramètre près : `PARAMETRES_DES_DEVIS_DU_BAILLEUR` et `PARAMETRES_DES_EN_COURS_DU_BAILLEUR`
 * (takussan-web/src/lib/queries/maintenance-signalement.ts), lues par `AFaireBailleur` et
 * `EnCoursSurVosBiens`. Le cloisonnement est la branche bailleur de
 * {@see MaintenanceRequest::scopeVisibleTo()} (`BailleurDuBien::restreindre`).
 */
class DevisDuBailleurCloisonneTest extends ApiTestCase
{
    use MaintenanceActors, RefreshDatabase;

    private const CHAMPS = 'fields[maintenance_requests]=id,property_id,requester_id,assigned_to,title,category,priority,status,'
        .'scheduled_at,completed_at,queue_entered_at,owner_reminded_at,quote_amount,quote_currency,created_at,'
        .'estimated_cost,actual_cost,quote_submitted_at,quote_decision_at'
        .'&fields[properties]=id,title,slug,agency_id'
        .'&fields[users]=id,first_name,last_name,username';

    private const DEVIS = '/api/maintenance-requests?'.self::CHAMPS
        .'&filter[status]=awaiting_owner&include=property,requester,assignee&sort=-created_at&per_page=10';

    private const EN_COURS = '/api/maintenance-requests?'.self::CHAMPS
        .'&filter[status]=open,acknowledged,quote_requested,quote_submitted,approved,assigned,in_progress'
        .'&include=property,assignee&sort=-created_at&per_page=5';

    public function test_ac5_le_bailleur_ne_voit_jamais_le_devis_d_un_autre_bailleur_sur_son_accueil(): void
    {
        $devis = ['quote_amount' => 75000, 'quote_currency' => 'XOF', 'quote_submitted_at' => now(), 'accepted_at' => now()];

        // Bailleur A et son devis à décider.
        ['agency' => $agence, 'landlord' => $a, 'mr' => $devisDeA, 'tenant' => $locataire] = $this->maintenanceScenario(MaintenanceStatus::AwaitingOwner, $devis);

        // Bailleur B, MÊME agence : son devis à décider et une intervention en cours.
        $b = $this->landlordOf($agence);
        $bienDeB = Property::factory()->create(['user_id' => $b->id, 'agency_id' => $agence->id]);
        $devisDeB = MaintenanceRequest::factory()->create(array_merge($devis, [
            'property_id' => $bienDeB->id, 'requester_id' => $locataire->id, 'status' => MaintenanceStatus::AwaitingOwner,
        ]));
        $enCoursDeB = MaintenanceRequest::factory()->create([
            'property_id' => $bienDeB->id, 'requester_id' => $locataire->id, 'status' => MaintenanceStatus::InProgress,
        ]);

        // Bailleur C, autre agence : son devis à décider.
        ['mr' => $devisDeC] = $this->maintenanceScenario(MaintenanceStatus::AwaitingOwner, $devis);

        Sanctum::actingAs($a);

        $lus = $this->getJson(self::DEVIS)->assertOk()->assertJsonPath('meta.total', 1);
        $this->assertSame([$devisDeA->id], array_column($lus->json('data'), 'id'));

        $ids = array_column($this->getJson(self::EN_COURS)->assertOk()->json('data'), 'id');
        $this->assertNotContains($enCoursDeB->id, $ids);
        $this->assertNotContains($devisDeB->id, $ids);
        $this->assertNotContains($devisDeC->id, $ids);

        // Témoin : B, lui, voit son devis, et seulement le sien. Sans ce témoin, une liste vide
        // pour tout le monde passerait le test.
        Sanctum::actingAs($b);
        $this->assertSame([$devisDeB->id], array_column(
            $this->getJson(self::DEVIS)->assertOk()->assertJsonPath('meta.total', 1)->json('data'), 'id',
        ));
    }
}
