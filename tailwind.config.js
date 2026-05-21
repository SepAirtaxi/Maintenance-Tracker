/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1440px",
      },
    },
    extend: {
      fontFamily: {
        sans: ['"Inter Tight"', "Inter", "system-ui", "sans-serif"],
        display: ['"Bricolage Grotesque"', '"Inter Tight"', "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
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
        status: {
          green: "hsl(var(--sev-green-edge))",
          yellow: "hsl(var(--sev-yellow-edge))",
          red: "hsl(var(--sev-red-edge))",
        },
        sev: {
          "red-fg": "hsl(var(--sev-red-fg))",
          "red-bg": "hsl(var(--sev-red-bg))",
          "red-edge": "hsl(var(--sev-red-edge))",
          "yellow-fg": "hsl(var(--sev-yellow-fg))",
          "yellow-bg": "hsl(var(--sev-yellow-bg))",
          "yellow-edge": "hsl(var(--sev-yellow-edge))",
          "green-fg": "hsl(var(--sev-green-fg))",
          "green-bg": "hsl(var(--sev-green-bg))",
          "green-edge": "hsl(var(--sev-green-edge))",
        },
      },
      borderRadius: {
        none: "0",
        sm: "0",
        DEFAULT: "0",
        md: "0",
        lg: "0",
        xl: "0",
        "2xl": "0",
        "3xl": "0",
        full: "9999px",
      },
      boxShadow: {
        // Default shadows muted to near-nothing — the aesthetic is flat
        sm: "0 0 0 1px hsl(var(--foreground) / 0.04)",
        DEFAULT: "0 1px 0 hsl(var(--foreground) / 0.06)",
        md: "0 2px 0 hsl(var(--foreground) / 0.06)",
        lg: "0 4px 0 hsl(var(--foreground) / 0.08)",
        // A single intentional elevation for dialogs only
        dialog: "0 24px 60px -20px hsl(var(--foreground) / 0.35), 0 0 0 1px hsl(var(--foreground) / 0.3)",
      },
      letterSpacing: {
        spec: "0.14em",
        stamp: "0.05em",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
