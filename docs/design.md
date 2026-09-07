# Design system notes

Hermes is a data-dense, dark-only operator console. The look is deliberate: hairline borders,
tabular numerals everywhere a number appears, a single warm accent (gold) for "the mandate",
and a cool accent (cyan) for links and interactive affordances. Nothing glows.

## Tokens (`src/app/globals.css`)

| Token | Value | Use |
|---|---|---|
| `--background` | `#08090b` | page ground |
| `--surface` | `#0f1115` | panels, cards, chart surface |
| `--surface-2` | `#14171d` | nested panels, table headers |
| `--border` / `--border-strong` | `#1e222b` / `#2b3140` | hairlines |
| `--foreground` / `--foreground-secondary` / `--muted` | `#e8e9ec` / `#b3b8c4` / `#7d8494` | text hierarchy |
| `--gold` | `#d4a44c` | mandate / North Star accent (UI only, not charts) |
| `--cyan` | `#4fb4ff` | links, interactive |
| `--pos` / `--neg` / `--warn` / `--info` | green / red / amber / blue | P&L sign, status |

Utilities: `.num` (tabular numerals + mono), `.eyebrow`, `.panel`, `.panel-2`, `.hairline-b`,
`.prose-hermes` (memo markdown), `[data-present="true"] .sensitive` (presentation mode blur).

## Chart palette (validated)

Charts use their own categorical series, assigned in fixed order and never cycled:

| Slot | Hex | Notes |
|---|---|---|
| `--series-1` | `#b8892b` | portfolio / primary series (darker than the UI gold on purpose) |
| `--series-2` | `#3987e5` | benchmark (QQQ) |
| `--series-3` | `#199e70` | |
| `--series-4` | `#d95926` | |
| `--series-5` | `#9085e9` | |
| `--series-6` | `#d55181` | |

The six-slot palette passes the `dataviz` skill validator on the dark surface `#0f1115`:
lightness band, chroma floor, adjacent-pair colour-vision-deficiency separation, the
normal-vision floor and contrast. The brighter UI gold `#d4a44c` failed the lightness band as
a chart colour, which is why series-1 is a separate, darker token. Re-run the validator if you
touch either list:

```
node <dataviz-skill>/scripts/validate_palette.js "#b8892b,#3987e5,#199e70,#d95926,#9085e9,#d55181" --mode dark --surface "#0f1115"
```

Rules carried from the skill: one y-axis per chart (never dual axes), a legend for two or more
series, direct labels only where they disambiguate, 2px lines, recessive grid, a crosshair +
tooltip on every time-series chart, and status colours (`--pos`, `--neg`, `--warn`) are never
reused as series colours.

## Presentation mode

`\` toggles analyst vs trade view (`src/stores/ui.ts`). In presentation mode the root element
carries `data-present="true"` and anything marked `.sensitive` (NAV, market values, P&L,
position sizes) is blurred so the screen can be shared without exposing the live book.
Column-level `sensitive` flags on `DataTable` do the same for tables.

## Keyboard map

| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` | command palette (search companies, memos, ideas; jump anywhere) |
| `g` then `p / r / i / q / n / c / a / k / g / t / s` | go to Portfolio / Research / Ideas / Quant / North Star / Companies / Agents / Knowledge / Activity (`g`) / Settings (`t`, `s`) |
| `\` | toggle presentation (trade) view |
| `.` | open the North Star drawer |
| `n` | new note |
| `i` | new idea |
| `?` | shortcuts dialog |
| `⌘S` | save (note editor) |
