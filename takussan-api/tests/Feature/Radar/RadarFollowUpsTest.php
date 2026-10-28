<?php

namespace Tests\Feature\Radar;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarListingStage;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Services\Radar\RadarFollowUps;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2388 (décision 4, porteur 2026-10-28) — la file « à relancer » : un message envoyé sans issue depuis
 * `radar.follow_ups.after_days` jours, dernier de sa chaîne, dont une annonce est encore `contacted`.
 */
class RadarFollowUpsTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    private const MAINTENANT = '2026-10-28 10:00:00';

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(self::MAINTENANT);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function suivis(): RadarFollowUps
    {
        return $this->app->make(RadarFollowUps::class);
    }

    /** Un message envoyé il y a `$jours` jours, sur une annonce `contacted`. */
    private function envoye(float $jours, RadarListingStage $etape = RadarListingStage::Contacted, ?RadarAdvertiser $annonceur = null): RadarOutreach
    {
        $listing = RadarListing::factory()->reviewed()->create(['stage' => $etape]);
        $outreach = RadarOutreach::factory()->withListings($listing)->create([
            'sent_at' => now()->subMinutes((int) round($jours * 1440)),
        ] + ($annonceur ? ['radar_advertiser_id' => $annonceur->id] : []));

        return $outreach;
    }

    /** @return list<int> */
    private function ids(Builder $q): array
    {
        return $q->pluck('radar_outreaches.id')->all();
    }

    public function test_deux_jours_et_vingt_trois_heures_attendent_trois_jours_relancent(): void
    {
        $attend = $this->envoye(2 + 23 / 24);
        $du = $this->envoye(3);

        $this->assertSame([$attend->id], $this->ids($this->suivis()->awaiting()));
        $this->assertSame([$du->id], $this->ids($this->suivis()->due()));
        $this->assertEqualsCanonicalizing([$attend->id, $du->id], $this->ids($this->suivis()->open()));
    }

    public function test_suivi_d_une_relance_seule_la_relance_compte(): void
    {
        $premier = $this->envoye(10);
        $relance = RadarOutreach::factory()->followUpOf($premier)->create(['sent_at' => now()->subDays(4)]);
        $relance->listings()->attach($premier->listings()->pluck('radar_listings.id')->all());

        $this->assertSame([$relance->id], $this->ids($this->suivis()->due()));
    }

    public function test_un_brouillon_de_relance_ne_ferme_pas_la_chaine(): void
    {
        $premier = $this->envoye(10);
        // La relance est préparée, jamais envoyée : le message d'origine reste le dernier de sa chaîne ENVOYÉE.
        $brouillon = RadarOutreach::factory()->followUpOf($premier)->create();
        $brouillon->listings()->attach($premier->listings()->pluck('radar_listings.id')->all());

        $this->assertSame([$premier->id], $this->ids($this->suivis()->due()));
        $this->assertSame([$premier->id], $this->ids($this->suivis()->open()));

        // Une fois la relance envoyée, elle seule compte.
        $brouillon->forceFill(['sent_at' => now()->subDays(1)])->save();

        $this->assertSame([], $this->ids($this->suivis()->due()));
        $this->assertSame([$brouillon->id], $this->ids($this->suivis()->open()));
    }

    public function test_une_issue_posee_sort_le_message_de_la_file(): void
    {
        $outreach = $this->envoye(5);
        $outreach->forceFill(['outcome' => 'question', 'outcome_at' => now()])->save();

        $this->assertSame([], $this->ids($this->suivis()->open()));
    }

    public function test_un_message_non_envoye_n_y_entre_pas(): void
    {
        $outreach = $this->envoye(5);
        $outreach->forceFill(['sent_at' => null])->save();

        $this->assertSame([], $this->ids($this->suivis()->open()));
    }

    public function test_sans_annonce_contacted_le_message_n_y_est_plus(): void
    {
        $this->envoye(5, RadarListingStage::Consented);
        $this->envoye(5, RadarListingStage::Refused);
        $deux = $this->envoye(5);
        $deux->listings()->attach(RadarListing::factory()->reviewed()->create(['stage' => RadarListingStage::DoNotContact])->id);

        // Un seul des trois a une annonce encore `contacted`.
        $this->assertSame([$deux->id], $this->ids($this->suivis()->due()));
    }

    public function test_le_message_propose_sans_reponse_au_rang_deux_echu_et_pas_au_rang_un_ni_avant_l_echeance(): void
    {
        $message = fn (int $rang, float $jours) => RadarOutreach::factory()->make([
            'follow_up_rank' => $rang, 'sent_at' => now()->subMinutes((int) round($jours * 1440)),
        ]);

        $this->assertFalse($this->suivis()->proposesNoAnswer($message(1, 10)));
        $this->assertTrue($this->suivis()->proposesNoAnswer($message(2, 10)));
        // L'échéance elle-même : trois jours pile, elle est atteinte ; un jour, la relance attend sa réponse.
        $this->assertTrue($this->suivis()->proposesNoAnswer($message(2, 3)));
        $this->assertFalse($this->suivis()->proposesNoAnswer($message(2, 1)));
        $this->assertFalse($this->suivis()->proposesNoAnswer(RadarOutreach::factory()->make(['follow_up_rank' => 2, 'sent_at' => null])));

        config(['radar.follow_ups.max' => 3]);
        $this->assertFalse($this->suivis()->proposesNoAnswer($message(2, 10)));
    }

    public function test_l_echeance_se_lit_dans_la_configuration_et_nulle_part_ailleurs(): void
    {
        $outreach = $this->envoye(4);
        $this->assertSame([$outreach->id], $this->ids($this->suivis()->due()));
        $this->assertTrue($this->suivis()->dueAt($outreach)->equalTo($outreach->sent_at->copy()->addDays(3)));

        config(['radar.follow_ups.after_days' => 5]);

        $this->assertSame([], $this->ids($this->suivis()->due()));
        $this->assertSame([$outreach->id], $this->ids($this->suivis()->awaiting()));
        $this->assertTrue($this->suivis()->dueAt($outreach)->equalTo($outreach->sent_at->copy()->addDays(5)));
    }

    public function test_le_tableau_de_bord_compte_les_annonceurs_a_relancer_et_les_messages_en_attente(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::Support);
        $awa = RadarAdvertiser::factory()->create();
        // Deux messages dus pour le même annonceur : un seul annonceur à relancer.
        $this->envoye(4, annonceur: $awa);
        $this->envoye(6, annonceur: $awa);
        $this->envoye(3);
        $this->envoye(1);
        $this->envoye(2);

        $this->getJson('/api/admin/radar/dashboard')
            ->assertOk()
            ->assertJsonPath('data.follow_ups_due', 2)
            ->assertJsonPath('data.outreaches_awaiting', 2);
    }
}
