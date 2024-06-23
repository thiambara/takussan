<?php

namespace App\Services;

use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class WaveService
{

    private string $_url;

    public function __construct()
    {
        $this->_url = config('services.services.wave.checkout_session_url');
    }

    public function createCheckoutSession(
        int $amount,
        string $type,
        string $reference,
        string|null $userId = null,
        string|null $redirectUrl = null,
        $success_url = null,
        $error_url = null
    ): Response {
        $data = array(
            'amount' => $amount,
            'currency' => 'XOF',
            'error_url' => $error_url ?? config('services.services.wave.error_url')."?through=wave&type=$type&reference=$reference",
            'success_url' => $success_url ?? config('services.services.wave.success_url')."?through=wave&type=$type&reference=$reference",
            'client_reference' => $type.'::'.$reference.'::'.($userId || '').'::'.($redirectUrl ?? url('').'/api/ipn/wave')
        );

        return Http::withHeaders([
            'Content-Type' => 'application/json',
            'Authorization' => "Bearer ".config('services.services.wave.oauth_token')
        ])->post($this->_url, $data);
    }

    public function getSession(string $id): Response
    {
        return Http::withHeaders([
            'Authorization' => "Bearer ".config('services.services.wave.oauth_token')
        ])->get($this->_url.$id);
    }

    public function checkIpnOrigin(): bool
    {
        return $this->checkWebhookSignature() || request()->input('public_routes_secret_key') == config('services.api.public_routes_secret_key');
    }

    public function checkWebhookSignature(): bool
    {
        $waveWebhookSecret = config('services.services.wave.webhook_secret');

        # This header is sent with the HMAC for verification.
        $waveSignature = $_SERVER['HTTP_WAVE_SIGNATURE'] ?? '';

        $parts = explode(",", $waveSignature);
        $timestamp = explode("=", $parts[0])[1] ?? null;

        $signatures = array();
        foreach (array_slice($parts, 1) as $signature) {
            $signatures[] = explode("=", $signature)[1];
        }


        $body = file_get_contents('php://input');

        $computed_hmac = hash_hmac("sha256", $timestamp.$body, $waveWebhookSecret);
        return in_array($computed_hmac, $signatures);
    }

    public function getType(string $clientReference): string
    {
        return Str::of($clientReference)->explode('::')->first();
    }

    public function getReference(string $clientReference): string
    {
        return Str::of($clientReference)->explode('::')->get(1);
    }

    public function getUserId(string $clientReference): string|null
    {
        return Str::of($clientReference)->explode('::')->get(2);
    }

    public function getRedirectUrl(string $clientReference): string|null
    {
        return Str::of($clientReference)->explode('::')->get(3);
    }


}
