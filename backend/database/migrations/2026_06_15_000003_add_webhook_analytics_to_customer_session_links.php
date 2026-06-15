<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customer_session_links', function (Blueprint $table) {
            $table->string('provider_status', 40)->nullable()->after('expires_at');
            $table->timestamp('started_at')->nullable()->after('provider_status');
            $table->timestamp('ended_at')->nullable()->after('started_at');
            $table->unsignedInteger('joinees')->default(0)->after('ended_at');
            $table->unsignedInteger('event_count')->default(0)->after('joinees');
            $table->json('analytics_payload')->nullable()->after('event_count');
            $table->json('summary_payload')->nullable()->after('analytics_payload');
            $table->json('feedback_payload')->nullable()->after('summary_payload');
            $table->timestamp('summary_generated_at')->nullable()->after('feedback_payload');
            $table->timestamp('last_webhook_at')->nullable()->after('summary_generated_at');
        });
    }

    public function down(): void
    {
        Schema::table('customer_session_links', function (Blueprint $table) {
            $table->dropColumn([
                'provider_status',
                'started_at',
                'ended_at',
                'joinees',
                'event_count',
                'analytics_payload',
                'summary_payload',
                'feedback_payload',
                'summary_generated_at',
                'last_webhook_at',
            ]);
        });
    }
};
