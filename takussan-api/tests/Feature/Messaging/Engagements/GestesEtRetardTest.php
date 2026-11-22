<?php

namespace Tests\Feature\Messaging\Engagements;

use App\Models\Conversation;
use App\Models\Enums\CommitmentStatus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\Support\SceneDEngagement;
use Tests\TestCase;

/**
 * TCK-2971 (ADR-0130 § 5, AC2, AC3) — `meta.gestes` compte les fils `vous` ou `retard` hors sourdine, chaque
 * fil une fois, sous tout filtre ; `meta.counts.retard` ; et le nombre de requêtes de la liste ne croît pas
 * avec les fils, filtre `retard` compris.
 *
 * Lecteur : l'agent (personnel de l'agence). Chaque fil est un groupe de l'agent et du locataire, sur le bien.
 */
class GestesEtRetardTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase, SceneDEngagement;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-19 10:00:00');
        $this->monterLaScene();
        // Le fil de la scène, à jour pour l'agent : rien n'y attend.
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function fil(): Conversation
    {
        return $this->groupe([$this->agent, $this->locataire], ['property_id' => $this->bien->id]);
    }

    private function retardSur(Conversation $fil): void
    {
        $this->engagement([
            'conversation_id' => $fil->id,
            'status' => CommitmentStatus::Open,
            'holder_id' => $this->locataire->id,
            'due_at' => now()->subDay(),
        ]);
    }

    /** @return array<string, mixed> */
    private function meta(User $lecteur, string $requete = ''): array
    {
        Sanctum::actingAs($lecteur);

        return $this->getJson('/api/conversations'.$requete)->assertOk()->json('meta');
    }

    /** AC2 — chaque fil une fois : un fil à la fois `vous` (un message du client) et en retard compte pour un. */
    public function test_gestes_compte_vous_et_retard_hors_sourdine_chaque_fil_une_fois(): void
    {
        $vousEtRetard = $this->fil();
        $this->retardSur($vousEtRetard);
        $this->message($vousEtRetard, $this->locataire);

        $vous = $this->fil();
        $this->message($vous, $this->locataire);

        $retardSourdine = $this->fil();
        $this->retardSur($retardSourdine);
        $retardSourdine->participants()->updateExistingPivot($this->agent->id, ['is_muted' => true]);

        $retardRappel = $this->fil();
        $this->retardSur($retardRappel);
        $retardRappel->participants()->updateExistingPivot($this->agent->id, ['snoozed_until' => now()->addDay()]);

        $base = $this->meta($this->agent);
        $this->assertSame(2, $base['gestes'], 'vous + retard, hors sourdine et hors rappel, chaque fil une fois.');
        $this->assertSame(2, $base['counts']['retard'], '`counts.retard` compte la sourdine, comme `counts.vous`.');
        $this->assertSame(1, $base['counts']['vous']);
        $this->assertSame(1, $base['counts']['rappel']);

        foreach (['?filter[file]=retard', '?filter[file]=attente', '?filter[type]=direct', '?filter[unread]=1'] as $requete) {
            $this->assertSame(2, $this->meta($this->agent, $requete)['gestes'], $requete);
        }
    }

    /** AC3 — le nombre de requêtes ne croît pas de 1 à 30 fils, filtre `retard` compris. */
    public function test_le_nombre_de_requetes_ne_croit_pas_avec_les_fils(): void
    {
        $compter = function (string $requete): int {
            Sanctum::actingAs($this->agent);
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson('/api/conversations'.$requete)->assertOk();
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };

        // Le même jeu de données à 1 et à 30 fils : un engagement en retard ET un message (sans message, le
        // chargement du dernier message n'a pas lieu, et la différence ne dirait rien de la boîte).
        $this->retardSur($this->fil);
        $this->message($this->fil, $this->locataire);
        // Un premier appel chauffe les mémos du processus (capacités du rôle : une requête au premier appel).
        $compter('');
        $petit = [$compter(''), $compter('?filter[file]=retard')];

        for ($i = 0; $i < 29; $i++) {
            $fil = $this->fil();
            $this->retardSur($fil);
            $this->message($fil, $this->locataire);
        }
        $grand = [$compter(''), $compter('?filter[file]=retard')];

        $this->assertSame($petit, $grand);
        $this->assertSame(30, $this->meta($this->agent)['counts']['retard']);
    }
}
