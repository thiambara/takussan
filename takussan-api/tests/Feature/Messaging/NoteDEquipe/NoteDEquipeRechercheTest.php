<?php

namespace Tests\Feature\Messaging\NoteDEquipe;

use App\Models\Enums\ParticipantRole;
use App\Models\Message;
use App\Models\User;
use App\Services\Admin\ImpersonationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\Support\SceneDeNoteDEquipe;

/**
 * TCK-2965 (ADR-0128 § 6, chemin 4, AC2, AC6 bis) — `GET /api/search/messages` sur Meilisearch réel : le
 * document porte `visibility`, l'attribut est filtrable, et `MessageSearchService` écarte la note DANS le
 * moteur. Le témoin de l'emplacement du filtre est `meta.total` : filtrée après la pagination (la seule
 * défense SQL des résultats hydratés), la page serait vide mais le total vaudrait 1.
 */
class NoteDEquipeRechercheTest extends ApiTestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;
    use SceneDeNoteDEquipe;

    private const NOTE = 'Le bailleur hésite à renouveler, ne rien promettre.';

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLaScene();
    }

    private function chercher(User $lecteur): TestResponse
    {
        Sanctum::actingAs($lecteur);

        return $this->getJson('/api/search/messages?q='.urlencode(self::NOTE))->assertOk();
    }

    private function indexer(): void
    {
        $this->indexSearchable(Message::class);
    }

    public function test_le_document_porte_sa_visibilite(): void
    {
        $note = $this->ecrireUneNote(self::NOTE);

        $this->assertSame('team', $note->toSearchableArray()['visibility']);
        $this->assertContains('visibility', config('scout.meilisearch.index-settings.'.Message::class.'.filterableAttributes'));
    }

    public function test_chemin_4_la_recherche_du_texte_exact_de_la_note(): void
    {
        $this->ecrireUnMessage('Bonjour à tous.');
        $this->ecrireUneNote(self::NOTE);
        $this->indexer();

        foreach ($this->nonLecteurs() as $lecteur) {
            $reponse = $this->chercher($lecteur);
            $this->assertSame(0, $reponse->json('meta.total'), "le total de #{$lecteur->id}");
            $this->assertSame([], $reponse->json('data'));
        }

        $reponse = $this->chercher($this->collegue);
        $this->assertSame(1, $reponse->json('meta.total'));
        $this->assertSame(self::NOTE, $reponse->json('data.0.content'));
    }

    /**
     * Le filtre est DANS le moteur, pas sur la page rendue : 25 notes plus récentes que l'unique message
     * pour tous, et une page de 20. Filtrées après le moteur (la seule défense SQL), la première page du
     * locataire serait vide (les 20 notes écartées) pour un total de 1 — Scout recompte le total en SQL
     * dès qu'une requête `query()` est posée, d'où ce témoin-ci plutôt que le seul total.
     */
    public function test_chemin_4_bis_la_page_de_recherche_n_est_pas_filtree_apres_le_moteur(): void
    {
        $this->ecrireUnMessage('La caution est versée.');
        for ($i = 1; $i <= 25; $i++) {
            (new Message)->forceFill([
                'conversation_id' => $this->fil->id,
                'sender_id' => $this->auteur->id,
                'type' => 'text',
                'content' => "Caution, relance {$i}.",
                'visibility' => 'team',
                'created_at' => now()->addMinutes($i),
            ])->save();
        }
        $this->indexer();

        Sanctum::actingAs($this->locataire);
        $page = $this->getJson('/api/search/messages?q=caution&sort=-created_at&per_page=20')->assertOk();
        $this->assertSame(['La caution est versée.'], array_column($page->json('data'), 'content'));
        $this->assertSame(1, $page->json('meta.total'));
    }

    /**
     * L'index en retard sur la base : un message indexé `all`, devenu `team` par une écriture qui ne passe
     * pas par Scout. Le moteur le rend ; la règle SQL des résultats hydratés (`query()`) l'écarte, et le
     * total recompté suit.
     */
    public function test_chemin_4_ter_un_index_en_retard_ne_fait_pas_fuir_la_note(): void
    {
        $message = $this->ecrireUnMessage(self::NOTE);
        $this->indexer();
        DB::table('messages')->where('id', $message->id)->update(['visibility' => 'team']);

        $reponse = $this->chercher($this->locataire);
        $this->assertSame([], $reponse->json('data'));
        $this->assertSame(0, $reponse->json('meta.total'));
        $this->assertSame(1, $this->chercher($this->collegue)->json('meta.total'), 'le témoin la retrouve');
    }

    /** Le moteur `collection` (sans Meilisearch) : la même règle, par la requête SQL. */
    public function test_chemin_4_quater_le_moteur_collection(): void
    {
        config(['scout.driver' => 'collection']);
        $this->ecrireUnMessage('Bonjour à tous.');
        $this->ecrireUneNote(self::NOTE);

        $this->assertSame([], $this->chercher($this->locataire)->json('data'));
        $this->assertSame(self::NOTE, $this->chercher($this->collegue)->json('data.0.content'));
    }

    /** Le super-admin participant la retrouve ; sous l'impersonation du locataire, non. */
    public function test_ac6_bis_le_super_admin_hors_et_sous_impersonation(): void
    {
        $operateur = User::factory()->create();
        $this->materializeRoleProfile($operateur, 'super_admin');
        // La recherche reste bornée aux fils dont on est participant, super-admin compris.
        $this->fil->participants()->attach($operateur->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);
        $this->ecrireUneNote(self::NOTE);
        $this->indexer();

        $this->assertSame(1, $this->chercher($operateur)->json('meta.total'));

        ['token' => $jeton] = app(ImpersonationService::class)->start($operateur, $this->locataire, 'Ticket support 4821 : relecture.');
        $this->app['auth']->forgetGuards();
        $sous = $this->withToken($jeton)->getJson('/api/search/messages?q='.urlencode(self::NOTE))->assertOk();
        $this->assertSame(0, $sous->json('meta.total'));
    }
}
