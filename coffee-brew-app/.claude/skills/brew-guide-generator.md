# Skill: brew-guide-generator
description: Generates accurate, science-based hand drip brewing guides from coffee label data.

## Purpose
When the user scans a coffee label, use this skill to generate a precise and 
consistent hand drip brewing guide. All recommendations must follow SCA 
(Specialty Coffee Association) standards.

## Input Fields Expected
From the vision scan, extract and use these fields to generate the guide:
- coffee_name: Name of the coffee
- origin_country: Country of origin
- region: Region/farm if available
- roast_level: Light / Medium-Light / Medium / Medium-Dark / Dark
- process: Washed / Natural / Honey / Anaerobic
- tasting_notes: Flavor descriptors on the label
- altitude: Metres above sea level if listed

## Brewing Parameters by Roast Level

### Light Roast
- Water temp: 94–96°C
- Ratio: 1:15 to 1:16 (e.g. 15g coffee : 225ml water)
- Grind size: Medium-fine (like coarse sand)
- Total brew time: 3:00 – 3:30 min

### Medium-Light Roast
- Water temp: 92–94°C
- Ratio: 1:15 (e.g. 15g coffee : 225ml water)
- Grind size: Medium (like table salt)
- Total brew time: 2:45 – 3:15 min

### Medium Roast
- Water temp: 90–92°C
- Ratio: 1:15 (e.g. 15g coffee : 225ml water)
- Grind size: Medium (like table salt)
- Total brew time: 2:30 – 3:00 min

### Medium-Dark Roast
- Water temp: 88–90°C
- Ratio: 1:14 to 1:15 (e.g. 15g coffee : 210ml water)
- Grind size: Medium-coarse (like rough sand)
- Total brew time: 2:15 – 2:45 min

### Dark Roast
- Water temp: 85–88°C
- Ratio: 1:13 to 1:14 (e.g. 15g coffee : 195ml water)
- Grind size: Coarse (like raw sugar)
- Total brew time: 2:00 – 2:30 min

## Process Adjustments
Apply these on top of roast level parameters:

- Natural process: Reduce temp by 1°C, increase ratio slightly (more water) 
  to avoid over-extraction of fruity sweetness
- Anaerobic process: Reduce temp by 2°C, use coarser grind to control 
  intensity of fermentation flavors
- Honey process: No adjustment needed, use base roast parameters
- Washed process: Use base roast parameters as-is

## Step-by-Step Pour Guide Format
Always generate exactly these steps:

### Step 1 — Prep (0:00)
- Heat water to [temp]°C
- Weigh [dose]g of coffee, grind to [grind size]
- Place filter in dripper, rinse with hot water, discard rinse water
- Place [dose]g ground coffee in filter, level the bed

### Step 2 — Bloom (0:00 – 0:30)
- Pour [bloom_amount]ml of water (2–3x the coffee dose)
- Start timer
- Gently swirl the dripper to saturate all grounds
- Wait 30 seconds — this releases CO2 for even extraction

### Step 3 — First Pour (0:30 – 1:00)
- Pour slowly in concentric circles to [first_pour_total]ml total
- Pour rate: steady and controlled, avoid pouring on the filter edges

### Step 4 — Second Pour (1:00 – 1:45)
- When water level drops to just above the coffee bed
- Pour to [second_pour_total]ml total
- Continue concentric circle pattern

### Step 5 — Final Pour (1:45 – 2:30)
- Pour remaining water to reach [total_water]ml
- Let it draw down completely

### Step 6 — Finish
- Total brew time should be [brew_time]
- Remove dripper, give cup a gentle swirl
- Taste and enjoy — [tasting_notes from label]

## Water Calculations
Always calculate and show:
- bloom_amount = coffee_dose × 2.5 (round to nearest 5ml)
- first_pour_total = total_water × 0.4 (round to nearest 5ml)
- second_pour_total = total_water × 0.7 (round to nearest 5ml)
- total_water = coffee_dose × ratio_multiplier

## Output Format Rules
- Always show the full step-by-step guide, never truncate
- Include a "Tasting Tip" at the end based on the label's tasting notes
- If roast level is missing from label, default to Medium and note this assumption
- If origin is Ethiopia or Kenya → suggest light roast parameters regardless 
  of label (these origins are almost always light roasted specialty)
- If origin is Brazil or Colombia → suggest medium roast parameters as default
- Always end with a "Dialing In" tip — one adjustment the user can make 
  if the brew tastes too sour or too bitter

## Tasting Tip Logic
Map tasting notes to brew suggestions:
- Fruity / Berry / Citrus → "Try a slightly longer bloom (45s) to enhance brightness"
- Chocolate / Nutty / Caramel → "Try a slightly lower temp (−1°C) to bring out sweetness"
- Floral / Jasmine / Rose → "Use the highest temp in the range to preserve delicate aromatics"
- Earthy / Spicy / Tobacco → "Use coarser grind to keep body without bitterness"

## Dialing In Tips
Always append one of these based on roast:
- If too sour: grind finer, increase water temp by 1–2°C, or extend brew time
- If too bitter: grind coarser, reduce water temp by 1–2°C, or shorten brew time
```

---

## Step 2 — Tell Claude Code to use it

Once the file is saved, go back to your Claude Code Terminal tab and paste this:
```
Read the skill file at .claude/skills/brew-guide-generator.md and apply 
it to the brewing guide generation logic in LabelScanner.jsx. Make sure 
every brew recommendation follows the parameters, water calculations, 
step-by-step format, tasting tips, and dialing-in tips defined in the skill.