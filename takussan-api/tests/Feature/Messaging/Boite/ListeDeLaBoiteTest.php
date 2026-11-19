<?php

namespace Tests\Feature\Messaging\Boite;

use App\Models\Conversation;
use App\Models\Enums\MessageType;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Models\Message;
use App\Models\User;
use App\Services\Messaging\EvenementsDuFil;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\SceneDeNoteDEquipe;

/**
 * TCK-2967 (ADR-0128 § 7, AC3, AC4, AC5) — la boîte dans `GET /api/conversations` : `meta.counts`,
 * `meta.gestes` (la pastille), l'ordre d'un rappel échu, et un nombre de requêtes qui ne croît pas avec
 * le nombre de fils.
 */
class ListeDeLaBoiteTest extends ApiTestCase
{
    use RefreshDatabase, SceneDeNoteDEquipe;

    private ?LeasePayment $relancee = null;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-18 10:00:00');
        $this->monterLaScene();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function message(Conversation $fil, User $auteur): Message
    {
        return Message::create([
            'conversation_id' => $fil->id,
            'sender_id' => $auteur->id,
            'type' => MessageType::Text->value,
            'content' => 'Bonjour',
        ]);
    }

    /** @return array<string, mixed> */
    private function meta(User $lecteur, string $requete = ''): array
    {
        Sanctum::actingAs($lecteur);

        return $this->getJson('/api/conversations'.$requete)->assertOk()->json('meta');
    }

    /** AC3 — `gestes` = les fils `vous` hors sourdine (et hors archives), quel que soit `filter[…]`. */
    public function test_gestes_compte_les_fils_vous_hors_sourdine_quel_que_soit_le_filtre(): void
    {
        $this->message($this->fil, $this->locataire);                       // vous
        $deux = $this->groupe([$this->auteur, $this->locataire]);
        $this->message($deux, $this->locataire);                            // vous
        $sourdine = $this->groupe([$this->auteur, $this->locataire]);
        $this->message($sourdine, $this->locataire);                        // vous, en sourdine
        $sourdine->participants()->updateExistingPivot($this->auteur->id, ['is_muted' => true]);
        $archive = $this->groupe([$this->auteur, $this->locataire]);
        $this->message($archive, $this->locataire);                         // vous, archivé
        $archive->participants()->updateExistingPivot($this->auteur->id, ['archived_at' => now()]);
        $attente = $this->groupe([$this->auteur, $this->locataire]);
        $this->message($attente, $this->auteur);                            // attente
        $rappel = $this->groupe([$this->auteur, $this->locataire]);
        $this->message($rappel, $this->locataire);                          // rappel
        $rappel->participants()->updateExistingPivot($this->auteur->id, ['snoozed_until' => now()->addHour()]);

        $base = $this->meta($this->auteur);
        $this->assertSame(2, $base['gestes']);
        $this->assertSame(3, $base['counts']['vous'], '`counts.vous` compte la sourdine, comme `counts.unread`.');
        $this->assertSame(1, $base['counts']['attente']);
        $this->assertSame(1, $base['counts']['rappel']);
        // Cinq groupes hors archives, plus la salle du bail de la scène (`SallesDuFil`, sans message : `ajour`).
        $this->assertSame(6, $base['counts']['all']);

        foreach (['?filter[file]=attente', '?filter[type]=direct', '?filter[unread]=1', '?archived=1', '?filter[search]=zzzz'] as $requete) {
            $meta = $this->meta($this->auteur, $requete);
            $this->assertSame(2, $meta['gestes'], $requete);
            $this->assertSame($base['counts'], $meta['counts'], $requete);
        }
    }

    /** AC4 — un rappel échu remonte en tête de la liste triée par dernier échange ; futur, il garde sa place. */
    public function test_un_rappel_echu_remonte_en_tete(): void
    {
        $ancien = $this->groupe([$this->auteur, $this->locataire]);
        $this->message($ancien, $this->locataire);
        Carbon::setTestNow('2026-11-18 10:30:00');
        $recent = $this->groupe([$this->auteur, $this->locataire]);
        $this->message($recent, $this->locataire);
        $ancien->participants()->updateExistingPivot($this->auteur->id, ['snoozed_until' => '2026-11-18 11:00:00']);

        $ordre = function () use ($ancien, $recent): array {
            Sanctum::actingAs($this->auteur);

            $ids = array_column($this->getJson('/api/conversations')->assertOk()->json('data'), 'id');

            // La salle du bail de la scène, sans message, vient en dernier : hors de la question.
            return array_values(array_intersect($ids, [$ancien->id, $recent->id, $this->fil->id]));
        };

        Carbon::setTestNow('2026-11-18 10:45:00');
        $this->assertSame([$recent->id, $ancien->id, $this->fil->id], $ordre());

        Carbon::setTestNow('2026-11-18 11:00:01');
        $this->assertSame([$ancien->id, $recent->id, $this->fil->id], $ordre());

        // Un échange plus récent que l'échéance repasse devant.
        Carbon::setTestNow('2026-11-18 11:05:00');
        $this->message($recent, $this->locataire);
        $this->assertSame([$recent->id, $ancien->id, $this->fil->id], $ordre());
    }

    /**
     * Sous `filter[file]=vous`, celui qui attend depuis le plus longtemps d'abord (`attend_depuis` croissant,
     * maquette `fil-boite` D) ; sans filtre, l'ordre « dernier échange » ne change pas.
     */
    public function test_a_vous_suit_l_attente_la_plus_ancienne(): void
    {
        Carbon::setTestNow('2026-11-18 08:00:00');
        $ancien = $this->groupe([$this->auteur, $this->locataire]);
        $this->message($ancien, $this->locataire);
        Carbon::setTestNow('2026-11-18 09:00:00');
        $moyen = $this->groupe([$this->auteur, $this->locataire]);
        $this->message($moyen, $this->locataire);
        Carbon::setTestNow('2026-11-18 09:30:00');
        $recent = $this->groupe([$this->auteur, $this->locataire]);
        $this->message($recent, $this->locataire);
        // Le client relance le plus ancien : son dernier échange est le plus récent, son attente la plus longue.
        Carbon::setTestNow('2026-11-18 09:55:00');
        $this->message($ancien, $this->locataire);
        Carbon::setTestNow('2026-11-18 10:00:00');

        $ordre = function (string $requete) use ($ancien, $moyen, $recent): array {
            Sanctum::actingAs($this->auteur);
            $ids = array_column($this->getJson('/api/conversations'.$requete)->assertOk()->json('data'), 'id');

            return array_values(array_intersect($ids, [$ancien->id, $moyen->id, $recent->id]));
        };

        $this->assertSame([$ancien->id, $moyen->id, $recent->id], $ordre('?filter[file]=vous'));
        $this->assertSame([$ancien->id, $recent->id, $moyen->id], $ordre(''));
    }

    /** AC5 — autant de requêtes pour 1 fil que pour 30, filtre `file` compris. */
    public function test_le_nombre_de_requetes_ne_croit_pas_avec_les_fils(): void
    {
        $compter = function (string $requete): int {
            Sanctum::actingAs($this->auteur);
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson('/api/conversations'.$requete)->assertOk();
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };

        // Le fil seul est confié : sans aucun fil confié, le chargement d'`assignedTo` ne fait pas sa requête
        // (aucune clé), et la différence d'UNE requête ne dirait rien du nombre de fils.
        $this->peupler($this->fil, 3);
        $un = $compter('?per_page=50');
        // Filtré sur `attente`, où le fil confié (à un collègue) se trouve pour l'auteur : la page n'est pas vide.
        $unFiltre = $compter('?per_page=50&filter[file]=attente');

        for ($i = 1; $i < 30; $i++) {
            $this->peupler($this->groupe([$this->auteur, $this->collegue, $this->locataire, $this->bailleur]), $i);
        }
        Sanctum::actingAs($this->auteur);
        // 30 groupes, plus la salle du bail de la scène.
        $this->assertCount(31, $this->getJson('/api/conversations?per_page=50')->json('data'));

        $this->assertSame($un, $compter('?per_page=50'));
        $this->assertSame($unFiltre, $compter('?per_page=50&filter[file]=attente'));
    }

    /** Un fil de chaque sorte, à tour de rôle : client en dernier, équipe en dernier, événement, confié, rappel. */
    private function peupler(Conversation $fil, int $i): void
    {
        match ($i % 5) {
            0 => $this->message($fil, $this->locataire),
            1 => $this->message($fil, $this->collegue),
            // TCK-2967 — un code qui peut attendre (`attend` au catalogue) : `ecrire` refuse `action_for` aux autres.
            2 => app(EvenementsDuFil::class)->ecrire($fil, $this->relancee ??= LeasePayment::factory()->create([
                'lease_id' => $this->bail->id, 'payer_id' => $this->bail->tenant_id, 'status' => PaymentStatus::Pending, 'amount' => 100_000, 'due_date' => '2026-12-01',
            ]), 'lease_payment.reminded', ['due_date' => '2026-12-01'], [$this->locataire]),
            3 => tap($this->message($fil, $this->locataire), fn () => $fil->forceFill(['assigned_to_id' => $this->collegue->id])->save()),
            default => tap($this->message($fil, $this->locataire), fn () => $fil->participants()->updateExistingPivot($this->auteur->id, ['snoozed_until' => now()->addDay()])),
        };
    }
}
