<template>
  <v-container class="py-8">
    <v-row align="center" class="mb-6">
      <v-col>
        <h1 class="text-h3">Teams</h1>
        <p class="text-body-1 text-medium-emphasis mt-2">
          Teams are managed within leagues. Browse leagues to find and join teams.
        </p>
      </v-col>
    </v-row>

    <v-alert type="info" variant="tonal" class="mb-6">
      <v-alert-title>Teams Live in Leagues</v-alert-title>
      Teams are created and managed within league seasons. Visit the
      <router-link to="/leagues" class="text-primary">Leagues</router-link>
      page to browse teams, or go to
      <router-link to="/my-teams" class="text-primary">My Teams</router-link>
      to see teams you belong to.
    </v-alert>

    <v-row>
      <v-col cols="12" sm="6" md="4">
        <v-card to="/leagues" class="text-center pa-6">
          <v-icon size="48" color="primary" class="mb-4">mdi-trophy-outline</v-icon>
          <v-card-title>Browse Leagues</v-card-title>
          <v-card-text class="text-medium-emphasis">
            Find leagues and their teams
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="4">
        <v-card to="/my-teams" class="text-center pa-6">
          <v-icon size="48" color="secondary" class="mb-4">mdi-account-group</v-icon>
          <v-card-title>My Teams</v-card-title>
          <v-card-text class="text-medium-emphasis">
            View teams you belong to
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
</script>
