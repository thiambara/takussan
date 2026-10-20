<?php

namespace Tests\Feature\Search;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\CustomerNote;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\ParticipantRole;
use App\Models\MaintenanceRequest;
use App\Models\Message;
use App\Models\Property;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Concerns\InteractsWithMeilisearch;

/**
 * Le budget de requêtes des chemins de recherche Scout, index peuplé : 2 lignes = 12 lignes.
 *
 * `ProListQueryBudgetTest` garde les listes pro sans recherche, Scout coupé. Une lecture par
 * ligne qui n'apparaît qu'avec une recherche (le paginateur de Scout, qui n'a rien préchargé)
 * n'y a aucun témoin : c'est ici qu'elle rougit. Comme là-bas, le compte porte sur TOUTES les
 * requêtes, et le premier appel (caches de processus) n'est pas compté.
 *
 * Les lignes sont garnies comme dans `ProListQueryBudgetTest` (photo, adresse, note, étiquette),
 * et les URL des listes pro reprennent les `fields[]` et l'`include=` du front.
 *
 * TCK-1010 (P59.02) — `GET /api/search/messages` : une lecture de `media` par message.
 * TCK-1011 (P59.03) — les listes pro sous `filter[search]` et la recherche publique.
 */
class SearchQueryBudgetTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private const MOT = 'zorglub';

    private Agency $agency;

    private User $moi;

    private User $autre;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agency = Agency::factory()->create();
        $this->moi = $this->agencyAdmin($this->agency);
        $this->autre = $this->agencyAgent($this->agency);
    }

    public function test_la_liste_pro_des_biens(): void
    {
        $this->assertBudgetConstant(
            '/api/properties?filter[search]='.self::MOT
                .'&fields[properties]=id,user_id,agency_id,reference_number,title,slug,price,currency,type,contract_type,rent_period,status,visibility,views_count,favorites_count,bedrooms,area,published_at,created_at'
                .'&include=address,owner,collaborators&per_page=20',
            function (int $n): void {
                for ($i = 0; $i < $n; $i++) {
                    $this->bien();
                }
                $this->indexProperties();
            },
        );
    }

    public function test_la_liste_pro_des_clients(): void
    {
        $this->assertBudgetConstant(
            '/api/customers?filter[search]='.self::MOT
                .'&fields[customers]=id,first_name,last_name,email,phone,status,pipeline_stage,occupation,created_at'
                .'&include=tags&sort=-created_at&per_page=20',
            function (int $n): void {
                for ($i = 0; $i < $n; $i++) {
                    $client = Customer::factory()->create(['agency_id' => $this->agency->id, 'last_name' => ucfirst(self::MOT)]);
                    CustomerNote::factory()->create(['customer_id' => $client->id, 'author_id' => $this->moi->id, 'body' => 'Note interne']);
                    $client->tags()->attach(Tag::factory()->create(['type' => 'crm']));
                }
                $this->indexSearchable(Customer::class);
            },
        );
    }

    public function test_la_liste_pro_des_demandes_d_intervention(): void
    {
        $this->assertBudgetConstant(
            '/api/maintenance-requests?filter[search]='.self::MOT
                .'&fields[maintenance_requests]=id,property_id,lease_id,requester_id,assigned_to,title,category,priority,status,scheduled_at,completed_at,actual_cost,accepted_at,created_at'
                .'&fields[properties]=id,title,slug,agency_id&include=property&sort=-created_at&per_page=20',
            function (int $n): void {
                for ($i = 0; $i < $n; $i++) {
                    MaintenanceRequest::factory()->create(['property_id' => $this->bien()->id, 'title' => 'Fuite '.self::MOT]);
                }
                $this->indexSearchable(MaintenanceRequest::class);
            },
        );
    }

    public function test_la_recherche_publique(): void
    {
        $this->assertBudgetConstant(
            '/api/public/properties/search?q='.self::MOT.'&per_page=20',
            function (int $n): void {
                for ($i = 0; $i < $n; $i++) {
                    $this->bien();
                }
                $this->indexProperties();
            },
            connecte: false,
        );
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
    private function assertBudgetConstant(string $url, callable $ajouter, bool $connecte = true): void
    {
        if ($connecte) {
            $this->actingAsApi($this->moi);
        }

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

    /** Un bien publié de l'agence, trouvable par MOT, avec son adresse et sa photo. */
    private function bien(): Property
    {
        $bien = Property::factory()->published()->create([
            'user_id' => $this->autre->id,
            'agency_id' => $this->agency->id,
            'title' => 'Villa '.self::MOT,
        ]);
        Address::factory()->create(['addressable_type' => Property::class, 'addressable_id' => $bien->id]);
        $bien->addMedia(UploadedFile::fake()->image('photo.jpg'))->toMediaCollection('photos');

        return $bien;
    }
}
