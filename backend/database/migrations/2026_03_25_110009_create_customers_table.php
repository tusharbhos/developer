<?php
// database/migrations/2026_03_25_110009_create_customers_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customers', function (Blueprint $table) {
            $table->id();

            // Owner
            $table->foreignId('user_id')
                ->constrained()
                ->cascadeOnDelete();

            // Identification
            $table->string('nickname', 100);
            $table->string('secret_code', 50)->unique();

            // Customer details (all optional — filled later via edit)
            $table->string('name')->nullable();
            $table->string('phone', 15)->nullable();
            $table->text('address')->nullable();

            // Multiple Projects - Store as JSON
            $table->json('projects')->nullable();  // Stores array of projects with meeting details

            // Meeting (single meeting - for backward compatibility)
            $table->date('meeting_date')->nullable();
            $table->string('meeting_time', 20)->nullable();
            $table->string('project_name')->nullable();

            // Extra
            $table->text('notes')->nullable();
            $table->enum('status', ['active', 'inactive', 'Booked'])
                ->default('active');

            $table->timestamps();

            // Index for scoped queries
            $table->index(['user_id', 'status']);
            $table->index('meeting_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customers');
    }
};
