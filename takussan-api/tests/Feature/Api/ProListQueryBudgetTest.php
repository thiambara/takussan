<?php

namespace Tests\Feature\Api;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Booking;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\CustomerNote;
use App\Models\Document;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Message;
use App\Models\Property;
use App\Models\Tag;
use App\Models\User;
use App\Services\Document\DocumentVersionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-919 (P20.06) — la garde générale contre la requête par ligne sur les listes pro.
 *
 * Chaque liste que le front appelle, avec ses `fields[]` et son `include=` (recopiés de
 * `takussan-web/src/lib/queries/*.ts`), coûte le même nombre de requêtes pour 2 lignes que pour
 * 12. Les lignes sont « garnies » : un bien avec sa photo et son adresse, une fiche client avec
 * une note et une étiquette, un document avec son fichier et deux versions, une conversation avec
 * un message. C'est la forme qui faisait rougir P20.01, P20.02, P20.04 et P20.05 ; un test de
 * budget sur une ligne nue ne la crée pas (mesure du 2026-10-16 sur `preventLazyLoading()`).
 *
 * Le compte porte sur TOUTES les requêtes, pas sur une table : une lecture de profil, de média ou
 * de note ajoutée par ligne, demain, sur l'une de ces listes, rougit ici.
 */
class ProListQueryBudgetTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $autre;

    /** @return array<string, array{string, string}> */
    public static function listes(): array
    {
        return [
            'baux' => ['bail', '/api/leases?fields[leases]=id,reference_number,type,status,start_date,end_date,monthly_rent,sale_price,currency,deposit_amount,property_id,tenant_id,landlord_id,created_at'
                .'&fields[properties]=id,title,slug&include=property&sort=-created_at&per_page=20'],
            'réservations' => ['reservation', '/api/bookings?fields[bookings]=id,reference_number,status,start_date,end_date,total_amount,deposit_amount,created_at,property_id,customer_id,agency_id'
                .'&fields[properties]=id,title,slug,price,currency&include=property&sort=-created_at&per_page=20'],
            'clients' => ['client', '/api/customers?fields[customers]=id,first_name,last_name,email,phone,status,pipeline_stage,occupation,created_at'
                .'&include=tags&sort=-created_at&per_page=20'],
            'demandes d\'intervention' => ['intervention', '/api/maintenance-requests?fields[maintenance_requests]=id,property_id,lease_id,requester_id,assigned_to,title,category,priority,status,scheduled_at,completed_at,actual_cost,accepted_at,created_at'
                .'&fields[properties]=id,title,slug,agency_id&include=property&sort=-created_at&per_page=20'],
            'documents' => ['document', '/api/documents?fields[documents]=id,name,type,description,documentable_type,documentable_id,is_verified,expiry_date,uploaded_by,created_at'
                .'&sort=-created_at&per_page=20'],
            'conversations' => ['conversation', '/api/conversations?fields[conversations]=id,subject,property_id,type,status,last_message_at,last_message_preview,updated_at'
                .'&fields[properties]=id,title,slug&include=property,participants,last_message&sort=-last_message_at&per_page=30'],
        ];
    }

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->autre = User::factory()->create();
        $this->actingAsApi($this->admin);
    }

    #[DataProvider('listes')]
    public function test_la_liste_coute_autant_pour_douze_lignes_que_pour_deux(string $ligne, string $url): void
    {
        $this->ajouter($ligne, 2);
        // Le premier appel remplit des caches de processus (réglages, résolutions) : on ne compte
        // qu'à partir du second, sans quoi 12 lignes coûteraient MOINS que 2.
        $this->requetes($url, 2);
        $deux = $this->requetes($url, 2);

        $this->ajouter($ligne, 10);
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
     * Les formes de requête que 12 lignes répètent plus que 2, avec l'écart.
     *
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

    private function ajouter(string $ligne, int $n): void
    {
        for ($i = 0; $i < $n; $i++) {
            match ($ligne) {
                'bail' => $this->bail(),
                'reservation' => $this->reservation(),
                'client' => $this->client(),
                'intervention' => $this->intervention(),
                'document' => $this->document(),
                'conversation' => $this->conversation(),
            };
        }
    }

    private function bien(): Property
    {
        $property = Property::factory()->create([
            'user_id' => $this->autre->id,
            'agency_id' => $this->agency->id,
        ]);
        Address::factory()->create(['addressable_type' => Property::class, 'addressable_id' => $property->id]);
        $property->addMedia(UploadedFile::fake()->image('photo.jpg'))->toMediaCollection('photos');

        return $property;
    }

    private function client(): Customer
    {
        $customer = Customer::factory()->create(['agency_id' => $this->agency->id]);
        CustomerNote::factory()->create(['customer_id' => $customer->id, 'author_id' => $this->admin->id, 'body' => 'Note interne']);
        $customer->tags()->attach(Tag::factory()->create(['type' => 'crm']));

        return $customer;
    }

    private function bail(): void
    {
        Lease::factory()->create([
            'agency_id' => $this->agency->id,
            'landlord_id' => $this->autre->id,
            'property_id' => $this->bien()->id,
            'tenant_id' => $this->client()->id,
        ]);
    }

    private function reservation(): void
    {
        Booking::factory()->create([
            'agency_id' => $this->agency->id,
            'created_by_id' => $this->autre->id,
            'property_id' => $this->bien()->id,
            'customer_id' => $this->client()->id,
        ]);
    }

    private function intervention(): void
    {
        MaintenanceRequest::factory()->create(['property_id' => $this->bien()->id]);
    }

    private function document(): void
    {
        $document = Document::factory()->create(['uploaded_by' => $this->admin->id]);
        $document->addMedia(UploadedFile::fake()->create('bail.pdf', 10, 'application/pdf'))->toMediaCollection('file');

        $versions = app(DocumentVersionService::class);
        $versions->uploadVersion($document, UploadedFile::fake()->create('v1.pdf', 10, 'application/pdf'), $this->admin);
        $versions->uploadVersion($document, UploadedFile::fake()->create('v2.pdf', 10, 'application/pdf'), $this->admin);
    }

    private function conversation(): void
    {
        $conversation = Conversation::create([
            'type' => ConversationType::Direct->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Bien',
            'created_by' => $this->admin->id,
            'property_id' => $this->bien()->id,
        ]);
        $conversation->participants()->attach($this->admin->id, ['joined_at' => now()]);
        $conversation->participants()->attach($this->autre->id, ['joined_at' => now()]);

        $message = Message::factory()->create(['conversation_id' => $conversation->id, 'sender_id' => $this->autre->id]);
        $conversation->update([
            'last_message_id' => $message->id,
            'last_message_preview' => mb_substr((string) $message->content, 0, 255),
            'last_message_at' => now(),
        ]);
    }
}
