<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('report_exports', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('requested_by')->constrained('users')->cascadeOnDelete();
            $table->string('report');     // growth | revenue | cohorts | funnel
            $table->string('format');     // csv | xlsx
            $table->json('parameters')->nullable();
            $table->string('status')->default('queued'); // queued | processing | ready | failed
            $table->string('archive_path')->nullable();
            $table->unsignedBigInteger('row_count')->nullable();
            $table->unsignedBigInteger('size_bytes')->nullable();
            $table->timestamp('ready_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->text('failure_reason')->nullable();
            $table->timestamps();

            $table->index(['requested_by']);
            $table->index(['status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('report_exports');
    }
};
