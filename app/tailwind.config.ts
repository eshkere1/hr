import type { Config } from "tailwindcss";

/**
 * РАСТИМ · конфигурация Tailwind под дизайн-систему.
 * Файл целиком заменяет tailwind.config.ts в проекте Lovable.
 *
 * Всё, что перечислено здесь, — это разрешённый словарь интерфейса.
 * Если цвета нет в этом файле, его нельзя использовать в компоненте.
 * Новый цвет сначала появляется в index.css и здесь, и только потом в макете.
 */
export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "1.75rem",
      screens: { "2xl": "1240px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        "border-strong": "hsl(var(--border-strong))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",

        surface: "hsl(var(--surface))",
        "surface-2": "hsl(var(--surface-2))",
        "surface-3": "hsl(var(--surface-3))",

        ink: "hsl(var(--ink))",
        "ink-2": "hsl(var(--ink-2))",
        "ink-3": "hsl(var(--ink-3))",

        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          strong: "hsl(var(--brand-strong))",
          soft: "hsl(var(--brand-soft))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },

        /* Семантика. Используется ТОЛЬКО по назначению:
           оранжевый — это горящий срок, а не «акцентный блок». */
        good: { DEFAULT: "hsl(var(--good))", soft: "hsl(var(--good-soft))" },
        warn: { DEFAULT: "hsl(var(--warn))", soft: "hsl(var(--warn-soft))" },
        crit: { DEFAULT: "hsl(var(--destructive))", soft: "hsl(var(--crit-soft))" },
        info: { DEFAULT: "hsl(var(--info))", soft: "hsl(var(--info-soft))" },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },

        /* Этапы воронки: порядковая шкала, не палитра на выбор */
        stage: {
          1: "hsl(var(--stage-1))",
          2: "hsl(var(--stage-2))",
          3: "hsl(var(--stage-3))",
          4: "hsl(var(--stage-4))",
          5: "hsl(var(--stage-5))",
          6: "hsl(var(--stage-6))",
          7: "hsl(var(--stage-7))",
        },
      },

      fontFamily: {
        /* Commissioner — весь интерфейс */
        sans: ['Commissioner', 'Helvetica Neue', 'Arial', 'sans-serif'],
        /* Literata — заголовки и крупные числа */
        display: ['Literata', 'Georgia', 'Times New Roman', 'serif'],
        /* JetBrains Mono — цифры, идентификаторы, даты, деньги */
        mono: ['JetBrains Mono', 'SF Mono', 'Consolas', 'monospace'],
      },

      fontSize: {
        /* Шкала из дизайн-системы. Другие размеры не заводим. */
        'screen-title': ['32px', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'card-title':   ['20px', { lineHeight: '1.25', fontWeight: '600' }],
        'body':         ['15px', { lineHeight: '1.55' }],
        'body-2':       ['13.5px', { lineHeight: '1.5' }],
        'label':        ['11px', { lineHeight: '1.4', letterSpacing: '0.1em', fontWeight: '600' }],
        'kpi':          ['31px', { lineHeight: '1', letterSpacing: '-0.02em', fontWeight: '700' }],
      },

      /* Базовый шаг — 4px. Любой отступ кратен ему. */
      spacing: {
        '1': '4px',  '2': '8px',  '3': '12px', '4': '16px',
        '6': '24px', '8': '32px', '11': '44px',
      },

      borderRadius: {
        sm: '4px',                       /* чип */
        md: '8px',                       /* кнопка, поле */
        lg: 'var(--radius)',             /* карточка, 12px */
        xl: '18px',                      /* модалка */
      },

      boxShadow: {
        'sh-1': '0 1px 2px rgba(16,27,58,.05), 0 1px 1px rgba(16,27,58,.04)',
        'sh-2': '0 2px 6px rgba(16,27,58,.06), 0 6px 20px rgba(16,27,58,.06)',
        'sh-3': '0 12px 34px rgba(16,27,58,.13)',
      },

      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.4s linear infinite',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
