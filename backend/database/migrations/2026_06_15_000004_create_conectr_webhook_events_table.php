<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('conectr_webhook_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_session_link_id')->nullable()
                ->constrained('customer_session_links')->nullOnDelete();
            $table->string('event', 80);
            $table->string('session_token')->nullable()->index();
            $table->string('viewer_id')->nullable()->index();
            $table->string('delivery_hash', 64)->unique();
            $table->json('payload');
            $table->timestamp('received_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('conectr_webhook_events');
    }
};
