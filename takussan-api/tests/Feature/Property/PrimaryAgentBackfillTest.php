<?php

namespace Tests\Feature\Property;

use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Services\Property\PrimaryPropertyContact;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\TestCase;

/**
 * TCK-504 (AC5, ADR-0053 §6) — **après la migration, aucun bien ne change de contact principal.**
 *
 * Le test rejoue la migration sur un parc construit SANS la colonne : `down()`, puis le parc, puis
 * `up()`. Le DDL de PostgreSQL est transactionnel : `RefreshDatabase` remet tout en place.
 *
 * Le parc croise les configurations où un backfill naïf se tromperait : l'ordre d'invitation contre
 * l'ordre d'insertion et des identifiants, un premier agent bloqué, suspendu ou retiré, une date
 * d'invitation nulle, un bien sans agent, un bien où seul le propriétaire répond, un bien supprimé.
 *
 * La preuve sur le jeu des seeders (`migrate:fresh --seed`, ~840 biens) est rejouée hors PHPUnit
 * sur une base jetable ; elle est consignée dans les notes du ticket.
 */
class PrimaryAgentBackfillTest extends TestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private const MIGRATION = 'database/migrations/2026_10_08_120000_add_is_primary_to_property_collaborators.php';

    private function migration(): Migration
    {
        return require base_path(self::MIGRATION);
    }

    /** @return array<int, int|null> l'identifiant du contact de chaque bien, supprimés compris */
    private function contacts(): array
    {
        return Property::withTrashed()->orderBy('id')->with(PrimaryPropertyContact::eagerLoads())->get()
            ->mapWithKeys(fn (Property $p) => [$p->id => PrimaryPropertyContact::for($p)?->id])
            ->all();
    }

    public function test_le_backfill_marque_le_contact_d_aujourd_hui_et_aucun_contact_ne_change(): void
    {
        $this->migration()->down();

        $agency = $this->agence();

        // P1 — deux agents, le plus ANCIEN invité est créé et inséré EN SECOND (plus grand id,
        // plus grand user_id) : toute règle « première ligne » se trompe.
        $p1 = $this->bienDe($agency);
        $recent1 = $this->personnel($agency);
        $ancien1 = $this->personnel($agency);
        $this->collaborateur($p1, $recent1, '2026-05-20 09:00:00');
        $l1 = $this->collaborateur($p1, $ancien1, '2026-01-10 09:00:00');

        // P2 — le premier invité est BLOQUÉ : c'est le second qui répond aujourd'hui.
        $p2 = $this->bienDe($agency);
        $bloque = $this->personnel($agency);
        $suivant2 = $this->personnel($agency);
        $this->collaborateur($p2, $bloque, '2026-01-10 09:00:00');
        $l2 = $this->collaborateur($p2, $suivant2, '2026-05-20 09:00:00');
        $bloque->update(['status' => UserStatus::Blocked]);

        // P3 — le premier invité est SUSPENDU dans l'agence, le second RETIRÉ (profil supprimé) :
        // le troisième répond.
        $p3 = $this->bienDe($agency);
        $suspendu = $this->personnel($agency);
        $retire = $this->personnel($agency);
        $troisieme = $this->personnel($agency);
        $this->collaborateur($p3, $suspendu, '2026-01-10 09:00:00');
        $this->collaborateur($p3, $retire, '2026-02-10 09:00:00');
        $l3 = $this->collaborateur($p3, $troisieme, '2026-03-10 09:00:00');
        AgentProfile::query()->where('user_id', $suspendu->id)->update(['status' => AgentProfileStatus::Suspended->value]);
        AgentProfile::query()->where('user_id', $retire->id)->first()->delete();

        // P4 — une invitation sans date passe DERRIÈRE une invitation datée.
        $p4 = $this->bienDe($agency);
        $sansDate = $this->personnel($agency);
        $date = $this->personnel($agency);
        PropertyCollaborator::create(['property_id' => $p4->id, 'user_id' => $sansDate->id, 'role' => CollaboratorRole::Agent->value, 'invited_at' => null]);
        $l4 = $this->collaborateur($p4, $date, '2026-06-01 09:00:00');

        // P5 — aucun agent : un `manager` ne répond pas, le propriétaire répond, aucune marque.
        $p5 = $this->bienDe($agency);
        PropertyCollaborator::create(['property_id' => $p5->id, 'user_id' => $this->personnel($agency)->id, 'role' => CollaboratorRole::Manager->value, 'invited_at' => '2026-01-01 09:00:00']);

        // P6 — tous les agents sont inéligibles : le propriétaire répond, aucune marque.
        $p6 = $this->bienDe($agency);
        $horsJeu = $this->personnel($agency);
        $this->collaborateur($p6, $horsJeu);
        $horsJeu->update(['status' => UserStatus::Blocked]);

        // P7 — un bien supprimé en douceur garde le sien : le restaurer ne doit rien changer.
        $p7 = $this->bienDe($agency);
        $recent7 = $this->personnel($agency);
        $ancien7 = $this->personnel($agency);
        $this->collaborateur($p7, $recent7, '2026-04-01 09:00:00');
        $l7 = $this->collaborateur($p7, $ancien7, '2026-01-01 09:00:00');
        $p7->delete();

        // P8 — aucun collaborateur.
        $p8 = $this->bienDe($agency);

        $avant = $this->contacts();

        $this->migration()->up();

        $this->assertSame($avant, $this->contacts(), 'Le backfill a changé le contact principal d\'au moins un bien.');

        $marquees = DB::table('property_collaborators')->where('is_primary', true)->orderBy('id')->pluck('id')->all();
        $this->assertSame(
            collect([$l1, $l2, $l3, $l4, $l7])->pluck('id')->sort()->values()->all(),
            $marquees,
        );

        // Les contacts attendus, nommément : une égalité avant/après ne suffit pas si les deux
        // relevés lisaient la même erreur.
        $this->assertSame($ancien1->id, $avant[$p1->id]);
        $this->assertSame($suivant2->id, $avant[$p2->id]);
        $this->assertSame($troisieme->id, $avant[$p3->id]);
        $this->assertSame($date->id, $avant[$p4->id]);
        $this->assertSame($p5->user_id, $avant[$p5->id]);
        $this->assertSame($p6->user_id, $avant[$p6->id]);
        $this->assertSame($ancien7->id, $avant[$p7->id]);
        $this->assertSame($p8->user_id, $avant[$p8->id]);
    }

    /**
     * Une fois posée, la marque TIENT : le premier invité, réactivé, ne reprend pas la place que
     * l'agence avait de fait donnée au suivant. C'est ce qui distingue le backfill d'un repli muet.
     */
    public function test_apres_le_backfill_un_premier_invite_reactive_ne_reprend_pas_la_place(): void
    {
        $this->migration()->down();

        $agency = $this->agence();
        $property = $this->bienDe($agency);
        $bloque = $this->personnel($agency);
        $suivant = $this->personnel($agency);
        $this->collaborateur($property, $bloque, '2026-01-10 09:00:00');
        $this->collaborateur($property, $suivant, '2026-05-20 09:00:00');
        $bloque->update(['status' => UserStatus::Blocked]);

        $this->migration()->up();
        $bloque->update(['status' => UserStatus::Active]);

        $this->assertSame(
            $suivant->id,
            PrimaryPropertyContact::for($property->fresh()->load(PrimaryPropertyContact::eagerLoads()))?->id,
        );
    }

    /** `down()` rend le schéma d'avant : ni colonne, ni index, ni contrainte. */
    public function test_down_retire_la_colonne_l_index_et_la_contrainte(): void
    {
        $this->migration()->down();

        $this->assertFalse(Schema::hasColumn('property_collaborators', 'is_primary'));
        $this->assertSame(0, DB::table('pg_indexes')->where('indexname', 'property_collaborators_one_primary_per_property')->count());
        $this->assertSame(0, DB::table('pg_constraint')->where('conname', 'property_collaborators_primary_is_agent')->count());

        $this->migration()->up();

        $this->assertTrue(Schema::hasColumn('property_collaborators', 'is_primary'));
    }
}
