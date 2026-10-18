<?php

namespace Tests\Feature\Http\Webhook;

use Tests\TestCase;

/**
 * P36.08 (TCK-945) — la configuration des webhooks dit ce que le code lit, et rien d'autre.
 */
class WebhookConfigDeclarationsTest extends TestCase
{
    /**
     * `whatsapp.webhook_allowed_ips` (`WHATSAPP_WEBHOOK_IPS`) n'avait aucun lecteur : son docblock
     * annonçait un filtrage par IP qui n'existe pas (TCK-283 : la signature de Meta est le
     * contrôle, ses IP de sortie ne se listent pas). Retirée.
     */
    public function test_the_dead_whatsapp_ip_allowlist_is_gone(): void
    {
        $this->assertArrayNotHasKey('webhook_allowed_ips', config('whatsapp'));
    }

    /**
     * Le délai de validité du `ret_url` signé de LAM était lu par le pilote sans être déclaré :
     * réglable seulement par le code.
     */
    public function test_the_lam_return_url_ttl_is_declared(): void
    {
        $this->assertSame(7, config('sms.lafricamobile.dlr_signature_ttl_days'));
    }
}
