<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('customer_session_links', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->string('project_name')->nullable();
            $table->string('presentation_id');
            $table->string('presentation_title')->nullable();
            $table->string('presenter_name');
            $table->string('presenter_email')->nullable();
            $table->string('presenter_platform_id')->nullable();
            $table->string('viewer_name');
            $table->string('viewer_email')->nullable();
            $table->string('viewer_phone')->nullable();
            $table->string('viewer_platform_id')->nullable();
            $table->uuid('session_token')->index();
            $table->string('session_code')->nullable();
            $table->string('join_code')->nullable();
            $table->text('presenter_link');
            $table->text('viewer_link');
            $table->timestamp('expires_at')->nullable();
            $table->json('raw_response')->nullable();
            $table->timestamps();

            $table->index(['customer_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_session_links');
    }
};
