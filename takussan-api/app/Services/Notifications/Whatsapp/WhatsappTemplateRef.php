<?php

namespace App\Services\Notifications\Whatsapp;

/**
 * TCK-282 — Reference to an approved Meta template plus its ordered body
 * parameters. Returned by `SupportsWhatsapp::whatsappTemplate()` and used
 * by the cloud driver to build the `template` message payload sent outside
 * the 24h service window.
 *
 * The registry that maps `event + locale` → an approved template name comes
 * in TCK-283; this value object is the transport between the notification
 * and the driver.
 */
final class WhatsappTemplateRef
{
    /**
     * @param  string  $name  Meta-registered template name
     * @param  string  $language  BCP-47 / Meta language code (e.g. `fr`, `en_US`)
     * @param  list<string>  $params  ordered body variable values ({{1}}, {{2}}, …)
     */
    public function __construct(
        public readonly string $name,
        public readonly string $language,
        public readonly array $params = [],
    ) {}
}
