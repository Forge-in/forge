# @forge/theme

The Wrath Core design system, in one file.

`theme.css` holds the entire visual language — palette, type stacks, every
typographic role, and the handful of structural primitives the product is drawn
from. It is the single source of truth for every Forge web surface. No app should
define a colour, a font stack or a font size of its own.

## Using it

Add the dependency, then import it after Tailwind in the app's stylesheet entry:

```css
@import 'tailwindcss';
@import '@forge/theme/theme.css';
```

That is the whole integration. The file registers its tokens with Tailwind via
`@theme inline`, so utilities such as `bg-canvas`, `text-sub`, `border-line` and
`font-mono` work immediately, and it defines the type roles and primitives in the
`components` layer, so any Tailwind utility can override them.

### Fonts

Font families resolve through CSS variables, which lets the host app self-host
them however it likes. With `next/font`, expose these variable names on `<html>`:

| Variable                  | Face             |
| ------------------------- | ---------------- |
| `--font-archivo`          | Archivo          |
| `--font-archivo-black`    | Archivo Black    |
| `--font-instrument-serif` | Instrument Serif |
| `--font-jetbrains-mono`   | JetBrains Mono   |

Each falls back to the plain family name, so the file also works on a static page
that loads the fonts from a `<link>`.

### Colour scheme

`<html>` carries `data-theme="dark"` or `data-theme="light"`. Dark is the default
and the no-JS fallback. Set the attribute before first paint — the admin app does
it with a small inline script in `lib/theme.ts` — or the page will flash the
default palette on every load.

## What is in the file

1. **Palette** — `--wc-*` custom properties, defined once per colour scheme.
2. **Metrics** — the hairline width, chrome sizes, and the two motion curves.
3. **Tailwind bridge** — `@theme inline` mapping onto utility classes.
4. **Base** — element defaults, scrollbars, selection, focus ring, reduced motion.
5. **Type roles** — `t-eyebrow`, `t-action`, `t-body`, `t-display-xl` and the rest.
   A component picks a role and adds a `text-*` utility when the colour varies
   with state.
6. **Primitives** — `wc-card`, `wc-field`, `hairline-*`, `wc-dot`, `wc-avatar`,
   `wc-solid`, `wc-row`.

## Changing it

Adding a value here changes every app at once — that is the point, and the reason
to be conservative. Prefer reusing an existing role over adding a near-duplicate.
If a component needs a size or colour that is not here, add the token rather than
reaching for an arbitrary value at the call site.
