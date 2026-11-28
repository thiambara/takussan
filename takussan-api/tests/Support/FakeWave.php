<?php

namespace Tests\Support;

use Closure;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

/**
 * TCK-3014 (ADR-0140 § 5) — un faux Wave derrière la couture qui existe : le client HTTP.
 *
 * `PaymentGatewayService::driverFor()` construit son pilote lui-même (`new $driver($integration)`) :
 * il n'y a pas de pilote à substituer dans le conteneur, et le doubler partiellement
 * (`driverFor`) éprouvait un module de l'application à travers
 * sa propre couture. Le faux répond à la place de `api.wave.com` (`Http::fake`) : le VRAI
 * `WaveDriver` construit la requête, lit la réponse et la traduit — patron de {@see FakeSmsRouter}.
 *
 * Il répond aux deux appels du pilote, au format de Wave :
 * - `POST /v1/checkout/sessions` → `{id, wave_launch_url}`, identifiants `<préfixe>1`, `<préfixe>2`…
 *   numérotés par appel, réponses en erreur comprises ;
 * - `GET /v1/checkout/sessions/{id}` → `{id, payment_status}`, `payment_status` réglable.
 *
 * Un rappel s'exécute PENDANT l'appel (la latence du fournisseur, où un webhook, un renouvellement
 * ou une seconde initiation peuvent arriver) : il reçoit l'identifiant du payable
 * (`client_reference`) ou de la session. Le fournisseur peut aussi répondre en erreur une fois.
 *
 *     $wave = FakeWave::install('txn_')->pendantLeCheckout(fn (int $id) => …);
 *     $this->postJson("/api/lease-payments/{$id}/initiate", ['provider' => 'wave'])->assertOk();
 *     $wave->checkouts[0]['amount'];   // 157500 : l'entier que Wave reçoit, pas ×100
 */
final class FakeWave
{
    /** Ce que Wave répond à la vérification d'une session réglée. */
    public const REGLE = 'succeeded';

    /** @var list<array{payment_id: int, amount: int, currency: string, success_url: string, error_url: string}> les checkouts ouverts */
    public array $checkouts = [];

    /** Les appels de checkout reçus, réponses en erreur comprises. */
    public int $appels = 0;

    /** @var list<string> les sessions vérifiées */
    public array $verifications = [];

    /** Le `payment_status` que Wave rend à la vérification : en cours par défaut. */
    public string $statutALaVerification = 'processing';

    /** @var (Closure(int): void)|null */
    private ?Closure $pendantLeCheckout = null;

    /** @var (Closure(string): void)|null */
    private ?Closure $pendantLaVerification = null;

    private int $echecsAVenir = 0;

    private function __construct(private readonly string $prefixe, private readonly string $lancement) {}

    /**
     * @param  string  $prefixe  des identifiants de session
     * @param  string  $lancement  des URL de paiement rendues, suivies du numéro d'appel
     */
    public static function install(string $prefixe = 'wave_txn_', string $lancement = 'https://pay.wave.com/c/'): self
    {
        $fake = new self($prefixe, $lancement);
        Http::fake(['api.wave.com/v1/checkout/sessions*' => fn (Request $requete) => $fake->repondre($requete)]);

        return $fake;
    }

    /** @param  (Closure(int): void)|null  $rappel  reçoit l'identifiant du payable */
    public function pendantLeCheckout(?Closure $rappel): self
    {
        $this->pendantLeCheckout = $rappel;

        return $this;
    }

    /** @param  (Closure(string): void)|null  $rappel  reçoit l'identifiant de la session */
    public function pendantLaVerification(?Closure $rappel): self
    {
        $this->pendantLaVerification = $rappel;

        return $this;
    }

    public function reglerALaVerification(): self
    {
        $this->statutALaVerification = self::REGLE;

        return $this;
    }

    /** Le prochain checkout reçoit une 503 : le pilote la rend en 502 `payment.provider_unavailable`. */
    public function echouerLeProchainCheckout(): self
    {
        $this->echecsAVenir++;

        return $this;
    }

    private function repondre(Request $requete): mixed
    {
        if ($requete->method() === 'POST') {
            $this->appels++;
            if ($this->pendantLeCheckout !== null) {
                ($this->pendantLeCheckout)((int) $requete['client_reference']);
            }
            if ($this->echecsAVenir > 0) {
                $this->echecsAVenir--;

                return Http::response(['message' => 'Service unavailable'], 503);
            }

            $this->checkouts[] = [
                'payment_id' => (int) $requete['client_reference'],
                'amount' => (int) $requete['amount'],
                'currency' => (string) $requete['currency'],
                'success_url' => (string) $requete['success_url'],
                'error_url' => (string) $requete['error_url'],
            ];
            $id = $this->prefixe.$this->appels;

            return Http::response(['id' => $id, 'wave_launch_url' => $this->lancement.$this->appels], 200);
        }

        $session = basename((string) parse_url($requete->url(), PHP_URL_PATH));
        // Le rappel d'abord : `verifications` dit « le fournisseur a répondu », pas « il est appelé ».
        if ($this->pendantLaVerification !== null) {
            ($this->pendantLaVerification)($session);
        }
        $this->verifications[] = $session;

        return Http::response(['id' => $session, 'payment_status' => $this->statutALaVerification], 200);
    }
}
