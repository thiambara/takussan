<?php

namespace App\Http\Controllers\Api\Admin;

use App\Ai\Usages\ConnectionTestUsage;
use App\Http\Controllers\Base\Controller;
use App\Services\Ai\AiErrorCode;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiProviderCatalogue;
use App\Services\Ai\AiRequest;
use App\Services\Ai\Exceptions\AiUnavailable;
use App\Services\Ai\ModelLink;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

/**
 * TCK-2385 (ADR-0076 §3) — les fournisseurs : une clé présente ou non, et un test de connexion qui
 * passe par la passerelle (journalisé, budgété). Aucune route ne rend ni n'accepte une clé.
 */
class AiProviderController extends Controller
{
    public function __construct(private readonly AiProviderCatalogue $providers) {}

    public function index(): JsonResponse
    {
        return $this->json(['data' => $this->providers->describe()]);
    }

    public function test(Request $request, string $provider, AiGateway $gateway): JsonResponse
    {
        abort_code_unless($this->providers->has($provider), 404, 'ai.provider_unknown');
        // TCK-2450 — le test de connexion est un envoi comme un autre : aucun hôte hors liste, même pour « OK ? ».
        $refusal = $this->providers->refusalCode($provider);
        abort_code_if($refusal !== null, 422, (string) $refusal);
        abort_code_if($this->providers->servesEmbeddings($provider) && ! $this->providers->reachable($provider), 422, 'ai.provider_unreachable');
        $model = $this->providers->cheapestModel($provider);
        abort_code_unless($model !== null, 422, 'ai.model_unpriced');

        try {
            // TCK-2423 — un fournisseur d'embeddings ne joue pas d'agent : le test de connexion lui demande un vecteur.
            $test = new AiRequest(ConnectionTestUsage::KEY, 'OK ?', actor: $request->user(), link: new ModelLink($provider, $model, 16));
            $result = $this->providers->servesEmbeddings($provider)
                ? $gateway->embed($test, ['OK ?'], (int) config('radar.similarity.embeddings.dimension'))
                : $gateway->run($test);

            return $this->json(['data' => ['ok' => true, 'model' => $model, 'duration_ms' => $result->call->duration_ms, 'error_code' => null]]);
        } catch (Throwable $e) {
            // Le message d'un fournisseur ne sort pas : seulement un code `ai.*`. Un seul maillon est
            // joué, donc « aucun fournisseur n'a répondu » se précise par sa cause (clé, délai…).
            $cause = $e instanceof AiUnavailable && $e->getPrevious() !== null ? $e->getPrevious() : $e;

            return $this->json(['data' => ['ok' => false, 'model' => $model, 'duration_ms' => null, 'error_code' => AiErrorCode::fromThrowable($cause)]]);
        }
    }
}
