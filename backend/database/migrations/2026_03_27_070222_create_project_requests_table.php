<?php
// database/migrations/2026_03_27_000001_create_project_requests_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('project_requests', function (Blueprint $table) {
            $table->id();
            
            // Who requested
            $table->foreignId('user_id')
                  ->constrained()
                  ->cascadeOnDelete();
            
            // Project details
            $table->string('developer_name');
            $table->string('project_name');
            $table->string('manager_name');
            $table->string('manager_phone', 15);
            $table->string('manager_email');
            
            // Status tracking
            $table->enum('status', ['pending', 'contacted', 'activated', 'rejected'])
                  ->default('pending');
            
            $table->text('notes')->nullable();
            $table->timestamp('contacted_at')->nullable();
            $table->timestamp('activated_at')->nullable();
            
            $table->timestamps();
            
            // Indexes
            $table->index(['user_id', 'status']);
            $table->index('project_name');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_requests');
    }
};