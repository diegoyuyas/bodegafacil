import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        papel: '#F6F5F0',       // fondo — papel de ticket, no el crema genérico de IA
        tinta: '#1C1F1B',       // texto principal, casi negro con tinte verde
        bodega: {
          DEFAULT: '#2F6F4E',  // verde toldo — color de marca
          oscuro: '#1F4E36',
          claro: '#DCEAE1',
        },
        acento: {
          DEFAULT: '#D9A62E',  // mostaza — acento cálido, mercado peruano
          oscuro: '#B3841E',
        },
        alerta: '#B24C3C',      // alertas de stock bajo / deuda
        linea: '#DAD6C8',       // hairlines / divisores
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
