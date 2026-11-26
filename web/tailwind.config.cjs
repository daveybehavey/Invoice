/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./web/index.html", "./web/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ['"Fraunces"', "Georgia", "serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"]
      },
      colors: {
        stonebg: "#F5F6F2",
        ink: {
          DEFAULT: "#101915",
          secondary: "#47554E",
          muted: "#6B7A72"
        },
        emeraldBrand: {
          DEFAULT: "#0F5132",
          hover: "#146C43",
          soft: "#E8F5EE",
          ring: "#198754"
        }
      },
      boxShadow: {
        paper: "0 20px 50px -12px rgba(16, 25, 21, 0.10), 0 4px 12px -2px rgba(16, 25, 21, 0.04)",
        card: "0 1px 3px rgba(16, 25, 21, 0.05), 0 1px 2px rgba(16, 25, 21, 0.03)"
      }
    }
  },
  plugins: []
};
