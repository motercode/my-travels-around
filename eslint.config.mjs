import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // extractor/ es un paquete aparte (extensión de Chrome y backend local) con su propia CI.
  globalIgnores([".next/**", ".netlify/**", "out/**", "next-env.d.ts", "extractor/**"]),
  // Los .cjs (hooks de agentes, scripts de skills) son CommonJS de Node: require es lo suyo.
  { files: ["**/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
]);
