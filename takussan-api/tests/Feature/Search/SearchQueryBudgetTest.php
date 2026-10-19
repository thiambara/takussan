<?php

namespace Tests\Feature\Search;

use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\ParticipantRole;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * Le budget de requêtes des chemins de recherche Scout, index peuplé : 2 lignes = 12 lignes.
 *
 * `ProListQueryBudgetTest` garde les listes pro sans recherche, Scout coupé. Une lecture par
 * ligne qui n'apparaît qu'avec une recherche (le paginateur de Scout, qui n'a rien préchargé)
 * n'y a aucun témoin : c'est ici qu'elle rougit. Comme là-bas, le compte porte sur TOUTES les
 * requêtes, et le premier appel (caches de processus) n'est pas compté.
 *
 * TCK-1010 (P59.02) — `GET /api/search/messages` : une lecture de `media` par message.
 */
class SearchQueryBudgetTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private const MOT = 'zorglub';

    private User $moi;

    private User $autre;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->moi = User::factory()->create();
        $this->autre = User::factory()->create();
    }

    public function test_la_recherche_des_messages(): void
    {
        $conversation = Conversation::create([
            'type' => ConversationType::Direct->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Bien',
            'created_by' => $this->moi->id,
        ]);
        foreach ([$this->moi, $this->autre] as $participant) {
            $conversation->participants()->attach($participant->id, [
                'role' => ParticipantRole::Member->value,
                'joined_at' => now(),
            ]);
        }

        $ajouter = function (int $n) use ($conversation): void {
            Message::factory()->count($n)->create([
                'conversation_id' => $conversation->id,
                'sender_id' => $this->autre->id,
                'content' => 'Le loyer '.self::MOT.' est arrivé',
            ]);
            $this->indexSearchable(Message::class);
        };

        $this->assertBudgetConstant('/api/search/messages?q='.self::MOT.'&per_page=20', $ajouter);
    }

    /**
     * @param  callable(int): void  $ajouter  ajoute N lignes trouvables et les indexe
     */
    private function assertBudgetConstant(string $url, callable $ajouter): void
    {
        Sanctum::actingAs($this->moi);

        $ajouter(2);
        $this->requetes($url, 2);
        $deux = $this->requetes($url, 2);

        $ajouter(10);
        $douze = $this->requetes($url, 12);

        $this->assertSame(
            count($deux),
            count($douze),
            sprintf(
                "%s : %d requêtes pour 2 lignes, %d pour 12. Requêtes en plus :\n%s",
                $url,
                count($deux),
                count($douze),
                implode("\n", $this->enPlus($deux, $douze)),
            ),
        );
    }

    /**
     * @param  list<string>  $deux
     * @param  list<string>  $douze
     * @return list<string>
     */
    private function enPlus(array $deux, array $douze): array
    {
        $avant = array_count_values($deux);
        $ecarts = [];
        foreach (array_count_values($douze) as $sql => $n) {
            if ($n !== ($avant[$sql] ?? 0)) {
                $ecarts[] = sprintf('%+d × %s', $n - ($avant[$sql] ?? 0), $sql);
            }
        }

        return $ecarts;
    }

    /** @return list<string> le SQL de chaque requête de l'appel */
    private function requetes(string $url, int $lignesAttendues): array
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->getJson($url)->assertOk()->assertJsonCount($lignesAttendues, 'data');
        $sql = array_column(DB::getQueryLog(), 'query');
        DB::disableQueryLog();

        return $sql;
    }
}
