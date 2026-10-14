# Formulaic Portal — React UI (`web/`)

A React + TypeScript + Vite surface for the Formulaic Portal, set up as a
[shadcn/ui](https://ui.shadcn.com/) project so registry components can be added
with the shadcn CLI.

The rest of the repository (the vanilla HTML/CSS/JS portal at the repo root) is
untouched and still runs with `npm start` from the root — this directory is a
separate, self-contained app with its own `package.json`.

## Stack

| Concern | Choice |
|---|---|
| Framework | React 19 + Vite |
| Language | TypeScript (strict, `@/*` → `src/*` alias) |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite` |
| Components | shadcn/ui (`radix-nova` style, Lucide icons) |
| Lint | Oxlint |

## Commands

```bash
cd web
npm install
npm run dev      # dev server on http://localhost:5174
npm run build    # tsc -b && vite build
npm run preview  # serve the production build
npm run lint     # oxlint
```

From the repository root you can also use `npm run ui:dev` / `npm run ui:build`.

## Project structure

```
web/
  components.json         shadcn/ui config (aliases, style, base color)
  vite.config.ts          React + Tailwind plugins, "@" → "./src" alias
  src/
    index.css             Tailwind entry + shadcn design tokens (CSS variables)
    lib/utils.ts          cn() helper used by every ui component
    components/
      ui/                 shadcn/ui primitives + registry components
        button.tsx
        cta-3.tsx         CallToAction — bordered CTA band with plus corners
      demo.tsx            DemoOne — full-screen preview of <CallToAction />
    App.tsx               renders DemoOne
```

### Why `src/components/ui`

`components.json` declares `"ui": "@/components/ui"`. The shadcn CLI writes every
component it installs into that exact folder and generated code imports from
`@/components/ui/<name>`, so keeping primitives there is what makes
`npx shadcn@latest add <component>` and copy-pasted registry snippets resolve
without hand-editing imports.

## Adding more shadcn components

```bash
cd web
npx shadcn@latest add dialog card badge
```

## Using `<CallToAction />`

```tsx
import { CallToAction } from "@/components/ui/cta-3";

export default function Page() {
  return <CallToAction />;
}
```

The component takes no props. It is self-contained (heading, sub-copy and two
buttons are hard-coded) and is centred by its parent — it caps itself at
`max-w-3xl` and stretches to the available width below that, so it is responsive
without extra breakpoints. Colours come from the shadcn tokens in
`src/index.css`, so it follows light/dark mode automatically.
