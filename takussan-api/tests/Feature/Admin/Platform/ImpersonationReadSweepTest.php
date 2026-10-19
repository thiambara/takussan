<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\Enums\LeaseStatus;
use App\Models\ImpersonationSession;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Lease\DepositRefundService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\Route as Routes;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\SessionsDImpersonation;
use Tests\TestCase;

/**
 * TCK-920 (P23.06, ADR-0055 §3) — la garde des LECTURES sous impersonation.
 *
 * `EnforceImpersonationReadOnly::REFUSED_READS` n'était tenue que par une consigne : « toute route
 * GET qui rend un secret durable ou une pièce d'identité entre ici, le jour où elle est créée. Rien
 * d'autre ne l'attrape. » Cette garde l'attrape : elle ouvre une session sur une cible garnie (une
 * pièce de profil, une fiche client avec un numéro de pièce, une retenue sur caution avec sa photo
 * et sa notification) et lit chaque route `GET /api/*` dont elle sait remplir les paramètres.
 * Toute réponse 200 qui rend l'un des quatre marqueurs ci-dessous rougit, sauf les fuites connues
 * de {@see self::FUITES_TOLEREES}.
 *
 * Un secret « durable » se lit ici comme l'ADR l'écrit : ce qui ouvre encore quelque chose APRÈS
 * la fin de la session. Une URL signée qui expire avant la session n'en est pas un.
 */
class ImpersonationReadSweepTest extends TestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;
    use SessionsDImpersonation;

    private const NUMERO_DE_PIECE = 'CNI-GARDE-7731904452';

    private const NOM_DE_PIECE = 'piece-garde-tck920.pdf';

    private const PIECE_D_IDENTITE = 'numéro de pièce d\'identité';

    private const PIECE_DE_PROFIL = 'pièce de profil';

    private const JETON = 'jeton';

    private const URL_SIGNEE_DURABLE = 'URL signée qui survit à la session';

    /**
     * Les fuites connues, route par route. Chacune DOIT encore fuir : une fuite corrigée se retire
     * d'ici, sans quoi la garde rougit — la liste ne peut pas vieillir en silence.
     *
     * @var array<string, list<string>>
     */
    private const FUITES_TOLEREES = [
        // P23.03 (retenu · à valider, V8) — le numéro de pièce du client et de la caution est en
        // clair partout, sans lecture dédiée ; la session le lit comme le personnel de l'agence.
        'api/customers' => [self::PIECE_D_IDENTITE],
        'api/customers/{customer}' => [self::PIECE_D_IDENTITE],
        'api/leases' => [self::PIECE_D_IDENTITE],
        'api/leases/{lease}' => [self::PIECE_D_IDENTITE],
        'api/bookings' => [self::PIECE_D_IDENTITE],
        'api/bookings/{booking}' => [self::PIECE_D_IDENTITE],
        // Relevé par cette garde (TCK-920) — `documents.recent` liste les pièces des profils de la
        // cible (nom, type), que TCK-697 retire de `GET /api/documents` sous impersonation.
        'api/dashboard/tenant' => [self::PIECE_DE_PROFIL],
        // Relevé par cette garde (TCK-920) — les photos d'une retenue sur caution sont signées pour
        // `PrivateMediaAccess::SIGNED_ROUTE_TTL_MINUTES` (30 min), plus que la session (15 min).
        'api/leases/{lease}/deposit-refund' => [self::URL_SIGNEE_DURABLE],
        'api/notifications' => [self::URL_SIGNEE_DURABLE],
    ];

    /**
     * Les paramètres de route que la garde ne remplit pas : ces routes ne sont pas lues. Une route
     * neuve dont un paramètre n'est ni ici ni dans `$valeurs` fait rougir
     * `test_chaque_parametre_de_route_est_rempli_ou_declare` : la décision se prend à sa création.
     */
    private const PARAMETRES_NON_REMPLIS = [
        'slug', 'token', 'id', 'integration', 'entity', 'key', 'media', 'payout', 'provider',
        'statement', 'payment', 'inventory', 'invoice', 'agent_profile', 'paymentType', 'paymentId',
        'upgradeRequest', 'dossier', 'event', 'channel', 'report', 'webhookLog', 'role', 'hash',
        'lead', 'dataExport', 'versionId', 'guarantor', 'invitation', 'sp_profile', 'visit', 'city',
        'review', 'bill', 'tag', 'task',
    ];

    private User $cible;

    /** @var array<string, int> */
    private array $valeurs = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->garnirLaCible();
    }

    public function test_aucune_lecture_sous_impersonation_ne_rend_une_piece_ni_un_secret_durable(): void
    {
        $session = $this->ouvrirUneSession(cible: $this->cible);
        $finDeSession = ImpersonationSession::query()->findOrFail($session['session_id'])->expires_at->getTimestamp();

        $fuites = [];
        $lues = 0;
        foreach ($this->routesLisibles() as $route) {
            $this->avecLeJeton($session['jeton']);
            $reponse = $this->get('/'.$this->remplir($route->uri()), ['Accept' => 'application/json']);
            if ($reponse->getStatusCode() !== 200) {
                continue;
            }
            $lues++;
            $marques = $this->marques((string) $reponse->getContent(), $finDeSession);
            if ($marques !== []) {
                $fuites[$route->uri()] = $marques;
            }
        }

        // La session lit encore : une erreur SQL en cours de balayage aurait abandonné la
        // transaction du test, et toutes les routes suivantes seraient sorties du compte en silence.
        $this->avecLeJeton($session['jeton'])->getJson('/api/auth/me')->assertOk();
        $this->assertGreaterThan(50, $lues, "{$lues} lectures 200 seulement : le balayage n'a rien lu");

        $neuves = [];
        foreach ($fuites as $uri => $marques) {
            $horsListe = array_diff($marques, self::FUITES_TOLEREES[$uri] ?? []);
            if ($horsListe !== []) {
                $neuves[] = "GET {$uri} : ".implode(', ', $horsListe);
            }
        }
        $this->assertSame([], $neuves, "Sous impersonation, ces lectures rendent une pièce ou un secret durable.\n"
            .'Ajouter la route à EnforceImpersonationReadOnly::REFUSED_READS, ou retirer la donnée de la réponse (ADR-0055 §3).');

        $corrigees = [];
        foreach (self::FUITES_TOLEREES as $uri => $marques) {
            $disparues = array_diff($marques, $fuites[$uri] ?? []);
            if ($disparues !== []) {
                $corrigees[] = "GET {$uri} : ".implode(', ', $disparues);
            }
        }
        $this->assertSame([], $corrigees, 'Ces fuites tolérées ne fuient plus : les retirer de FUITES_TOLEREES.');
    }

    /** Sans ce témoin, une fixture qui ne garnit plus la cible rendrait la garde verte à vide. */
    public function test_la_cible_lit_chaque_marqueur_sous_son_propre_jeton(): void
    {
        $this->avecLeJeton($this->cible->createToken('mobile')->plainTextToken);
        $finDeSession = now()->addMinutes(ImpersonationSession::TTL_MINUTES)->getTimestamp();

        $this->assertContains(self::PIECE_D_IDENTITE, $this->marquesDe("/api/customers/{$this->valeurs['customer']}", $finDeSession));
        $this->assertContains(self::PIECE_DE_PROFIL, $this->marquesDe('/api/documents', $finDeSession));
        $this->assertContains(self::URL_SIGNEE_DURABLE, $this->marquesDe("/api/leases/{$this->valeurs['lease']}/deposit-refund", $finDeSession));
        $this->assertContains(self::URL_SIGNEE_DURABLE, $this->marquesDe('/api/notifications', $finDeSession));

        $this->assertSame([self::JETON], $this->marques('{"data":{"token":"abc123"}}', $finDeSession));
        $this->assertSame([], $this->marques('{"data":{"token":null}}', $finDeSession));
        $avant = $finDeSession - 60;
        $this->assertSame([], $this->marques("{\"url\":\"https:\\/\\/x\\/f?expires={$avant}&signature=ab\"}", $finDeSession));
    }

    public function test_chaque_parametre_de_route_est_rempli_ou_declare(): void
    {
        $inconnus = [];
        foreach ($this->routesGet() as $route) {
            foreach ($route->parameterNames() as $nom) {
                if (! array_key_exists($nom, $this->valeurs) && ! in_array($nom, self::PARAMETRES_NON_REMPLIS, true)) {
                    $inconnus[] = "{$nom} ({$route->uri()})";
                }
            }
        }

        $this->assertSame([], $inconnus, 'Paramètres ni remplis par la garde ni déclarés dans PARAMETRES_NON_REMPLIS.');
    }

    /** @return list<string> */
    private function marquesDe(string $url, int $finDeSession): array
    {
        return $this->marques((string) $this->getJson($url)->assertOk()->getContent(), $finDeSession);
    }

    /** @return list<string> */
    private function marques(string $corps, int $finDeSession): array
    {
        $corps = str_replace('\\/', '/', $corps);
        $marques = [];
        if (str_contains($corps, self::NUMERO_DE_PIECE)) {
            $marques[] = self::PIECE_D_IDENTITE;
        }
        if (str_contains($corps, self::NOM_DE_PIECE)) {
            $marques[] = self::PIECE_DE_PROFIL;
        }
        if (preg_match('/"token"\s*:\s*"/', $corps)) {
            $marques[] = self::JETON;
        }
        preg_match_all('/expires=(\d+)(?:&|&amp;|\\\\u0026)signature=/', $corps, $expirations);
        foreach ($expirations[1] as $expiration) {
            if ((int) $expiration > $finDeSession) {
                $marques[] = self::URL_SIGNEE_DURABLE;
                break;
            }
        }

        return $marques;
    }

    /** @return list<Route> */
    private function routesGet(): array
    {
        return array_values(array_filter(
            Routes::getRoutes()->getRoutes(),
            fn (Route $r) => in_array('GET', $r->methods(), true) && str_starts_with($r->uri(), 'api/'),
        ));
    }

    /** @return list<Route> les routes dont chaque paramètre est rempli */
    private function routesLisibles(): array
    {
        return array_values(array_filter(
            $this->routesGet(),
            fn (Route $r) => array_diff($r->parameterNames(), array_keys($this->valeurs)) === [],
        ));
    }

    private function remplir(string $uri): string
    {
        return (string) preg_replace_callback('/\{(\w+)\??\}/', fn (array $m) => (string) $this->valeurs[$m[1]], $uri);
    }

    private function garnirLaCible(): void
    {
        $agence = Agency::factory()->create();
        $this->cible = $this->agencyAdmin($agence);

        // Une pièce de profil, téléversée par la voie réelle de l'assistant d'accueil.
        $owner = OwnerProfile::query()->where('user_id', $this->cible->id)->first()
            ?? OwnerProfile::factory()->create(['user_id' => $this->cible->id]);
        Sanctum::actingAs($this->cible);
        $this->postJson("/api/me/owner-profiles/{$owner->id}/kyc/upload", [
            'file' => UploadedFile::fake()->create(self::NOM_DE_PIECE, 200, 'application/pdf'),
            'kind' => 'cni',
        ])->assertCreated();
        $piece = Document::query()->where('type', DocumentType::IdCard)->sole();

        // Une fiche client avec son numéro de pièce, que la cible a ajoutée.
        $client = Customer::factory()->create([
            'agency_id' => $agence->id,
            'added_by_id' => $this->cible->id,
            'id_number' => self::NUMERO_DE_PIECE,
        ]);
        $property = Property::factory()->create(['user_id' => $this->cible->id, 'agency_id' => $agence->id]);
        $booking = Booking::factory()->create([
            'agency_id' => $agence->id,
            'property_id' => $property->id,
            'customer_id' => $client->id,
            'created_by_id' => $this->cible->id,
        ]);

        // Une retenue sur caution avec sa photo : la cible est la bailleresse (`deposit-refund`) et la
        // locataire d'un second bail (la notification à pièces jointes, P23.05).
        $bail = $this->retenue($agence, $property, $this->cible, $client);
        $locataire = Customer::factory()->create(['user_id' => $this->cible->id]);
        $this->retenue($agence, $property, User::factory()->create(), $locataire);

        $conversation = Conversation::factory()->create(['created_by' => $this->cible->id, 'property_id' => $property->id]);
        $conversation->participants()->attach($this->cible->id, ['joined_at' => now()]);

        $this->valeurs = [
            'agency' => $agence->id,
            'property' => $property->id,
            'lease' => $bail->id,
            'customer' => $client->id,
            'document' => $piece->id,
            'user' => $this->cible->id,
            'booking' => $booking->id,
            'notification' => (int) AppNotification::query()->where('user_id', $this->cible->id)->value('id'),
            'owner_profile' => $owner->id,
            'ownerProfile' => $owner->id,
            'conversation' => $conversation->id,
            'maintenanceRequest' => MaintenanceRequest::factory()->create(['property_id' => $property->id])->id,
        ];
    }

    private function retenue(Agency $agence, Property $property, User $bailleur, Customer $locataire): Lease
    {
        $bail = Lease::factory()->create([
            'agency_id' => $agence->id,
            'landlord_id' => $bailleur->id,
            'tenant_id' => $locataire->id,
            'property_id' => $property->id,
            'status' => LeaseStatus::Terminated,
            'deposit_amount' => 500000,
        ]);
        $bail->addMedia(UploadedFile::fake()->image('degat.jpg'))->toMediaCollection('lease_deposit_refund');
        app(DepositRefundService::class)->refund($bail, $bailleur, ['amount' => 300000, 'reason' => 'Réparations']);

        return $bail;
    }
}
