import type { Config } from 'tailwindcss';

const variable = (nombre: string) => `rgb(var(--${nombre}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Los colores viven como variables CSS (ver :root en globals.css). Así el modo oscuro de la
      // Etapa V5 solo tendrá que redefinir los valores, sin tocar ninguna pantalla.
      colors: {
        papel: variable('papel'),       // fondo — blanco con tinte menta, del logo de Vende Fácil
        tinta: {
          DEFAULT: variable('tinta'),   // texto principal, casi negro con tinte turquesa oscuro
          suave: variable('tinta-suave'), // texto secundario (contraste 5:1; reemplaza a tinta/40, /50 y /60)
        },
        bodega: {
          DEFAULT: variable('bodega'),  // turquesa oscuro — color de marca (Vende Fácil), botones sólidos
          oscuro: variable('bodega-oscuro'),
          claro: variable('bodega-claro'),
        },
        acento: {
          DEFAULT: variable('acento'),  // dorado — distintivo Premium / advertencia (fondos y bordes)
          oscuro: variable('acento-oscuro'), // dorado para TEXTO sobre fondo claro (contraste 5:1)
        },
        ok: variable('ok'),             // verde — cobrado, pagado, todo bien
        alerta: variable('alerta'),     // rojo — deuda, vencido, error
        linea: variable('linea'),       // hairlines / divisores
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
