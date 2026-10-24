import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "Lotes" pasó a llamarse "Bloques": los enlaces viejos siguen funcionando.
  async redirects() {
    return [
      { source: "/lotes", destination: "/bloques", permanent: false },
      { source: "/lotes/:id", destination: "/bloques/:id", permanent: false },
      { source: "/bloques/L:n(\\d{2})", destination: "/bloques/B:n", permanent: false },
      { source: "/recorridos/:ruta*", destination: "/capturas", permanent: false },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
