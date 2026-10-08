<?php

namespace Tests\Feature\Search;

use App\Jobs\SendSavedSearchAlerts;
use App\Models\Address;
use App\Models\AlertSubscriber;
use App\Models\AppNotification;
use App\Models\Property;
use App\Models\SavedSearch;
use App\Models\User;
use App\Services\Model\SearchService;
use Carbon\CarbonInterface;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use PDOException;
use Symfony\Component\Mailer\Exception\UnexpectedResponseException;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mailer\Transport\AbstractTransport;
use Symfony\Component\Mime\Address as MimeAddress;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;
use Throwable;

/**
 * TCK-599 **AC13b** — le journal d'un échec d'alerte ne porte jamais le contact.
 *
 * Deux exceptions qui CITENT le destinataire dans leur message : une `QueryException` dont la
 * valeur liée est l'adresse (a), et le refus SMTP d'un transport (b). Dans les deux cas, aucune
 * entrée de journal ne contient le témoin, l'entrée `saved_search_alert.failed` porte l'identifiant
 * et la classe, et la recherche saine suivante est notifiée.
 */
class SavedSearchAlertFailureLogTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private const TEMOIN = 'temoin-599@exemple.sn';

    /** @var list<string> tout ce qui a été journalisé, message et contexte encodés */
    private array $journal = [];

    /** @var list<array{string, array<string, mixed>}> */
    private array $entrees = [];

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Event::listen(MessageLogged::class, function (MessageLogged $e): void {
            $contexte = array_map(fn ($v) => $v instanceof Throwable ? (string) $v : $v, $e->context);
            $this->journal[] = $e->message.' '.json_encode($contexte, JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR);
            $this->entrees[] = [$e->message, $e->context];
        });
    }

    /** @return array{SavedSearch, SavedSearch, User} */
    private function deuxRecherches(): array
    {
        $this->freezeTime();
        $bien = Property::factory()->published()->create(['price' => 100_000, 'published_at' => now()->subDay()]);
        Address::create(['addressable_type' => Property::class, 'addressable_id' => $bien->id, 'city' => 'Dakar', 'country' => 'SN']);

        $abonne = AlertSubscriber::create([
            'channel' => AlertSubscriber::CHANNEL_EMAIL,
            'contact' => self::TEMOIN,
            'contact_hash' => AlertSubscriber::contactHash(AlertSubscriber::CHANNEL_EMAIL, self::TEMOIN),
            'locale' => 'fr',
            'confirmed_at' => now()->subDay(),
            'unsubscribe_token' => AlertSubscriber::newToken(),
            'unsubscribe_token_hash' => AlertSubscriber::tokenHash('x'),
            'consent_at' => now()->subDay(),
            'consent_source' => 'public_search_alert',
            'consent_version' => AlertSubscriber::CONSENT_VERSION,
        ]);
        $fautive = SavedSearch::create(['alert_subscriber_id' => $abonne->id, 'name' => 'Témoin', 'criteria' => ['price_max' => 200000]]);
        $user = User::factory()->create();
        $saine = SavedSearch::create(['user_id' => $user->id, 'name' => 'Saine', 'criteria' => ['price_max' => 200000]]);
        $this->indexProperties();

        return [$fautive, $saine, $user];
    }

    private function assertJournalSansContact(SavedSearch $fautive, string $classe, User $user, SavedSearch $saine): void
    {
        $this->assertNotEmpty($this->journal, 'aucune entrée : le test ne garde rien');
        foreach ($this->journal as $ligne) {
            $this->assertStringNotContainsString('temoin-599', $ligne);
        }
        $echec = collect($this->entrees)->first(fn (array $e) => $e[0] === 'saved_search_alert.failed');
        $this->assertNotNull($echec, 'l\'échec est journalisé');
        $this->assertSame($fautive->id, $echec[1]['saved_search_id']);
        $this->assertSame($classe, $echec[1]['exception']);
        $this->assertSame($saine->id, AppNotification::where('user_id', $user->id)->sole()->data['saved_search_id'], 'la recherche saine est notifiée');
    }

    /** (a) — une `QueryException` dont la valeur liée est l'adresse du témoin. */
    public function test_une_erreur_sql_qui_cite_le_contact_n_atteint_pas_le_journal(): void
    {
        [$fautive, $saine, $user] = $this->deuxRecherches();
        $this->app->instance(SearchService::class, new class extends SearchService
        {
            public function getMatchingProperties(SavedSearch $search, ?CarbonInterface $publieApres = null, ?CarbonInterface $jusqua = null): array
            {
                if ($search->alert_subscriber_id !== null) {
                    throw new QueryException('pgsql', 'select * from saved_searches where email = ?', ['temoin-599@exemple.sn'], new PDOException('SQLSTATE[23505]'));
                }

                return parent::getMatchingProperties($search, $publieApres, $jusqua);
            }
        });

        app()->call([new SendSavedSearchAlerts, 'handle']);

        $this->assertJournalSansContact($fautive, QueryException::class, $user, $saine);
    }

    /** (b) — le transport refuse le destinataire et le cite dans son message. */
    public function test_un_refus_smtp_qui_cite_le_contact_n_atteint_pas_le_journal(): void
    {
        [$fautive, $saine, $user] = $this->deuxRecherches();
        app('mailer')->setSymfonyTransport(new class extends AbstractTransport
        {
            protected function doSend(SentMessage $message): void
            {
                $destinataires = array_map(fn (MimeAddress $a) => $a->getAddress(), $message->getEnvelope()->getRecipients());
                if (in_array('temoin-599@exemple.sn', $destinataires, true)) {
                    throw new UnexpectedResponseException('Expected response code "250" but got code "550", with message "550 5.1.1 <temoin-599@exemple.sn>: Recipient address rejected".');
                }
            }

            public function __toString(): string
            {
                return 'refus://temoin';
            }
        });

        app()->call([new SendSavedSearchAlerts, 'handle']);

        $this->assertJournalSansContact($fautive, UnexpectedResponseException::class, $user, $saine);
    }
}
