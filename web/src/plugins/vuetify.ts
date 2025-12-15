import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

export default createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'dark',
    themes: {
      dark: {
        dark: true,
        colors: {
          primary: '#FF6F00',      // Orange
          secondary: '#FFB300',    // Amber/Yellow
          accent: '#FF8F00',       // Deep Orange
          error: '#D32F2F',        // Red
          warning: '#FFA000',      // Amber
          info: '#FF9800',         // Orange variant
          success: '#4CAF50',      // Green
          background: '#1E1E1E',   // Dark gray
          surface: '#2C2C2C',      // Lighter gray
        },
      },
      light: {
        dark: false,
        colors: {
          primary: '#FF6F00',      // Orange
          secondary: '#FFB300',    // Amber/Yellow
          accent: '#FF8F00',       // Deep Orange
          error: '#D32F2F',        // Red
          warning: '#FFA000',      // Amber
          info: '#FF9800',         // Orange variant
          success: '#4CAF50',      // Green
          background: '#FAFAFA',   // Light background
          surface: '#FFFFFF',      // White surface
        },
      },
    },
  },
  defaults: {
    VBtn: {
      variant: 'flat',
      rounded: 'lg',
    },
    VCard: {
      rounded: 'lg',
      elevation: 0,
    },
    VTextField: {
      variant: 'outlined',
      density: 'comfortable',
    },
  },
})
