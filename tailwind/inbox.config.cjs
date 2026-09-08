/** Auto-generated from the page's inline tailwind.config (audit hash 9454bc3c). Content scans ALL static pages' raw text (HTML + inline scripts + template strings). */
module.exports = {
  "theme": {
    "extend": {
      "colors": {
        "primary": "#003d9b",
        "primaryDark": "#002d73",
        "primarySoft": "#eef3ff",
        "page": "#f6f8fc",
        "ink": "#071a35",
        "muted": "#667085",
        "border": "#e6eaf0"
      },
      "fontFamily": {
        "display": [
          "Hanken Grotesk"
        ],
        "body": [
          "Inter"
        ]
      },
      "boxShadow": {
        "soft": "0 4px 20px rgba(15, 23, 42, 0.06)",
        "card": "0 8px 30px rgba(15, 23, 42, 0.07)"
      }
    }
  },
  "content": [
    "public/pages/*.html"
  ]
};
module.exports.plugins = [require('@tailwindcss/forms'), require('@tailwindcss/container-queries')];
