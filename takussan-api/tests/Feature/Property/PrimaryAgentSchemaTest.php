<?php

namespace Tests\Feature\Property;

use App\Models\Enums\CollaboratorRole;
use App\Models\PropertyCollaborator;
use Illuminate\Database\QueryException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\TestCase;

/**
 * TCK-504 (contrainte 1, AC2, AC3 ; ADR-0053 §1) — **un seul principal par bien, et seulement un
 * `agent`, garantis par la BASE**, pas par l'écran ni par le service.
 *
 * Ces tests écrivent par le constructeur de requêtes, en contournant délibérément le service et le
 * modèle : c'est le chemin qu'une commande, une réparation à la main ou un futur écrivain
 * emprunterait sans le savoir.
 *
 * Chaque tentative refusée tourne dans `DB::transaction()` — un point de sauvegarde sous
 * `RefreshDatabase` —, sans quoi PostgreSQL abandonnerait la transaction du test entier (piège n° 1).
 */
class PrimaryAgentSchemaTest extends TestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    public function test_deux_lignes_principales_sur_le_meme_bien_sont_refusees_par_l_index(): void
    {
        $agency = $this->agence();
        $property = $this->bienDe($agency);
        $a = $this->collaborateur($property, $this->personnel($agency));
        $b = $this->collaborateur($property, $this->personnel($agency), '2026-02-01 09:00:00');

        DB::table('property_collaborators')->where('id', $a->id)->update(['is_primary' => true]);

        $refus = null;
        try {
            DB::transaction(fn () => DB::table('property_collaborators')->where('id', $b->id)->update(['is_primary' => true]));
        } catch (UniqueConstraintViolationException $e) {
            $refus = $e;
        }

        $this->assertNotNull($refus, 'Deux principaux sur un même bien ont été acceptés.');
        $this->assertStringContainsString('property_collaborators_one_primary_per_property', $refus->getMessage());
        $this->assertSame(1, DB::table('property_collaborators')->where('property_id', $property->id)->where('is_primary', true)->count());
    }

    /** L'index est PARTIEL : il ne contraint que les lignes marquées, et bien par bien. */
    public function test_l_index_ne_contraint_ni_les_lignes_non_marquees_ni_les_autres_biens(): void
    {
        $agency = $this->agence();
        $p1 = $this->bienDe($agency);
        $p2 = $this->bienDe($agency);
        $agent = $this->personnel($agency);

        $l1 = $this->collaborateur($p1, $agent);
        $l2 = $this->collaborateur($p2, $agent);
        $this->collaborateur($p1, $this->personnel($agency), '2026-03-01 09:00:00');

        DB::table('property_collaborators')->whereIn('id', [$l1->id, $l2->id])->update(['is_primary' => true]);

        $this->assertSame(2, DB::table('property_collaborators')->where('is_primary', true)->count());
    }

    /** AC3, versant schéma — un `viewer`, un `manager` ou un `co_owner` ne porte jamais la marque. */
    public function test_un_role_autre_qu_agent_ne_peut_pas_porter_la_marque(): void
    {
        $agency = $this->agence();
        $property = $this->bienDe($agency);

        foreach ([CollaboratorRole::Viewer, CollaboratorRole::Manager, CollaboratorRole::CoOwner] as $role) {
            $ligne = PropertyCollaborator::create([
                'property_id' => $property->id,
                'user_id' => $this->personnel($agency)->id,
                'role' => $role->value,
                'invited_at' => '2026-01-10 09:00:00',
            ]);

            $refus = null;
            try {
                DB::transaction(fn () => DB::table('property_collaborators')->where('id', $ligne->id)->update(['is_primary' => true]));
            } catch (QueryException $e) {
                $refus = $e;
            }

            $this->assertNotNull($refus, "Un collaborateur {$role->value} a reçu la marque de principal.");
            $this->assertSame('23514', $refus->getCode(), $refus->getMessage());
            $this->assertStringContainsString('property_collaborators_primary_is_agent', $refus->getMessage());
        }
    }

    /**
     * Retirer le rôle `agent` au principal par le modèle (le chemin du `PUT …/collaborators/{c}`)
     * efface la marque au lieu de heurter le `CHECK` : le repli reprend.
     */
    public function test_changer_le_role_du_principal_efface_la_marque_au_lieu_d_echouer(): void
    {
        $agency = $this->agence();
        $property = $this->bienDe($agency);
        $ligne = $this->collaborateur($property, $this->personnel($agency));
        $ligne->forceFill(['is_primary' => true])->save();

        $ligne->update(['role' => CollaboratorRole::Viewer->value]);

        $this->assertFalse($ligne->fresh()->is_primary);
        $this->assertSame(CollaboratorRole::Viewer, $ligne->fresh()->role);
    }

    /** `is_primary` n'est pas `fillable` : ni `store` ni `update` des collaborateurs ne la posent. */
    public function test_la_marque_ne_se_pose_pas_par_affectation_de_masse(): void
    {
        $agency = $this->agence();
        $property = $this->bienDe($agency);

        $ligne = PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => $this->personnel($agency)->id,
            'role' => CollaboratorRole::Agent->value,
            'is_primary' => true,
        ]);
        $ligne->update(['is_primary' => true]);

        $this->assertFalse($ligne->fresh()->is_primary);
    }
}
