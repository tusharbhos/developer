<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('project_presentation_links');
    }

    public function down(): void
    {
        Schema::create('project_presentation_links', function (Blueprint $table) {
            $table->id();
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->string('developer_name');
            $table->string('project_name');
            $table->unsignedBigInteger('presentation_id');
            $table->text('with_developer_link')->nullable();
            $table->text('without_developer_link')->nullable();
            $table->text('seven_slide_link')->nullable();
            $table->timestamps();
        });
    }
};
