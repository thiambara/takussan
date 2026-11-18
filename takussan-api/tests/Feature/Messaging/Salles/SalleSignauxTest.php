<?php

namespace Tests\Feature\Messaging\Salles;

use App\Services\Messaging\SallesDuFil;
use App\Support\TempsReel\CodeDeSignal;
use App\Support\TempsReel\TempsReel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\ScenesDeSalles;
use Tests\TestCase;

/**
 * TCK-2960 (ADR-0129 § 2) — une synchronisation qui change les membres d'une salle émet
 * `participants.updated` sur la salle et `boite.updated` aux SEULES personnes ajoutées ou retirées ; une
 * synchronisation qui ne change rien n'émet rien. Les écritures passent par le modèle du pivot
 * (`EmetDesSignaux`, TCK-2955) : c'est lui qui émet.
 *
 * Chaque phase repart d'un faux émetteur neuf : l'émetteur dédoublonne par unité de travail, et une
 * seconde synchronisation dans la même unité cacherait son `participants.updated`.
 */
class SalleSignauxTest extends TestCase
{
    use RefreshDatabase, ScenesDeSalles;

    public function test_un_changement_de_membre_signale_la_salle_et_les_seules_personnes_concernees(): void
    {
        ['lease' => $lease, 'agency' => $agency, 'landlord' => $landlord, 'agent' => $agent, 'tenant' => $tenant] = $this->sceneDuBail();
        $salle = $this->salleDe($lease);
        $nouveau = $this->agentDe($agency);

        TempsReel::fake();
        $lease->update(['agent_id' => $nouveau->id]);

        TempsReel::assertSignale(CodeDeSignal::ParticipantsUpdated, "sujet.conversation.{$salle->id}", "conversation:{$salle->id}", 1);
        TempsReel::assertSignale(CodeDeSignal::BoiteUpdated, "utilisateur.{$nouveau->id}", "conversation:{$salle->id}", 1);
        TempsReel::assertSignale(CodeDeSignal::BoiteUpdated, "utilisateur.{$agent->id}", "conversation:{$salle->id}", 1);
        foreach ([$landlord, $tenant] as $inchange) {
            TempsReel::assertSignale(CodeDeSignal::BoiteUpdated, "utilisateur.{$inchange->id}", fois: 0);
        }
    }

    public function test_une_synchronisation_sans_changement_n_emet_rien(): void
    {
        ['lease' => $lease] = $this->sceneDuBail();
        $salle = $this->salleDe($lease);

        TempsReel::fake();
        app(SallesDuFil::class)->synchroniser($salle);
        app(SallesDuFil::class)->ouvrir($lease->fresh());
        $lease->update(['monthly_rent' => 123_000]);

        TempsReel::assertRienSignale();
    }

    public function test_la_creation_signale_chaque_membre_entre(): void
    {
        TempsReel::fake();
        ['lease' => $lease, 'landlord' => $landlord, 'agent' => $agent, 'tenant' => $tenant] = $this->sceneDuBail();
        $salle = $this->salleDe($lease);

        TempsReel::assertSignale(CodeDeSignal::ParticipantsUpdated, "sujet.conversation.{$salle->id}", "conversation:{$salle->id}", 1);
        foreach ([$landlord, $agent, $tenant] as $membre) {
            TempsReel::assertSignale(CodeDeSignal::BoiteUpdated, "utilisateur.{$membre->id}", "conversation:{$salle->id}", 1);
        }
    }
}
