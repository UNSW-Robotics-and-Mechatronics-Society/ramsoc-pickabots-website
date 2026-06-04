# Pickabots

The RAMSoc UNSW **Pickabots** robotics competition site. Lives at
`pickabots.ramsocunsw.org` and shares its **Clerk** instance and **Supabase**
project with the [sumobots site](https://github.com/UNSW-Robotics-and-Mechatronics-Society/ramsoc-sumobots-website).

> Naming/routing is **year-agnostic** on purpose — routes live at the root
> (`/`, `/dashboard`, …), not under a year segment, so the site carries forward
> without renaming each competition.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19**
- **Tailwind CSS v4**
- **Clerk** for auth (`proxy.ts` — Next 16's renamed middleware convention)
- **Supabase** (server-side secret client in `src/lib/supabase.ts`)
- **ShaderGradient** + `@react-three/fiber` for the animated background
- Mobile-first UI: glassmorphic bottom nav + glass content cards

## Getting started

```bash
pnpm install
cp .env.example .env.local   # then fill in the shared Clerk + Supabase keys
pnpm dev
```

Open http://localhost:3000.

## Environment variables

See `.env.example`. The Clerk and Supabase credentials are **shared with the
sumobots site** (same Clerk instance, same Supabase project).

## Project layout

```
src/
  app/
    layout.tsx          ClerkProvider + fonts + background + bottom nav
    page.tsx            Landing
    dashboard/          Protected (see proxy.ts)
    sign-in, sign-up/   Clerk catch-all routes
  components/
    ShaderBackground.tsx     client wrapper (dynamic import, ssr:false)
    ShaderGradientScene.tsx  the r3f canvas + gradient preset
    BottomNav.tsx            glassmorphic mobile nav
  lib/
    cn.ts               clsx + tailwind-merge helper
    supabase.ts         server-only Supabase client
  proxy.ts              Clerk auth (protects /dashboard)
```

## Scripts

- `pnpm dev` — dev server (Turbopack)
- `pnpm build` — production build
- `pnpm lint` — ESLint
