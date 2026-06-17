<?php

namespace Tests\Unit\Services\Whatsapp;

use App\Models\WhatsappContact;
use App\Services\Notifications\Whatsapp\ServiceWindow;
use Illuminate\Config\Repository;
use Tests\TestCase;

/**
 * TCK-282 — Meta 24h service window logic (AC6 boundary).
 */
class ServiceWindowTest extends TestCase
{
    private function window(): ServiceWindow
    {
        return new ServiceWindow(new Repository(['whatsapp' => ['service_window_hours' => 24]]));
    }

    private function contactWith(?\DateTimeInterface $lastInbound): WhatsappContact
    {
        $c = new WhatsappContact;
        $c->last_inbound_at = $lastInbound;

        return $c;
    }

    public function test_open_when_inbound_within_window(): void
    {
        $this->assertTrue($this->window()->isOpen($this->contactWith(now()->subHours(23))));
    }

    public function test_closed_when_inbound_older_than_window(): void
    {
        $this->assertFalse($this->window()->isOpen($this->contactWith(now()->subHours(25))));
    }

    public function test_closed_when_no_inbound(): void
    {
        $this->assertFalse($this->window()->isOpen($this->contactWith(null)));
    }

    public function test_closed_when_contact_null(): void
    {
        $this->assertFalse($this->window()->isOpen(null));
    }
}
