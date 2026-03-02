<template>
  <v-container class="py-8">
    <v-row justify="center">
      <v-col cols="12" sm="8" md="6">
        <v-btn variant="text" to="/leagues" class="mb-4">
          <v-icon start>mdi-arrow-left</v-icon>
          Back to Leagues
        </v-btn>

        <v-card class="pa-6 text-center">
          <v-icon size="64" color="primary" class="mb-4">mdi-account-group</v-icon>
          <v-card-title class="text-h4 mb-4">Create a Team</v-card-title>
          <v-card-text class="text-body-1 text-medium-emphasis mb-6">
            Teams are now created within leagues. To create a team, navigate to a league
            and use the "Create Team" option there.
          </v-card-text>
          <v-btn color="primary" size="large" to="/leagues">
            Browse Leagues
          </v-btn>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
</script>
