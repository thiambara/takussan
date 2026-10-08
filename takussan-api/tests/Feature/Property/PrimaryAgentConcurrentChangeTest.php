<?php

namespace Tests\Feature\Property;

use App\Exceptions\ApiError;
use App\Models\Enums\CollaboratorRole;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use App\Services\Property\PrimaryAgentDesignator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-504, vérification adverse m1 — **une désignation croisée avec un changement de rôle ou une
 * suppression rend un refus contractuel, jamais une 500.** ADR-0053 §3 promet des `ApiError` à
 * TCK-603, qui appelle le service en lot et n'attrape qu'elles.
 *
 * Trois couches, chacune prouvée seule ici ; la course réelle à deux processus, qui les éprouve
 * ensemble et une par une, est dans les notes du ticket :
 *  1. le modèle retire la marque STOCKÉE quand le rôle quitte `agent` (instance périmée) ;
 *  2. `update()`/`destroy()` des collaborateurs prennent le verrou du bien et relisent la ligne ;
 *  3. le service pose la marque par une écriture conditionnelle, et traduit zéro ligne en refus.
 *
 * Une écriture « concurrente » s'injecte ici dans la même transaction, au point exact où un autre
 * processus validerait : après la lecture du service, avant sa dernière écriture.
 */
class PrimaryAgentConcurrentChangeTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Property $property;

    private User $admin;

    private PropertyCollaborator $ligneA;

    private PropertyCollaborator $ligneB;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Http::preventStrayRequests();

        $agency = $this->agence();
        $this->admin = $this->personnel($agency, 'agency_admin');
        $this->property = $this->bienDe($agency);
        $this->ligneA = $this->collaborateur($this->property, $this->personnel($agency), '2026-01-10 09:00:00');
        $this->ligneB = $this->collaborateur($this->property, $this->personnel($agency), '2026-05-20 09:00:00');
    }

    /** @return list<int> */
    private function marques(): array
    {
        return PropertyCollaborator::query()->where('property_id', $this->property->id)
            ->where('is_primary', true)->orderBy('id')->pluck('id')->all();
    }

    /** Exécute `$ecriture` une fois, juste après que le service a retiré l'ancienne marque. */
    private function entreLaLectureEtLaMarque(callable $ecriture): void
    {
        $fait = false;
        DB::listen(function ($query) use (&$fait, $ecriture): void {
            $sql = strtolower($query->sql);
            if (! $fait && str_starts_with($sql, 'update "property_collaborators"') && str_contains($sql, '"is_primary" = ?')) {
                $fait = true;
                $ecriture();
            }
        });
    }

    private function designer(PropertyCollaborator $ligne): ApiError
    {
        try {
            app(PrimaryAgentDesignator::class)->designate($this->property, $ligne, $this->admin);
        } catch (ApiError $e) {
            return $e;
        }
        $this->fail('la désignation devait être refusée par une ApiError');
    }

    public function test_une_instance_perimee_qui_quitte_le_role_agent_retire_la_marque_stockee(): void
    {
        $perimee = PropertyCollaborator::query()->findOrFail($this->ligneB->id);
        app(PrimaryAgentDesignator::class)->designate($this->property, $this->ligneB, $this->admin);
        $this->assertSame([$this->ligneB->id], $this->marques());

        DB::transaction(fn () => $perimee->fill(['role' => CollaboratorRole::Viewer->value])->save());

        $this->assertSame([], $this->marques());
        $this->assertSame(CollaboratorRole::Viewer, $this->ligneB->fresh()->role);
    }

    public function test_la_cible_sortie_du_role_agent_pendant_la_designation_est_refusee_en_422(): void
    {
        app(PrimaryAgentDesignator::class)->designate($this->property, $this->ligneA, $this->admin);
        $this->entreLaLectureEtLaMarque(fn () => DB::table('property_collaborators')
            ->where('id', $this->ligneB->id)->update(['role' => CollaboratorRole::Viewer->value]));

        $refus = $this->designer($this->ligneB);

        $this->assertSame(422, $refus->getStatusCode());
        $this->assertSame('property.primary_requires_agent', $refus->errorCode);
        $this->assertSame([$this->ligneA->id], $this->marques(), 'le refus annule le retrait de l\'ancienne marque');
    }

    public function test_la_cible_supprimee_pendant_la_designation_est_refusee_en_404(): void
    {
        app(PrimaryAgentDesignator::class)->designate($this->property, $this->ligneA, $this->admin);
        $this->entreLaLectureEtLaMarque(fn () => DB::table('property_collaborators')
            ->where('id', $this->ligneB->id)->delete());

        $refus = $this->designer($this->ligneB);

        $this->assertSame(404, $refus->getStatusCode());
        $this->assertSame('property.collaborator_not_found', $refus->errorCode);
        $this->assertSame([$this->ligneA->id], $this->marques());
    }

    public function test_changer_le_role_seul_prend_le_verrou_du_bien_avant_la_ligne(): void
    {
        $verrous = [];
        DB::listen(function ($query) use (&$verrous): void {
            if (str_contains(strtolower($query->sql), 'for update')) {
                $verrous[] = $query->sql;
            }
        });

        $this->actingAsApi($this->admin)
            ->apiPut("/api/properties/{$this->property->id}/collaborators/{$this->ligneB->id}", ['role' => 'viewer'])
            ->assertOk();
        $this->actingAsApi($this->admin)
            ->apiDelete("/api/properties/{$this->property->id}/collaborators/{$this->ligneA->id}")
            ->assertNoContent();

        $this->assertCount(2, $verrous, implode("\n", $verrous));
        foreach ($verrous as $sql) {
            $this->assertMatchesRegularExpression('/from "properties" where "properties"\."id" = \?.*for update/i', $sql);
        }
    }

    public function test_la_ligne_liee_par_la_route_puis_supprimee_rend_le_refus_contractuel(): void
    {
        // Le lien de route a lu la ligne ; un autre processus la supprime avant le contrôleur.
        $fait = false;
        PropertyCollaborator::retrieved(function (PropertyCollaborator $c) use (&$fait): void {
            if (! $fait && $c->id === $this->ligneB->id) {
                $fait = true;
                DB::table('property_collaborators')->where('id', $c->id)->delete();
            }
        });

        $this->actingAsApi($this->admin)
            ->apiPut("/api/properties/{$this->property->id}/collaborators/{$this->ligneB->id}", ['role' => 'viewer'])
            ->assertNotFound()
            ->assertJsonPath('code', 'property.collaborator_not_found');
    }
}
