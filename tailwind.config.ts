import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        papel: '#F4FAF9',       // fondo — blanco con tinte menta, del logo de Vende Fácil
        tinta: '#12262A',       // texto principal, casi negro con tinte turquesa oscuro
        bodega: {
          DEFAULT: '#0C6B7D',  // turquesa oscuro — color de marca (Vende Fácil), botones sólidos
          oscuro: '#06424D',
          claro: '#DCF3F1',
        },
        acento: {
          DEFAULT: '#D9A62E',  // dorado — distintivo de funciones Premium
          oscuro: '#B3841E',
        },
        alerta: '#B24C3C',      // alertas de stock bajo / deuda
        linea: '#D7E6E5',       // hairlines / divisores
      },
      fontFamily: {
        // Pila de fuentes del sistema: geométrica y redondeada donde esté
        // disponible (Avenir Next / Century Gothic), sin depender de una
        // descarga de red en build time. Si más adelante se agrega una
        // tipografía propia, basta con cambiar esta lista.
        sans: [
          'Avenir Next',
          'Century Gothic',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      maxWidth: {
        app: '480px', // la app es mobile-first; en desktop se centra como una boleta
      },
    },
  },
  plugins: [],
};

export default config;
