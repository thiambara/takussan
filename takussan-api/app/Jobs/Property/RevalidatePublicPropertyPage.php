<?php

namespace App\Jobs\Property;

use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;

/**
 * TCK-598 (ADR-0052 §2) — demande au front d'expirer les données en cache d'une ou plusieurs
 * fiches publiques (`revalidateTag('property:{slug}')`).
 *
 * Appel SIGNÉ : HMAC-SHA256 de `<horodatage>.<corps>` avec le secret partagé, en-tête
 * `X-Takussan-Signature: t=<horodatage>,v1=<hex>`. Le front refuse une signature fausse, absente ou
 * vieille de plus de 300 s.
 *
 * **Sans configuration, il ne fait rien** — ni appel, ni erreur : la revalidation temporelle du
 * front (300 s) reste la seule. C'est le cas du développement, de la CI (`.env.example` déclare les
 * clés vides), et de tout environnement qui ne pose pas les deux clés.
 *
 * Mis en file APRÈS la validation de la transaction (`afterCommit`) : invalider avant que la
 * modification soit visible ferait relire au front l'ancienne version, et la remettre en cache.
 */
class RevalidatePublicPropertyPage implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    /** @param  list<string>  $slugs */
    public function __construct(public readonly array $slugs)
    {
        $this->afterCommit();
    }

    /** @return list<int> */
    public function backoff(): array
    {
        return [10, 60];
    }

    public function handle(): void
    {
        $url = (string) config('services.public_cache.revalidate_url');
        $secret = (string) config('services.public_cache.revalidate_secret');

        if ($url === '' || $secret === '' || $this->slugs === []) {
            return;
        }

        $corps = (string) json_encode(['slugs' => array_values(array_unique($this->slugs))]);
        $horodatage = time();

        Http::timeout(10)
            ->withHeaders(['X-Takussan-Signature' => self::signature($corps, $horodatage, $secret)])
            ->withBody($corps, 'application/json')
            ->post($url)
            ->throw();
    }

    public static function signature(string $corps, int $horodatage, string $secret): string
    {
        return 't='.$horodatage.',v1='.hash_hmac('sha256', $horodatage.'.'.$corps, $secret);
    }
}
