<?php

namespace Tests\Feature\Logging;

use App\Events\AgencyUpgradeApproved;
use App\Jobs\Booking\ExpirePendingBookingsJob;
use App\Listeners\Agency\FlipAgencyKindOnUpgradeApproved;
use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Property;
use App\Models\User;
use App\Services\Agency\AgencyKindFlipService;
use App\Services\Booking\BookingExpirationService;
use App\Support\Logging\SafeExceptionContext;
use App\Support\Logging\SanitizingFailedJobProvider;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use PDOException;
use Symfony\Component\Mailer\Exception\TransportException;
use Tests\Support\JournalCapture;
use Tests\TestCase;
use Throwable;

/**
 * TCK-601 (ADR-0044 §2) — AC6b, AC6b-bis, AC6c : une exception ne se journalise jamais par son
 * message ni par l'objet lui-même, quel que soit le chemin.
 */
class SafeExceptionLoggingTest extends TestCase
{
    use JournalCapture, RefreshDatabase;

    private const TEMOIN = 'temoin-601@exemple.sn';

    /** Une `QueryException` comme PostgreSQL la lève : valeurs liées ET `DETAIL` portent le témoin. */
    private static function queryExceptionTemoin(): QueryException
    {
        $pdo = new PDOException('SQLSTATE[23505]: Unique violation: 7 ERROR: duplicate key value violates unique constraint "users_email_unique" DETAIL: Key (email)=('.self::TEMOIN.') already exists.');
        $pdo->errorInfo = ['23505', 7, 'duplicate key'];

        return new QueryException('pgsql', 'update "agencies" set "metadata" = ? where "id" = ?', [self::TEMOIN, 1], $pdo);
    }

    /** AC6b — le rapporteur du framework ne journalise ni binding ni `DETAIL`. */
    public function test_le_rapporteur_ne_journalise_aucun_binding(): void
    {
        User::factory()->create(['email' => self::TEMOIN]);
        $this->captureJournal();

        $caught = null;
        try {
            DB::transaction(fn () => DB::table('users')->insert([
                'first_name' => 'X', 'last_name' => 'Y', 'email' => self::TEMOIN, 'password' => 'x',
                'created_at' => now(), 'updated_at' => now(),
            ]));
        } catch (QueryException $e) {
            $caught = $e;
        }
        $this->assertNotNull($caught);
        $this->assertStringContainsString(self::TEMOIN, $caught->getMessage(), 'le témoin doit être dans le message brut');

        report($caught);

        $this->assertJournalSansTemoin(self::TEMOIN, 'already exists');
        $entries = $this->entreesJournal('query_exception');
        $this->assertCount(1, $entries);
        $this->assertSame('23505', $entries[0]['context']['sqlstate']);
        $this->assertStringContainsString('?', $entries[0]['context']['sql']);
        $this->assertSame(6, $entries[0]['context']['bindings_count']);
    }

    /** AC6b-bis — hors SQL, aucun message : un refus SMTP recopie l'adresse du destinataire. */
    public function test_aucun_message_hors_sql(): void
    {
        $context = SafeExceptionContext::of(new TransportException('Expected response code "250" but got "550 No such user: '.self::TEMOIN.'"'));

        $this->assertArrayNotHasKey('message', $context);
        $this->assertSame(TransportException::class, $context['exception']);
        $this->assertStringNotContainsString(self::TEMOIN, (string) json_encode($context));

        // Ni par l'exception précédente.
        $wrapped = SafeExceptionContext::of(new \RuntimeException('enveloppe '.self::TEMOIN, 0, new TransportException(self::TEMOIN)));
        $this->assertStringNotContainsString(self::TEMOIN, (string) json_encode($wrapped));
    }

    /** AC6c — le flip d'agence qui échoue sur une erreur SQL. */
    public function test_le_flip_d_agence_ne_journalise_aucun_temoin(): void
    {
        Notification::fake();
        $this->app->instance(AgencyKindFlipService::class, new class extends AgencyKindFlipService
        {
            public function flip(AgencyUpgradeRequest $request): Agency
            {
                throw SafeExceptionLoggingTest::exceptionPourLeFlip();
            }
        });
        $agency = Agency::factory()->individual()->create();
        $request = AgencyUpgradeRequest::factory()->pending()->create(['agency_id' => $agency->id, 'submitted_by' => User::factory()->create()->id]);
        $this->captureJournal();

        $thrown = null;
        try {
            app(FlipAgencyKindOnUpgradeApproved::class)->handle(new AgencyUpgradeApproved($request));
        } catch (Throwable $e) {
            $thrown = $e;
        }
        $this->assertInstanceOf(QueryException::class, $thrown);
        report($thrown);

        $this->assertNotEmpty($this->entreesJournal('FlipAgencyKindOnUpgradeApproved: flip failed'));
        $this->assertJournalSansTemoin(self::TEMOIN);
    }

    public static function exceptionPourLeFlip(): QueryException
    {
        return self::queryExceptionTemoin();
    }

    /** AC6c — l'expiration d'une réservation dont l'écriture lève : ni le journal, ni `errors`. */
    public function test_l_expiration_des_reservations_ne_recopie_aucun_temoin(): void
    {
        Notification::fake();
        $agency = Agency::factory()->create(['settings' => ['booking_pending_expiry_hours' => 48]]);
        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $customer = Customer::factory()->create(['agency_id' => $agency->id]);
        Booking::factory()->create([
            'agency_id' => $agency->id,
            'property_id' => $property->id,
            'customer_id' => $customer->id,
            'status' => BookingStatus::Pending,
            'created_at' => now()->subHours(49),
        ]);
        Booking::updating(fn () => throw self::queryExceptionTemoin());
        $this->captureJournal();

        $result = app(BookingExpirationService::class)->expirePendingBookings();

        $this->assertCount(1, $result['errors']);
        $this->assertStringNotContainsString(self::TEMOIN, $result['errors'][0]);
        $this->assertStringContainsString('23505', $result['errors'][0]);
        $this->assertNotEmpty($this->entreesJournal('Booking expiration failed'));
        $this->assertJournalSansTemoin(self::TEMOIN);
    }

    /** AC6c — le rappel `failed()` du job, et la ligne `failed_jobs` que le framework écrirait. */
    public function test_l_echec_du_job_ne_journalise_aucun_temoin(): void
    {
        $this->captureJournal();

        (new ExpirePendingBookingsJob)->failed(self::queryExceptionTemoin());

        $this->assertNotEmpty($this->entreesJournal('ExpirePendingBookingsJob: Job failed'));
        $this->assertJournalSansTemoin(self::TEMOIN);

        // `failed_jobs.exception` : le fournisseur décoré écrit la forme sûre.
        $failer = app('queue.failer');
        $this->assertInstanceOf(SanitizingFailedJobProvider::class, $failer);
        $failer->log('database', 'default', json_encode(['uuid' => 'tck601-uuid', 'displayName' => 'X']), self::queryExceptionTemoin());
        $stored = (string) DB::table('failed_jobs')->where('uuid', 'tck601-uuid')->value('exception');
        $this->assertStringContainsString('SQLSTATE 23505', $stored);
        $this->assertStringNotContainsString(self::TEMOIN, $stored);
    }
}
