import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import { createVuetify } from 'vuetify'

// Components and directives are auto-imported by vite-plugin-vuetify
// based on actual template usage. See vite.config.ts.
export default createVuetify({
  theme: {
    defaultTheme: 'dark',
    themes: {
      // Dark-only product (the old light theme was unreachable — no toggle —
      // and its tokens failed contrast; deleted deliberately).
      //
      // Orange is the BRAND color and is reserved for primary/accent. The
      // semantic colors are distinct hues so status chips actually carry
      // information (previously primary/secondary/accent/info/warning were
      // five near-identical oranges). Values chosen for >= 4.5:1 contrast as
      // text on surface #2C2C2C.
      dark: {
        dark: true,
        colors: {
          primary: '#FF6F00',      // Brand orange
          secondary: '#78909C',    // Neutral blue-grey
          accent: '#FF8F00',       // Brand orange (light) — decorative only
          error: '#EF5350',        // Red 400 (~4.6:1 on surface)
          warning: '#FFC107',      // Amber — distinct from brand orange
          info: '#29B6F6',         // Light blue
          success: '#66BB6A',      // Green 400 (~5:1 on surface)
          background: '#1E1E1E',   // Dark gray
          surface: '#2C2C2C',      // Lighter gray
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
