# Forja · Gym y Despensa

App de gimnasio y cocina (Expo / React Native, publicada como web instalable): coach con plan semanal, entrenos con subida de pesos, despensa con escáner de tickets, recetas que descuentan del stock, menú semanal, agua, medidas y progreso.

- **Sin cuenta**: todo funciona en el móvil, sin internet.
- **Con cuenta** (Supabase): los datos se guardan en la nube y se activa la IA (Gemini): lectura de tickets, recetas con IA y chat con el coach. Los macros siempre se calculan con el catálogo de la app.

## Publicación

Cada push a `main` compila y publica en GitHub Pages (`.github/workflows/pages.yml`) → https://webvzla.github.io/forja/

## Puesta en marcha de cuentas e IA (una vez)

1. GitHub → Settings → Pages → Source: **GitHub Actions**.
2. Supabase → nuevo proyecto → SQL Editor → pega `supabase/esquema.sql` → Run.
   - Authentication → Sign In / Providers → Email: desactivar "Confirm email" (opcional).
   - Authentication → URL Configuration → Site URL: `https://webvzla.github.io/forja/`.
3. Gemini: aistudio.google.com → Get API key.
4. Supabase → Edge Functions → Secrets → `GEMINI_API_KEY`. Después Deploy a new function → Via Editor → nombre `ai` → pega `supabase/functions/ai/index.ts`. Opcional: secreto `DAILY_LIMIT` (usos de IA por persona y día, 60 por defecto).
5. Rellena `src/config.ts` con la Project URL y la clave anon (datos públicos).

## Desarrollo

```
npm install
npm run web        # probar en el navegador
npm run build:web  # genera dist/
```
