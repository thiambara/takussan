<?php

namespace Tests\Feature\Directory;

use App\Jobs\RefreshDirectoryResponseTimes;
use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Enums\ConversationType;
use App\Models\Message;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Directory\ResponseTimes;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-2518 — le délai de réponse habituel : médiane, sur 90 jours, entre le premier message du
 * visiteur d'un fil de prospect et la première réponse d'un membre de l'agence (pour l'agent : la
 * sienne) ; un fil sans réponse depuis plus de 24 h compte à +∞ ; `null` sous cinq fils comptés ou
 * quand la médiane est infinie. Le job qui le range est idempotent.
 */
class DirectoryResponseTimesTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    private AgentProfile $profil;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agence = Agency::factory()->create();
        $this->agent = User::factory()->create();
        $this->profil = AgentProfile::factory()->create(['user_id' => $this->agent->id, 'agency_id' => $this->agence->id]);
    }

    /**
     * Un fil de prospect : le visiteur écrit à `$il_y_a` (trois jours par défaut), `$repondant` répond
     * `$minutes` plus tard — `null` : personne ne répond. Le visiteur et l'agent en sont participants,
     * comme `PropertyConversationResolver::firstOrCreate()` les y met.
     */
    private function fil(?int $minutes, ?User $repondant = null, ?\DateTimeInterface $il_y_a = null, ConversationType $type = ConversationType::Direct): Conversation
    {
        $visiteur = User::factory()->create();
        $bien = Property::factory()->create(['agency_id' => $this->agence->id]);
        $fil = Conversation::factory()->create(['type' => $type, 'created_by' => $visiteur->id, 'property_id' => $bien->id]);
        $fil->participants()->attach([$visiteur->id, $this->agent->id], ['joined_at' => now()]);
        $depart = ($il_y_a ?? now()->subDays(3))->copy()->startOfMinute();

        Message::factory()->create(['conversation_id' => $fil->id, 'sender_id' => $visiteur->id, 'created_at' => $depart]);
        // Une relance du visiteur n'est pas une réponse.
        Message::factory()->create(['conversation_id' => $fil->id, 'sender_id' => $visiteur->id, 'created_at' => $depart->copy()->addMinutes(1)]);
        // Un avis système n'est la réponse de personne.
        Message::factory()->create(['conversation_id' => $fil->id, 'sender_id' => null, 'type' => 'system', 'created_at' => $depart->copy()->addMinutes(2)]);
        if ($minutes !== null) {
            Message::factory()->create(['conversation_id' => $fil->id, 'sender_id' => ($repondant ?? $this->agent)->id, 'created_at' => $depart->copy()->addMinutes($minutes)]);
            // Une seconde réponse, plus tardive : seule la première compte.
            Message::factory()->create(['conversation_id' => $fil->id, 'sender_id' => ($repondant ?? $this->agent)->id, 'created_at' => $depart->copy()->addMinutes($minutes + 500)]);
        }

        return $fil;
    }

    private function lancer(): void
    {
        (new RefreshDirectoryResponseTimes)->handle(app(ResponseTimes::class));
    }

    /** AC3 — quatre fils répondus : null ; cinq : la médiane, à la minute. */
    public function test_ac3_quatre_fils_repondus_ne_donnent_aucun_delai_cinq_donnent_la_mediane(): void
    {
        foreach ([10, 20, 400, 30] as $minutes) {
            $this->fil($minutes);
        }
        $this->lancer();
        $this->assertNull($this->agence->fresh()->median_response_minutes);
        $this->assertNull($this->profil->fresh()->median_response_minutes);

        $this->fil(25);
        $this->lancer();

        // 10, 20, 25, 30, 400 — la médiane est 25 ; une moyenne rendrait 97.
        $this->assertSame(25, $this->agence->fresh()->median_response_minutes);
        $this->assertSame(25, $this->profil->fresh()->median_response_minutes);
    }

    public function test_la_reponse_d_un_admin_d_agence_compte_pour_l_agence_pas_pour_l_agent(): void
    {
        $admin = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $this->agence->id]);
        foreach ([10, 20, 30, 40, 50] as $minutes) {
            $this->fil($minutes, $admin);
        }

        $this->lancer();

        $this->assertSame(30, $this->agence->fresh()->median_response_minutes);
        $this->assertNull($this->profil->fresh()->median_response_minutes);
    }

    public function test_hors_fenetre_hors_agence_ou_hors_fil_de_prospect_rien_ne_compte(): void
    {
        $etranger = User::factory()->create();
        foreach ([10, 20, 30, 40] as $minutes) {
            $this->fil($minutes);
        }
        $this->fil(15, il_y_a: now()->subDays(91));            // hors fenêtre
        $this->fil(15, $etranger);                             // un non-membre ne répond pas pour l'agence : fil SANS réponse
        $this->fil(15, type: ConversationType::Group);         // un groupe n'est pas un fil de prospect

        $this->lancer();

        // 10, 20, 30, 40 et +∞ (le fil « répondu » par un étranger) : la médiane est 30. Le fil hors
        // fenêtre ou le groupe comptés à 15 la feraient tomber à 25 ou 20 ; la réponse de
        // l'étranger comptée, à 20.
        $this->assertSame(30, $this->agence->fresh()->median_response_minutes);
        $this->assertSame(30, $this->profil->fresh()->median_response_minutes);
    }

    /** Revue — 5 fils répondus en 10 min et 95 ignorés : la médiane tombe sur l'infini, rien n'est affiché. */
    public function test_cinq_fils_repondus_en_dix_minutes_et_quatre_vingt_quinze_ignores_ne_donnent_aucun_delai(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->fil(10);
        }
        for ($i = 0; $i < 95; $i++) {
            $this->fil(null);
        }

        $this->lancer();

        $this->assertNull($this->agence->fresh()->median_response_minutes);
        $this->assertNull($this->profil->fresh()->median_response_minutes);
    }

    /**
     * Revue — la médiane qui tombe ENTRE un délai fini et +∞ est infinie : `null`. C'est le cas où
     * `percentile_cont` rend `Infinity` ; entre deux infinis (cas précédent) il rend `NaN`.
     */
    public function test_quatre_fils_repondus_et_quatre_ignores_ne_donnent_aucun_delai(): void
    {
        foreach ([10, 20, 30, 40] as $minutes) {
            $this->fil($minutes);
        }
        for ($i = 0; $i < 4; $i++) {
            $this->fil(null);
        }

        $this->lancer();

        $this->assertNull($this->agence->fresh()->median_response_minutes);
        $this->assertNull($this->profil->fresh()->median_response_minutes);
    }

    /** Revue — 6 fils répondus et 4 ignorés : la médiane des DIX, infinis compris. */
    public function test_six_fils_repondus_et_quatre_ignores_donnent_la_mediane_des_dix(): void
    {
        foreach ([10, 20, 30, 40, 50, 60] as $minutes) {
            $this->fil($minutes);
        }
        for ($i = 0; $i < 4; $i++) {
            $this->fil(null);
        }

        $this->lancer();

        // 10, 20, 30, 40, 50, 60, +∞ ×4 : entre le 5ᵉ et le 6ᵉ, 55. Les ignorés écartés rendraient 35.
        $this->assertSame(55, $this->agence->fresh()->median_response_minutes);
        $this->assertSame(55, $this->profil->fresh()->median_response_minutes);
    }

    /** Revue — un fil sans réponse de moins de 24 h n'entre ni dans le seuil ni dans la médiane. */
    public function test_un_fil_sans_reponse_de_moins_de_vingt_quatre_heures_ne_compte_pas(): void
    {
        foreach ([10, 20, 30, 40] as $minutes) {
            $this->fil($minutes);
        }
        $this->fil(null, il_y_a: now()->subHours(23));

        $this->lancer();
        $this->assertNull($this->agence->fresh()->median_response_minutes, 'quatre fils comptés : sous le seuil');

        $this->fil(50);
        $this->lancer();

        // 10, 20, 30, 40, 50 : 30. Le fil récent compté à +∞ rendrait 35.
        $this->assertSame(30, $this->agence->fresh()->median_response_minutes);
        $this->assertSame(30, $this->profil->fresh()->median_response_minutes);
    }

    /**
     * Revue — un fil sans réponse ne compte contre l'agent que s'il en est ENCORE participant : un
     * agent qui l'a quitté (fil transmis à un collègue, `left_at` posé) n'en porte pas le silence.
     * L'agence, elle, le porte toujours.
     */
    public function test_un_fil_sans_reponse_que_l_agent_a_quitte_ne_compte_pas_contre_lui(): void
    {
        foreach ([10, 20, 30, 40, 50] as $minutes) {
            $this->fil($minutes);
        }
        $quitte = $this->fil(null);
        $quitte->participants()->updateExistingPivot($this->agent->id, ['left_at' => now()->subDay()]);

        $this->lancer();

        // Agence : 10, 20, 30, 40, 50, +∞ → 35. Agent : le fil quitté n'est plus le sien → 30.
        $this->assertSame(35, $this->agence->fresh()->median_response_minutes);
        $this->assertSame(30, $this->profil->fresh()->median_response_minutes);
    }

    /** Revue — un message de l'agence posé AVANT le premier message du visiteur n'est pas une réponse. */
    public function test_un_message_de_l_agence_avant_le_visiteur_n_est_pas_une_reponse(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $fil = $this->fil(10);
            $premier = Message::query()->where('conversation_id', $fil->id)->min('created_at');
            Message::factory()->create(['conversation_id' => $fil->id, 'sender_id' => $this->agent->id, 'created_at' => Carbon::parse($premier)->subMinutes(30)]);
        }

        $this->lancer();

        $this->assertSame(10, $this->agence->fresh()->median_response_minutes);
        $this->assertSame(10, $this->profil->fresh()->median_response_minutes);
    }

    /** AC4 — deux exécutions à la suite rendent le même état ; une agence repassée sous le seuil perd son délai. */
    public function test_ac4_deux_executions_rendent_le_meme_etat(): void
    {
        $fils = collect([10, 20, 30, 40, 50])->map(fn (int $m) => $this->fil($m));
        $autre = Agency::factory()->create();
        DB::table('agencies')->where('id', $autre->id)->update(['median_response_minutes' => 999]);

        $this->lancer();
        $premier = [$this->agence->fresh()->median_response_minutes, $this->profil->fresh()->median_response_minutes, $autre->fresh()->median_response_minutes];
        $this->lancer();
        $second = [$this->agence->fresh()->median_response_minutes, $this->profil->fresh()->median_response_minutes, $autre->fresh()->median_response_minutes];

        $this->assertSame([30, 30, null], $premier);
        $this->assertSame($premier, $second);

        $fils->first()->delete();
        $this->lancer();
        $this->assertNull($this->agence->fresh()->median_response_minutes, 'sous le seuil, le délai est retiré');
        $this->assertNull($this->profil->fresh()->median_response_minutes);
    }

    public function test_le_job_est_planifie_chaque_nuit(): void
    {
        $events = collect(app(Schedule::class)->events())
            ->filter(fn ($event) => str_contains((string) $event->description, RefreshDirectoryResponseTimes::class));

        $this->assertCount(1, $events);
        $this->assertSame('20 4 * * *', $events->first()->expression);
        $this->assertSame('Africa/Dakar', $events->first()->timezone);
    }
}
