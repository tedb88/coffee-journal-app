# BrewMap — Key Journey UX Design

| Field | Value |
|---|---|
| Document | UX design note for the key user journey |
| Version | 0.1 — Draft for Product Owner review |
| Date | 23 October 2026 |
| Inputs | [`BRD.md`](BRD.md) v0.3 · [`SOLUTION_PLAN.md`](SOLUTION_PLAN.md) v0.2 |
| Prototype | Design canvas "BrewMap Key Journey": https://claude.ai/artifact/TE2JcqJmbvZwqvHzj9SMPH (private until shared from its Share menu) |
| Design method | App-screen rules of the `design-taste-frontend` skill (leonxlnx/taste-skill, MIT), read from the upstream repository |

---

## 1. Summary

The prototype redesigns the core loop for the primary persona (P2 Home Enthusiast, D2) on a phone (V60 only, D6). It has eight clickable screens. The current app ends at "here is a recipe". The new design carries the user through **brewing, tasting and the next brew**, which is where the product's value and its learning data sit (BRD G1).

Three choices drive the design:

1. **Every screen answers one question first, and its largest element is the answer.** On Today the question is "What should I brew this morning?" and the answer is the next-brew card. On guided brew it is "What do I pour now, to what weight, by when?" and the answer is the target weight.
2. **Colour belongs to the coffee's data, not the interface.** One water-blue hue marks the pour plan, the change to make and the freshness window. All controls are near-black or neutral. The current gradients and red-orange theme are removed.
3. **Dial-in is the product's signature.** The rating screen gives one specific change, which updates as the user moves the taste controls. The bag page then shows the change as the bridge from brew 1 to brew 2.

---

## 2. Screens

| # | Screen (artboard) | The one question it answers | Primary action | Requirements |
|---|---|---|---|---|
| 1 | Today (`Main`) | What should I brew this morning? | Start brew | BEAN-02, BEAN-04, J1/J2 entry |
| 2 | Scan a bag (`Scan`) | Is the label in frame? | Take photo (or Type it in) | CAP-01, CAP-06 |
| 3 | Check the label (`Review`) | Did it read my bag correctly? | Save bag and make recipe | CAP-02, CAP-03, CAP-04, CAP-08 |
| 4 | Recipe, brew 1 (`Recipe`) | What do I do, and why? | Start timer | RCP-03, RCP-07, AIP-1 |
| 5 | Guided brew (`Brew`) | What do I pour now, to what weight, by when? | Pause / Skip, then Taste it | BRW-01–07 |
| 6 | Taste and dial-in (`Taste`) | How was it, and what do I change? | Save brew | LOG-01–03, DIAL-01–03 |
| 7 | Bean after brew 1 (`Bean`) | How is this bag going, and what is my next brew? | Brew again | BEAN-02–04, DIAL-03–05 |
| 8 | Recipe, brew 2 (`RecipeNext`) | What changed since last time? | Start timer | RCP-09, DIAL-03 |

### Live behaviour in the prototype

- **Recipe:** the coffee stepper (12–20 g) recalculates the water, the four pour targets, the total time and the pour chart. The pours always add up to the total, which shows "AI decides, code calculates" at work.
- **Guided brew:** a working timer with pause, resume and skip. While a pour is running, the screen shows the weight the scale should read at that moment. The pour chart marks your progress. The prototype runs at 4× speed; this is a Tweak on the artboard and can be set to 1×.
- **Taste:** the rating and the two balance scales (sour ↔ bitter, weak ↔ strong) drive the "Next time" card through the R1 dial-in decision table in `SOLUTION_PLAN.md` §4.7. The grind-used stepper changes the from → to clicks in that card.
- **Check the label:** every field can be edited. The flagged roast date clears once confirmed or edited. Tasting notes can be removed or added.

---

## 3. Design system (BrewMap's own)

| Role | Value | Use |
|---|---|---|
| Ground | `#F5F5F2` | Page background (neutral paper, not cream) |
| Surface | `#FFFFFF` | Cards, bars |
| Raised | `#EEEEEA` | Neutral chips |
| Border / rule / control | `#E4E4DF` / `#EFEFEA` / `#CBCDC7` | Card edges / row rules / input and button outlines |
| Ink | `#15171A` | Text, primary buttons |
| Muted | `#5B5F63` | Secondary text (≥ 4.5:1 on ground and surface) |
| Accent (water) | `#0F6E8C` | Data only: the pour curve, the change to make, the freshness window |
| Brew mode | ground `#0C0D0E`, card `#17191B`, muted `#A9AEB2`, accent `#5BBAD5` | High-contrast dark screen for brewing at arm's length |
| Status | positive `#247B50`, notice `#FFFBEB` / `#FDE68A` / `#92400E` | Freshness dots; the "Check" flag on low-confidence fields |
| Type | Manrope 400/500/600/700, tabular figures on every number (replaced IBM Plex Sans after review) | One family; sizes 12/13/14/16/20/24, plus 64 on the brew target only |
| Shape | Cards 20 px radius, buttons and chips fully round, 44 px minimum touch target | One radius family |
| Layout | 390 px phone, 20 px side margins, bottom nav of 4 (Today, Beans, Journal, Map) | Flow screens use a back button plus a pinned primary action |

**Rules adopted from the taste skill:**
- No gradients, glass, glows or emoji.
- No icon-in-a-tinted-circle cards, no uppercase tracked labels, no sparklines.
- Colour only on data and status.
- Numbers are right-aligned and tabular, with units as smaller grey suffixes.
- Missing values show as a grey dash.
- One filled, near-black primary action per screen.

**One deliberate exception:** the 64 px target weight on the guided-brew screen. The skill's app rules cap figures below 48 px, but BRW-05 requires the screen to be readable at arm's length mid-pour.

---

## 4. Changes from the current app

| Area | Current app | New design |
|---|---|---|
| Visual style | Red-orange gradient banner, 3D bean illustration, tinted icon chips | Flat neutral ground, one data hue, no decoration |
| Flow end point | Recipe screen; the scan is auto-saved as a journal entry | Recipe → guided brew → taste → next-brew change |
| Label review | Read-only summary; only the dose is editable | Every field editable; low-confidence fields flagged with the reason (day-first date reading) |
| Recipe | Parameter pills and step list | Settings strip, a pour-plan chart, steps with cumulative targets, and a "why" in plain words |
| Brewing | None | Full-screen timer: current target, expected scale reading, countdown, next step |
| Feedback | None | 15-second rating with two balance scales and one concrete change |
| Bag view | None (journal entries only) | Next brew, dial-in history, freshness window, grams left |

---

## 5. Proposed requirement changes (for Product Owner decision)

The design raised these points. None has been applied to the BRD; under BRD §15 the Product Owner decides.

| # | Proposal | Rationale |
|---|---|---|
| UX-1 | Move **PRF-04 (grinder-specific settings)** from R2 to R1, limited to the grinder named in the profile with a manual clicks field | Home enthusiasts think in clicks, not "medium-fine". The dial-in card ("22 → 20 clicks") is far more actionable than a step on a five-word scale. |
| UX-2 | Add **DIAL-06: change one variable per brew.** Show the change on the next recipe and keep everything else fixed. | This is how users learn cause and effect, and it keeps the dial-in KPI interpretable |
| UX-3 | Add **BRW-09: expected scale reading during a pour**, labelled as a guide | Scale users pace pours by weight. This is derived in code from the pour window and needs no AI. |
| UX-4 | Have the expert reviewer validate the **freshness windows** (rest 7 days, best to day 30 for light-roast filter) under D9 | The bag screen and Today depend on them |
| UX-5 | Replace "Journal" and "Map" in the bottom nav with designs in the next round, or merge them into one "History" tab | Out of scope for this round. Four tabs may be one more than the persona needs. |

---

## 6. Prototype limitations and sample data

- Artboards are linked, but each keeps its own state. Choices made on one screen (for example a dose change) do not carry to the next.
- Journal and Map tabs are placeholders.
- **Sample data to replace before user testing with real bags:**
  - The fictional roaster "Fernleaf Roasters".
  - The bags "Hambela Alaka", "La Esperanza Pink Bourbon" and "Kirinyaga AA". The origins are real coffee regions.
  - The grinder "C40".
  - All weights, dates and ratings.
- Bag images are flat drawings standing in for user photos. No product photography is implied.

## 7. Next steps

1. Product Owner review of the canvas and decisions on UX-1 to UX-5.
2. Moderated usability test of journeys J1–J3 with at least 5 home brewers in Hong Kong (NFR-15), using the prototype on a phone.
3. Fold the findings into R1 Increments 1–3 (`SOLUTION_PLAN.md` §8.3).
