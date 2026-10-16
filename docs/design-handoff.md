# Handoff: KEYPLAN Web App Foundation

## Overview
KEYPLAN turns floor plans, product codes and specs into client presentations, BOQs and FF&E schedules for interior designers and architects in Thailand. This package is the visual and UI foundation for the **web app**: tokens, layout shell, components, table patterns and behaviour rules.

Core rule: **light only**. No dark surfaces larger than a chip. Every screen must print legibly (A4/A3) and in greyscale.

## About the Design Files
Files in `reference/` are **design references built in HTML** (Design Component `.dc.html` files rendered as slide decks). They show intended look and behaviour; they are **not production code**. Recreate them in the target codebase's environment using its patterns and libraries. If no codebase exists yet, choose a suitable framework (React + TypeScript recommended) and implement there. Open the `.dc.html` files in a browser to view them.

## Fidelity
**High-fidelity.** Colours, type, spacing and states are final. Recreate pixel-accurately. Component specimens are drawn at deck scale (1920×1080); UI values below are the real app values.

## Start here
`reference/KEYPLAN Web App Guidelines.dc.html` (13 slides) is the primary spec. `KEYPLAN Brand Guidelines.dc.html` covers logo, brand colour and misuse. `TemplateApp.dc.html`, `TemplateFFE_A4.dc.html`, `TemplateComponents.dc.html` are in-context mock-ups.
Note: the Brand Guidelines deck cover and some pages still use a dark panel; the Web App Guidelines and templates are the light-mode source of truth.

## Product map
Projects (PRJ), Plans (PLN), Items (ITM), Library (LIB), BOQ, Schedule (FF&E), Present (PRS). Item codes link plan, BOQ, schedule and presentation.

## Screens / Views

### App shell
- CSS grid: sidebar 240px | work area 1fr | inspector 360px (desktop ≥1280px). Top bar 64px spans work area + inspector.
- Sidebar: bg `#EFE8D8`, 1.5px right border `#1F1F1F`, padding 18px 14px. Logo mark 36px + wordmark. Nav item: 20px label, padding 8px 10px; active = bg `#EADFCB`, 1.5px Charcoal border, 700 weight; inactive text `#5E5A52`. Collapses to 64px icon rail.
- Top bar: white, 1.5px bottom border. Breadcrumb in IBM Plex Mono left; one Primary button right.
- Work area: Canvas `#F5F1E8`, 12 columns, 24px gutter, 32px padding, max-width 1440px.
- Inspector: white, 1.5px left border, item detail/edit. Hidden below 1280px (opens as overlay).
- Table header row and totals are sticky.
- Breakpoints: ≥1280 full; 768–1279 inspector collapses; phone = view-only schedules.

### Items / FF&E table (core screen)
- Container: white, 1.5px Charcoal border, radius 4px.
- Columns: Code (mono 500, `#A9432B`) | Img 56×56 thumbnail (bg `#EADFCB`, 1.5px border) | Item/รายการ (600) | Room/ห้อง | Qty (mono, right) | Total ฿ (mono 500, right) | Status chip.
- Header: bg `#EADFCB`, `inset 0 -2px 0 #1F1F1F` underline, 14px/700 label text. Rows: compact 56px, comfortable 72px, 1px `#CBBBA2` dividers. Numbers mono, right-aligned, thousands separators.
- Print: header repeats on each page, rows never split, sidebar/top bar/inspector hidden.
- Sample row: `F-01 | โซฟา 3 ที่นั่ง | ห้องนั่งเล่น | 1 | 42,500 | Approved`.

### Project card
White, 1.5px Charcoal border, radius 4px. 130px pattern header (`brand/pattern/keyplan-pattern-plan-canvas.svg`, 1.5px bottom border). Body padding 16px: mono code 12px grey, Manrope 800 name, meta line "48 items · ฿ 1,284,500".

### Modal / toast / empty state
- Modal: white, 1.5px border, offset shadow `6px 6px 0 #CBBBA2`, padding 18px, on scrim `rgba(203,187,162,.45)`. Title Manrope 800; actions right-aligned Cancel (secondary) + Delete (destructive outline).
- Toast/alert: tinted bg + 1.5px border in the same colour as text, icon glyph + bold message. Success `#D5E6D9/#2D6A47`, Warning `#F6E2B8/#8A5200`, Error `#F4D9D0/#7A2E1B`.
- Empty state: 1.5px dashed `#5E5A52` box, mono mark, one line (Thai + English) and one action.

## Components
**Buttons** (44px high, radius 2px, 1.5px Charcoal border, 700 weight):
- Primary: bg `#E6765D`, text `#1F1F1F`; hover `#F08C75`; pressed `#D4614A`. One per view.
- Secondary: bg white; hover `#EADFCB`; pressed `#CBBBA2`.
- Text: `#A9432B` underlined; hover `#1F1F1F`.
- Disabled: bg `#EFE8D8`, **dashed** border `#5E5A52`, text `#5E5A52`.
- Destructive: white bg, `#7A2E1B` border + text. Never filled.

**Inputs** (44px, white, 1.5px Charcoal border, radius 2px, padding 0 14px): label above (14px/600, always visible). Focus: `outline:3px solid #E6765D; outline-offset:2px`. Error: 2px `#7A2E1B` border + message below (13px+/600 `#7A2E1B`). Disabled: as disabled button. Checkbox/radio 26px, 1.5px border, checked fill `#E6765D` (radio dot `#A9432B`). Toggle 52×28.

**Code tag**: IBM Plex Mono 500, padding 4px 12px, 1.5px border, white (or Beige Soft/Sage Tint fills per category). Format `PREFIX-NN`, unique per project, copyable.

**Filter chip**: 600, padding 6px 16px, 1.5px border. Selected = `#E6765D` fill; idle = white; zero-state border `#CBBBA2`.

**Status chip**: 1.5px border in text colour, 10px dot + label, 600–700. Never colour alone.
Draft `#EADFCB/#5E5A52` · Quoted `#FFF/#1F1F1F` · Approved `#D5E6D9/#4A614A` · Ordered `#F6E2B8/#8A5200` · Delivered `#D5E6D9/#2D6A47` · Issue `#F4D9D0/#7A2E1B`.

**Category icons** (12): furniture F, built-in BI, lighting L, surfaces S, paint P, plumbing PL, hardware H, equipment EQ, countertop CT, decor D, signage SG, graphics G. 24px in UI, 48px in category tiles, Charcoal.

## Interactions & Behaviour
- Motion: 120ms hover, 200ms panels, ease-out; fade + 8px slide only; no bounce; none inside tables; honour `prefers-reduced-motion`.
- Focus ring visible on every control; hit targets ≥44px; keyboard-operable FF&E table.
- Delete flows use a confirm modal naming the impact ("Removes the item from BOQ and 2 schedules.").
- Errors state what happened and what to do. No exclamation marks, no emoji. Short literal verbs ("Add item", "Export BOQ").
- Currency `฿ 1,284,500`, no decimals except unit price. Dates: Buddhist era in Thai, ISO in English.
- Thai first, English second in one field pair; never break Thai mid-cluster; line-height ≥1.5 body, 1.3 headings.

## State Management
Suggested entities: Project, Plan, Item (code, category, name_th, name_en, room, qty, unit, unit_price, supplier, model, dimensions WxDxH, status, image), Schedule (A3/A4 layout), BOQ (derived from items). Status enum: draft, quoted, approved, ordered, delivered, issue. Item codes are unique per project and propagate to plan pins, BOQ, schedule and presentation.

## Design Tokens
```css
:root {
  --kp-canvas:#F5F1E8; --kp-white:#FFFFFF;
  --kp-ink:#1F1F1F;    --kp-ink-2:#5E5A52;
  --kp-line:#CBBBA2;   --kp-fill:#EADFCB;  /* sidebar #EFE8D8 */
  --kp-primary:#E6765D; --kp-primary-text:#A9432B;
  --kp-danger:#7A2E1B; --kp-danger-bg:#F4D9D0;
  --kp-sage:#829B82;   --kp-sage-text:#4A614A;
  --kp-ok:#2D6A47;     --kp-ok-bg:#D5E6D9;
  --kp-warn:#8A5200;   --kp-warn-bg:#F6E2B8;
  --font-display:'Manrope',sans-serif;
  --font-ui:'IBM Plex Sans Thai',sans-serif;
  --font-code:'IBM Plex Mono',monospace;
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-6:24px; --space-8:32px; --space-12:48px; --space-16:64px;
  --radius-sm:2px; --radius-md:4px;
  --line:1.5px solid var(--kp-ink);
  --lift:6px 6px 0 var(--kp-line);
  --focus:3px solid var(--kp-primary);
}
```
**Type scale** (web px): display Manrope 800 64/64 −0.04em · h1 Manrope 800 44/48 −0.03em · h2 Plex Thai 700 32/42 · h3 Plex Thai 600 24/32 · body Plex Thai 400 16/24 · label Plex Thai 600 14/20 · caption Plex Thai 400 12/18 min · code Plex Mono 500 14/20.
**Contrast**: body ≥4.5:1. Terracotta `#E6765D` and Sage `#829B82` are fills only; use Terracotta Deep / Sage Deep for text on Canvas. Other palette: Beige `#CBBBA2`, Terracotta Dark `#7A2E1B`.
**Radius**: 2px chips/inputs/buttons; 4px cards/tables/menus; 999px dots/toggles. **Depth**: no blur shadows; only the solid offset lift on menus and modals.

## Assets
All in `reference/brand/`: `logo/` (horizontal, stacked, mark, app icon; colour/mono/reversed/white; use colour logo on light), `icons/charcoal|white|accent` (12 categories), `pattern/` (grid, plan, plan-furnished; canvas/charcoal/terracotta — use **canvas** variants in the app), `accents/` (arrow, dimension, north, etc.). Fonts from Google Fonts: Manrope 600–800, IBM Plex Sans Thai 400–700, IBM Plex Mono 400–600. Contact details in the brand deck are placeholders.

## Files
- `reference/KEYPLAN Web App Guidelines.dc.html` — primary spec (13 slides)
- `reference/KEYPLAN Brand Guidelines.dc.html` — brand identity
- `reference/TemplateApp.dc.html`, `TemplateFFE_A4.dc.html`, `TemplateComponents.dc.html` — in-context UI mock-ups
- `reference/deck-stage.js`, `support.js` — runtime needed to open the references
- `reference/brand/` — logos, icons, patterns, accents
