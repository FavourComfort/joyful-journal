/** Auto-generated from the page's inline tailwind.config (audit hash aa1f395d). Content scans ALL static pages' raw text (HTML + inline scripts + template strings). */
module.exports = {
  "darkMode": "class",
  "theme": {
    "extend": {
      "colors": {
        "on-primary": "#ffffff",
        "background": "#f9f9ff",
        "outline": "#737685",
        "primary-fixed": "#dae2ff",
        "on-secondary-fixed": "#191c1e",
        "surface": "#f9f9ff",
        "secondary-container": "#dee0e2",
        "on-tertiary-fixed-variant": "#624000",
        "on-secondary": "#ffffff",
        "on-error": "#ffffff",
        "primary-container": "#0052cc",
        "on-background": "#041b3c",
        "secondary-fixed-dim": "#c5c6c8",
        "on-error-container": "#93000a",
        "surface-container": "#e8edff",
        "tertiary": "#5e3c00",
        "outline-variant": "#c3c6d6",
        "tertiary-fixed": "#ffddb3",
        "on-primary-container": "#c4d2ff",
        "surface-container-highest": "#d7e2ff",
        "on-tertiary-fixed": "#291800",
        "secondary": "#5c5f60",
        "inverse-primary": "#b2c5ff",
        "secondary-fixed": "#e1e2e4",
        "surface-container-low": "#f1f3ff",
        "inverse-on-surface": "#edf0ff",
        "primary-fixed-dim": "#b2c5ff",
        "primary": "#003d9b",
        "surface-container-high": "#e0e8ff",
        "surface-bright": "#f9f9ff",
        "error-container": "#ffdad6",
        "inverse-surface": "#1d3052",
        "on-secondary-fixed-variant": "#444749",
        "tertiary-fixed-dim": "#ffb950",
        "tertiary-container": "#7d5200",
        "error": "#ba1a1a",
        "surface-variant": "#d7e2ff",
        "surface-dim": "#cadaff",
        "surface-container-lowest": "#ffffff",
        "on-surface-variant": "#434654",
        "on-tertiary-container": "#ffca81",
        "on-primary-fixed-variant": "#0040a2",
        "on-tertiary": "#ffffff",
        "on-secondary-container": "#606365",
        "surface-tint": "#0c56d0",
        "on-primary-fixed": "#001848",
        "on-surface": "#041b3c"
      },
      "borderRadius": {
        "DEFAULT": "0.375rem",
        "lg": "0.75rem",
        "xl": "1rem",
        "full": "9999px"
      },
      "spacing": {
        "base": "8px",
        "margin-desktop": "64px",
        "margin-mobile": "16px",
        "md": "24px",
        "xl": "80px",
        "lg": "48px",
        "xs": "4px",
        "gutter": "24px",
        "sm": "12px"
      },
      "fontFamily": {
        "display": [
          "Hanken Grotesk"
        ],
        "body": [
          "Inter"
        ]
      }
    }
  },
  "content": [
    "public/pages/*.html"
  ]
};
module.exports.plugins = [require('@tailwindcss/forms'), require('@tailwindcss/container-queries')];
