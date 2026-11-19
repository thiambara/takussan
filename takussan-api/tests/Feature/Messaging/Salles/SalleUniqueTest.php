<?php

namespace Tests\Feature\Messaging\Salles;

use App\Models\Conversation;
use App\Services\Messaging\SallesDuFil;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\ScenesDeSalles;
use Tests\TestCase;

/**
 * TCK-2960 (AC5) — une seule salle par objet, même ouverte plusieurs fois ; la course est tenue par
 * l'index unique partiel `conversations_salle_unique`, jamais par une exception attrapée.
 */
class SalleUniqueTest extends TestCase
{
    use RefreshDatabase, ScenesDeSalles;

    public function test_deux_ouvertures_rendent_la_meme_salle(): void
    {
        ['lease' => $lease] = $this->sceneDuBail();
        $salles = app(SallesDuFil::class);

        $premiere = $salles->ouvrir($lease->fresh());
        $seconde = $salles->ouvrir($lease->fresh());

        $this->assertSame($premiere->id, $seconde->id);
        $this->assertFalse($seconde->wasRecentlyCreated);
        $this->assertSame(1, Conversation::query()->where('subject_type', 'lease')->where('subject_id', $lease->id)->count());
    }

    public function test_l_index_tient_la_course_deux_insertions_une_ligne(): void
    {
        ['lease' => $lease, 'agent' => $agent] = $this->sceneDuBail();
        $ligne = fn () => [
            'type' => 'lease', 'status' => 'active', 'created_by' => $agent->id,
            'lease_id' => $lease->id, 'property_id' => $lease->property_id,
            'subject_type' => 'lease', 'subject_id' => $lease->id,
            'created_at' => now(), 'updated_at' => now(),
        ];

        // La salle existe déjà (créée par l'observateur) : deux insertions de plus ne posent rien.
        $this->assertSame(0, DB::table('conversations')->insertOrIgnore($ligne()));
        $this->assertSame(0, DB::table('conversations')->insertOrIgnore($ligne()));
        $this->assertSame(1, Conversation::query()->where('type', 'lease')->where('subject_id', $lease->id)->count());
    }

    public function test_l_index_ne_vise_que_les_salles(): void
    {
        ['lease' => $lease, 'agent' => $agent] = $this->sceneDuBail();
        $groupe = fn (string $type) => [
            'type' => $type, 'status' => 'active', 'created_by' => $agent->id,
            'subject_type' => 'lease', 'subject_id' => $lease->id,
            'created_at' => now(), 'updated_at' => now(),
        ];

        // Un groupe et une directe d'un même sujet ne heurtent ni la salle ni l'un l'autre.
        $this->assertSame(1, DB::table('conversations')->insertOrIgnore($groupe('group')));
        $this->assertSame(1, DB::table('conversations')->insertOrIgnore($groupe('group')));
        $this->assertSame(1, DB::table('conversations')->insertOrIgnore($groupe('direct')));
    }

    public function test_une_salle_supprimee_sort_de_l_index(): void
    {
        ['lease' => $lease] = $this->sceneDuBail();
        $salle = $this->salleDe($lease);
        $salle->delete();

        $neuve = app(SallesDuFil::class)->ouvrir($lease->fresh());

        $this->assertNotSame($salle->id, $neuve->id);
        $this->assertTrue($neuve->wasRecentlyCreated);
    }

    public function test_aucune_violation_d_unicite_n_est_attrapee_dans_le_code_des_salles(): void
    {
        foreach ([
            app_path('Services/Messaging/SallesDuFil.php'),
            app_path('Console/Commands/OpenRooms.php'),
            app_path('Http/Controllers/Api/ConversationRoomController.php'),
        ] as $fichier) {
            $source = (string) file_get_contents($fichier);
            $this->assertStringNotContainsString('UniqueConstraintViolation', $source, $fichier);
            $this->assertStringNotContainsString('QueryException', $source, $fichier);
        }
    }
}
