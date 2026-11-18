---
name: SorteSenai
description: A class's inside jokes as numbered stickers, rolled one at a time into an album de figurinhas.
colors:
  sec-roll: "oklch(63% 0.2 28)"
  sec-roll-deep: "oklch(50% 0.19 28)"
  sec-collection: "oklch(86% 0.16 92)"
  sec-collection-deep: "oklch(70% 0.15 80)"
  sec-games: "oklch(68% 0.17 150)"
  sec-games-deep: "oklch(54% 0.15 150)"
  sec-shop: "oklch(74% 0.17 55)"
  sec-shop-deep: "oklch(60% 0.17 50)"
  sec-ranking: "oklch(58% 0.17 305)"
  sec-ranking-deep: "oklch(46% 0.17 305)"
  sec-profile: "oklch(72% 0.15 355)"
  sec-profile-deep: "oklch(58% 0.17 355)"
  sec-suggest: "oklch(70% 0.11 230)"
  sec-suggest-deep: "oklch(56% 0.12 235)"
  focus: "oklch(50% 0.2 290)"
  coin: "oklch(84% 0.16 88)"
  coin-ink: "oklch(36% 0.08 70)"
  error: "oklch(55% 0.2 27)"
  tier-comum: "oklch(90% 0.015 290)"
  tier-comum-ink: "oklch(23% 0.03 290)"
  tier-incomum: "oklch(80% 0.14 150)"
  tier-incomum-ink: "oklch(24% 0.06 155)"
  tier-raro: "oklch(76% 0.12 225)"
  tier-raro-ink: "oklch(24% 0.07 245)"
  tier-epico: "oklch(72% 0.17 345)"
  tier-epico-ink: "oklch(25% 0.08 345)"
  tier-lendario: "oklch(82% 0.15 82)"
  tier-lendario-ink: "oklch(30% 0.07 65)"
  tier-mitico: "oklch(28% 0.06 290)"
  tier-mitico-ink: "oklch(98% 0.005 290)"
  paper: "oklch(96.5% 0.006 290)"
  paper-2: "oklch(91% 0.01 290)"
  paper-3: "oklch(99.4% 0.003 290)"
  rule: "oklch(88% 0.012 290)"
  line: "oklch(89% 0.012 290)"
  ink: "oklch(23% 0.03 290)"
  ink-2: "oklch(32% 0.03 290)"
  muted: "oklch(46% 0.025 290)"
typography:
  display:
    fontFamily: "Bricolage Grotesque, Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Bricolage Grotesque, Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  numeral:
    fontFamily: "Bricolage Grotesque, Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.85em"
    fontWeight: 800
    lineHeight: 1
    fontFeature: "tnum"
  title:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.15
  body:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.55
  control:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 700
    lineHeight: 1
  label:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.2
rounded:
  plate: "0.3em"
  icon: "9px"
  well: "12px"
  card: "16px"
  sticker: "0.95em"
  slot: "22px"
  pill: "999px"
spacing:
  3xs: "2px"
  2xs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  2xl: "64px"
  3xl: "96px"
components:
  button-primary:
    backgroundColor: "{colors.sec-roll}"
    textColor: "{colors.paper-3}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0 1.25rem"
    height: "44px"
  button-primary-ledge:
    backgroundColor: "{colors.sec-roll-deep}"
  button-roll:
    backgroundColor: "{colors.sec-roll}"
    textColor: "{colors.paper-3}"
    typography: "{typography.display}"
    rounded: "{rounded.pill}"
    padding: "0 2.25rem"
    height: "64px"
  button-secondary:
    backgroundColor: "{colors.paper-3}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0 1.25rem"
    height: "44px"
  button-secondary-ledge:
    backgroundColor: "{colors.rule}"
  button-disabled:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.muted}"
  capsule:
    backgroundColor: "{colors.paper-3}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    height: "40px"
  capsule-coin-icon:
    backgroundColor: "{colors.coin}"
    textColor: "{colors.coin-ink}"
    rounded: "{rounded.pill}"
    size: "30px"
  chip:
    backgroundColor: "{colors.paper-3}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 0.75rem"
    height: "32px"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper-3}"
  segmented-track:
    backgroundColor: "{colors.paper-2}"
    rounded: "{rounded.pill}"
    padding: "4px"
  segmented-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper-3}"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.well}"
    padding: "12px 16px"
    height: "44px"
  panel:
    backgroundColor: "{colors.paper-3}"
    rounded: "{rounded.card}"
  sidebar:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper-3}"
    rounded: "{rounded.card}"
    width: "248px"
  nav-link-active:
    backgroundColor: "{colors.paper-3}"
    textColor: "{colors.ink}"
    rounded: "{rounded.well}"
    height: "44px"
  sticker:
    backgroundColor: "{colors.paper-3}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sticker}"
    width: "11em"
  sticker-number:
    backgroundColor: "{colors.paper-3}"
    textColor: "{colors.ink}"
    typography: "{typography.numeral}"
    rounded: "{rounded.pill}"
  sticker-slot-empty:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.rule}"
    rounded: "{rounded.sticker}"
  progress:
    backgroundColor: "{colors.paper-2}"
    rounded: "{rounded.pill}"
    height: "10px"
---

# Design System: SorteSenai

## Overview

**Creative North Star: "O Álbum da Turma"**

The whole site is an album de figurinhas. The page is near-white paper with a faint violet cast, the type is near-black violet ink, and every card is a numbered die-cut sticker with a white border, a printed face and a name plate. Rolling deals a strip of stickers past an empty album slot until one sticks in. Collecting is filling numbered frames; rarity is how the sticker is printed, from flat ink up to silver foil, gold foil and holographic.

Each album section is printed in its own ink: Roletar tomato red, Coleção sunshine yellow, Jogos grass green, Loja tangerine, Ranking grape, Perfil bubblegum, Sugerir a quiet blue. The shell sets the current section's color as the page accent, so the primary button, the progress bar and the title chip all change ink with the page while the structure stays identical. Color lives on chips, buttons, bars and stickers; surfaces stay paper.

Density is relaxed and phone-first: chunky 44px+ controls, generous card grids, one strong action per screen. The world refuses the dark neon casino gacha and the frosted glass dashboard (the rejected "Aero" world): no glass, no backdrop blur, no gloss highlights, no sky gradients, no glowing auras.

**Key Characteristics:**
- Flat paper surfaces lifted by soft ink-tinted shadows; the only gradients are the foil prints on rare stickers.
- One printed color per album section, carried by the shell as the page accent.
- Chunky pill buttons with a same-hue darker ledge that presses down on click.
- The sticker is the signature: white die-cut border, number badge, rarity printed on its face.
- Empty slots are printed dashed frames showing the number, never the content.
- Bricolage Grotesque 800 for titles and numbers, Figtree for everything you read or press.

## Colors

A paper-and-ink album with a printed set of section inks and a rarity print ladder; all values are OKLCH and every neutral carries hue 290.

### Primary
- **Tomato Red** (sec-roll, ledge sec-roll-deep): the Roletar section and the default accent. The Roletar button, the reel's slot frame corners and notches, and the accent anywhere no other section claims it.
- **Section Inks** (sec-collection sunshine yellow, sec-games grass green, sec-shop tangerine, sec-ranking grape, sec-profile bubblegum, sec-suggest quiet blue; each with a `-deep` ledge): each becomes `--color-accent` on its own page. Grape and tomato take paper-white text; yellow, green, tangerine, bubblegum and blue take ink text.

### Secondary
- **Coin Gold** (coin, with coin-ink text): the coin icon disc, the roll cost badge, pending status pills.
- **Error Tomato** (error): validation and rejected status only.
- **Focus Violet** (focus): the 3px focus outline on paper; on the ink sidebar the focus ring is sunshine yellow instead.

### Tertiary
- **Rarity Prints** (tier-comum gray, tier-incomum green, tier-raro sky, tier-epico orchid, tier-lendario gold, tier-mitico deep violet, each with its `-ink`): the printed face of a sticker and the tint of rarity badges. Épico is printed on silver foil with an orchid wash, lendário on gold foil, mítico on deep violet with a holographic conic overlay and a moving sheen.

### Neutral
- **Album Paper** (paper): page background, input wells, empty sticker slots.
- **Page White** (paper-3): panels, sticker borders, capsules, secondary buttons, active nav tile, text on dark.
- **Paper Shade** (paper-2): disabled buttons, segmented and progress tracks, secondary button ledge.
- **Printed Rule** (rule, line): dashed slot frames, empty slot numbers, 2px inset borders on chips, capsules and inputs, table row dividers.
- **Violet Ink** (ink, ink-2): body text, the sidebar and mobile tab bar (the album cover), selected chips and segments.
- **Faded Ink** (muted): secondary text, hints, table headers, sticker notes.

### Named Rules
**The One Section, One Ink Rule.** A page shows its own section color as its accent and nothing else; other section colors appear only as the small chips in the navigation that name those sections.

**The Paper Stays Paper Rule.** Section and rarity colors go on chips, buttons, bars, badges and stickers, never on page or panel backgrounds. A tinted surface is at most an 8% mix into paper (the reel slot).

**The Foil Is Earned Rule.** Gradients exist only as rarity prints (silver, gold, holographic). Nothing else on the page uses a gradient, gloss or glow.

## Typography

**Display Font:** Bricolage Grotesque (with Figtree, system-ui fallback), loaded at weights 600 to 800 with optical size 12 to 96.
**Body Font:** Figtree (with system-ui fallback), weights 400 to 700.

**Character:** A heavy, slightly quirky grotesque for the things printed on the album (page titles, section titles, sticker numbers, the Roletar button) against a friendly, round, very legible sans for everything the player reads or presses.

### Hierarchy
- **Display** (Bricolage 800, 2.5rem, line-height 1, -0.03em): the page title in the top bar, next to its rotated section chip; 1.875rem under 60rem.
- **Headline** (Bricolage 800, 1.5rem, 1.1, -0.01em): section titles such as the mural and collection groups.
- **Numeral** (Bricolage 800, tabular): sticker number badges, odds pills, empty-slot numbers (3.4em in rule color), the Roletar button label at 1.35rem.
- **Title** (Figtree 700, 1em of the sticker, 1.15): sticker names, list item names; one line with ellipsis.
- **Body** (Figtree 400, 1.0625rem, 1.55): running text, max 65ch.
- **Control** (Figtree 700, 0.9375rem, 1): buttons, capsules, segmented options; nav links at 600.
- **Label** (Figtree 600, 0.8125rem, 1.2): chips (700), table headers, nav group labels, status pills, hints. Sentence case, no uppercase tracking.

### Named Rules
**The Printed Number Rule.** Every number that identifies or counts (sticker numbers, odds, coin balances, ranks) is tabular. Identifying numbers on stickers and slots are set in Bricolage 800; running counts in UI stay in Figtree.

**The Two Faces Rule.** Only two families exist. Bricolage never sets body copy or form text; Figtree never sets the page title.

## Layout

Desktop is a two-column shell: a 248px ink sidebar (the album cover) that is sticky and full height, and the main column, with 24px between them, inside a 1440px max width and 16px outer padding. The main column opens with a top bar: the page title and its section chip at left, the sample-data marker, coin and luck capsules and the Bônus diário button at right.

Pages are vertical stacks with 40px gaps (24px on Roletar). Sticker grids use `auto-fill` with a 9.5rem minimum and 24px by 16px gaps. Lists and feeds use `auto-fit` with a 15rem minimum.

Under 60rem the sidebar disappears; the brand moves into the top bar, the title wraps to its own line at 1.875rem, and a floating ink tab bar with five tabs (Roletar, Coleção, Jogos, Loja, Mais) sits 12px above the bottom safe area; the active tab fills with its section color. Under 40rem the Roletar button goes full width and multi-column grids collapse.

The spacing scale is 2, 4, 8, 12, 16, 24, 40, 64, 96px. Controls are never shorter than 44px (36px small, 32px chips).

## Elevation & Depth

Depth is paper on a desk: flat surfaces lifted by soft, low-contrast shadows tinted with the violet ink. There is no blur, no glass and no glow. Buttons get their depth from a solid ledge, not from a shadow.

### Shadow Vocabulary
- **Card lift** (`box-shadow: 0 1px 2px oklch(23% 0.03 290 / 0.06), 0 6px 18px oklch(23% 0.03 290 / 0.07)`): panels and pages lying on the paper.
- **Sheet lift** (`box-shadow: 0 2px 4px oklch(23% 0.03 290 / 0.08), 0 16px 36px oklch(23% 0.03 290 / 0.12)`): the sidebar and the floating mobile tab bar.
- **Sticker lift** (`box-shadow: 0 1px 1px oklch(23% 0.03 290 / 0.12), 0 8px 20px oklch(23% 0.03 290 / 0.14)`): every owned sticker. Empty slots have no shadow; they are printed on the page.
- **Button ledge** (`box-shadow: 0 4px 0 <section-deep>, 0 4px 12px oklch(23% 0.03 290 / 0.08)`): the same-hue darker base under every pill button; 6px on the large Roletar button, 3px on small buttons.

### Named Rules
**The Ledge Presses Rule.** A button's ledge is its own color, darker. Hover lifts it 1px and the ledge grows by 1px; active pushes it down by the full ledge height and the ledge disappears. Disabled buttons rest in the pressed position with no ledge.

**The Printed Slot Rule.** Anything not yet owned is printed into the page (dashed rule outline, no shadow); anything owned is stuck on top of it (white border, sticker lift).

## Shapes

Soft, chunky and die-cut. Controls are full pills (999px). Panels and the sidebar are 16px rounded rectangles, wells and nav tiles 12px, nav icon chips 9px. Stickers keep a 5:7 portrait ratio with a 0.95em outer radius; the printed face inside is rounded 0.65em at the top and 0.3em at the bottom, where it meets the name plate. The reel slot is a 22px frame.

A few marks are deliberately tilted, like stickers placed by hand: the brand mark (-6deg), the page title chip (-8deg), the nav icon on hover (-6deg), and a winning sticker settling from -3deg to 0 as it lands. Borders are drawn as 2px inset rings or 2px dashed outlines, never as 1px hairline boxes, except table row dividers.

## Components

### Buttons
Chunky, tactile and solid; they feel like pressing a rubber key.
- **Shape:** full pill (999px), 44px tall, 0 1.25rem padding.
- **Primary:** the page's section color with its `-deep` ledge; paper-white or ink text per section. One per screen.
- **Roletar (large):** 64px tall, Bricolage 800 label, 6px ledge, minimum 15rem wide, with a coin-gold cost badge inside. Full width under 40rem.
- **Secondary:** page white with a 2px inset rule ring and a rule-colored ledge; hover darkens ring and ledge to ink-2.
- **Small:** 36px, label size, 3px ledge.
- **Hover / Focus / Active:** lift 1px on hover (120ms ease-out), press down to the ledge on active, 3px focus-violet outline offset 4px. No gloss, no gradient, no glow.

### Chips
- **Style:** 32px pills, page white, 2px inset line ring, Figtree 700 label, optional 10px rarity dot.
- **State:** hover darkens the ring to ink-2; selected inverts to ink with page-white text and no ring.
- **Segmented control:** a paper-shade pill track with 4px padding; the selected option is an ink pill.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** page white on album paper.
- **Shadow Strategy:** card lift; the sidebar and tab bar use sheet lift.
- **Border:** none.
- **Internal Padding:** 16px to 24px.

### Inputs / Fields
- **Style:** album paper well, 2px inset line ring, 12px radius, 44px minimum, 12px by 16px padding; textareas 120px minimum. Label above in Figtree 700.
- **Focus:** 3px focus-violet outline offset 1px; hover darkens the ring to rule.
- **Error / Disabled:** error text and tint in error tomato; hints in faded ink at label size.

### Status capsules
Coins and luck in the top bar: 40px page-white pills with a 2px line ring and a 30px round icon disc (coin gold with coin ink for coins, grass green with white for luck). Numbers tabular.

### Navigation
- **Sidebar (album cover):** ink panel, 248px, sticky. Brand mark is a tilted sunshine-yellow tile with a yellow ledge next to the Bricolage wordmark. Links are grouped (Jogar, Turma, Você) under small faded labels; each link is 44px with a 30px icon chip tinted 22% with its section color.
- **Hover:** a faint white wash and the icon chip tilts -6deg.
- **Active:** the link becomes a page-white tile with ink text and its icon chip fills solid with the section color.
- **Mobile:** floating ink tab bar, five tabs, the active tab fills with its section color.

### The Figurinha (signature)
The numbered die-cut sticker. A page-white border (0.38em) around a printed face and a name plate. The face shows a white number badge (top left) and an ink odds pill (top right), with the art centered. The plate holds the title (one line), a two-line note (hidden at small size), and a foot row with rarity name and quantity. Sizes are 13, 16 and 21px base font; everything inside is em-based.
- **Prints:** comum to raro are flat tier color; épico is silver foil with an orchid multiply wash; lendário is gold foil; mítico is deep violet with a holographic overlay and a light sheen sweeping every 3.4s (off under reduced motion).
- **Empty slot:** album paper, 2px dashed rule outline, no shadow, the number large in rule color, the rarity name below, and the odds pill tinted with the tier. The joke and title never show before the sticker is owned.

### The Reel Slot
The Roletar window is an empty album slot at 1.25 scale: an 8% tomato wash on paper, a 2px dashed tomato-tinted outline, 4px tomato corner marks at top-left and bottom-right, and tomato notches top and bottom pointing at the winner. The strip decelerates over 2.2s (`cubic-bezier(0.12, 0.7, 0.1, 1)`); the winner overshoots to 1.31 and settles at 1.25 as it sticks in.

## Do's and Don'ts

### Do:
- **Do** take the accent from the page's section color through `--color-accent` and `--color-accent-deep`; never hard-code tomato red on another section's page.
- **Do** give every pill button a same-hue darker ledge (4px, 6px large, 3px small) that collapses on press.
- **Do** keep page and panel surfaces paper (`paper`, `paper-3`) and lift them with the ink-tinted card, sheet or sticker shadows.
- **Do** show unowned cards as printed empty slots: number, rarity and odds only.
- **Do** set sticker numbers, odds and slot numbers in Bricolage 800 with tabular figures.
- **Do** keep controls at 44px or taller (36px small, 32px chips) and use the 3px focus-violet outline on paper, sunshine yellow on ink.

### Don't:
- **Don't** use glass, backdrop blur, gloss highlights, sky gradients or glows; that was the rejected Aero world.
- **Don't** use gradients anywhere except the silver, gold and holographic rarity prints.
- **Don't** let blue lead; it is only the quiet Sugerir section ink and the raro print.
- **Don't** fill page or panel backgrounds with a section color; color stays on chips, buttons, bars, badges and stickers.
- **Don't** draw the dark neon casino look: no black page, no neon edges, no flashing.
- **Don't** add a third type family or set body text in Bricolage.
