# Coffee Brewing & OCR Context Skill

## Purpose
Standardized context for Bean Sommelier and BrewMap projects—OCR label extraction, brewing guide generation, and session journaling using SCA standards and specialty coffee domain knowledge.

---

## Project Overview

**Bean Sommelier**: AI-powered specialty coffee brewing guide
- Input: Coffee bag label images (OCR via Claude Vision)
- Output: Tailored brewing recipes for V60, AeroPress, Chemex
- Tech: React, Claude Vision API, JSON parsing

**BrewMap**: Coffee label scanner with brew logging and origin tracking
- Input: Coffee bag images
- Output: Brew session journal, world origin map
- Tech: React, Claude Vision, session storage, geolocation

---

## Coffee Data Schema

### Coffee Label Input Schema
```json
{
  "origin": "string (e.g., 'Kenya AA', 'Ethiopian Yirgacheffe')",
  "originCountry": "string (ISO 3166-1 alpha-2 code)",
  "originRegion": "string (e.g., 'Yirgacheffe', 'Sidamo')",
  "roastDate": "ISO 8601 date (YYYY-MM-DD)",
  "roastLevel": "'light' | 'medium' | 'dark' | 'espresso'",
  "roastDescription": "string (optional notes: 'city', 'full city', etc.)",
  "tasteNotes": "string[] (e.g., ['citrus', 'floral', 'chocolate'])",
  "producer": "string (optional)",
  "altitude": "number (meters, optional)",
  "process": "'washed' | 'natural' | 'honey' | 'anaerobic' (optional)",
  "varietals": "string[] (optional, e.g., ['Bourbon', 'Typica'])"
}
```

### Brew Guide Output Schema
```json
{
  "brewMethod": "'V60' | 'AeroPress' | 'Chemex' | 'FrenchPress'",
  "waterTemp": {
    "min": "number (Celsius)",
    "max": "number (Celsius)",
    "unit": "°C"
  },
  "brewTime": {
    "min": "number (seconds)",
    "max": "number (seconds)",
    "display": "string (e.g., '4:00-4:30')"
  },
  "grindSize": "'coarse' | 'medium-coarse' | 'medium' | 'medium-fine' | 'fine'",
  "coffeeDose": {
    "value": "number (grams)",
    "ratio": "number (e.g., 1:16 = 1 part coffee, 16 parts water)"
  },
  "waterVolume": {
    "value": "number (ml)",
    "ratio": "number"
  },
  "technique": "string (step-by-step pouring/timing instructions)",
  "tasteProfile": "string (expected flavor outcome)",
  "notes": "string (optional tips for this specific origin)"
}
```

### Brew Session Log Schema
```json
{
  "sessionId": "UUID",
  "timestamp": "ISO 8601 datetime",
  "coffee": {
    "origin": "string",
    "roastDate": "ISO 8601 date",
    "roastLevel": "string"
  },
  "brewMethod": "string",
  "brewParams": {
    "waterTemp": "number (°C)",
    "brewTime": "number (seconds)",
    "coffeeDose": "number (grams)",
    "waterVolume": "number (ml)"
  },
  "notes": "string (taster notes, observations)",
  "rating": "number (1-10)",
  "tasteNotesObserved": "string[]"
}
```

---

## SCA (Specialty Coffee Association) Standards

### Water Temperature by Brew Method
| Method | Ideal Temp | Range |
|--------|-----------|-------|
| V60 | 92-94°C | 90-96°C |
| AeroPress | 82-86°C | 80-90°C |
| Chemex | 95-98°C | 92-98°C |
| French Press | 95-98°C | 92-98°C |
| Turkish | 92-94°C | 90-96°C |

### Grind Size Reference
- **Coarse** (>800µm): French press, cold brew, cowboy coffee
- **Medium-Coarse** (600-800µm): Chemex, V60 (longer brews)
- **Medium** (500-600µm): V60, pour-over, AeroPress
- **Medium-Fine** (350-500µm): Standard AeroPress, Moka pot
- **Fine** (250-350µm): Espresso, Turkish coffee

### Coffee-to-Water Ratios
- **Light-bodied**: 1:17 to 1:18 (fewer grams per ml)
- **Standard**: 1:15 to 1:16 (balanced)
- **Full-bodied**: 1:13 to 1:14 (more coffee)

SCA Golden Ratio: **1:16** (30g coffee → 480ml water)

### Processing Methods Impact on Flavor
- **Washed**: Cleaner, more acidic, origin flavors prominent
- **Natural**: Fruity, sweet, full-bodied
- **Honey/Pulped Natural**: Balanced sweetness and acidity
- **Anaerobic**: Intense, fermented, experimental flavors

---

## Common Roast Levels & Flavor Profiles

| Roast | Temp | Color | Acidity | Body | Common Origins |
|-------|------|-------|---------|------|----------------|
| **Light** | 195-205°C | Cinnamon-brown | High | Light | Ethiopian, Kenyan |
| **Medium** | 210-220°C | Brown | Medium | Medium | Central American |
| **Dark** | 225-235°C | Dark brown | Low | Full | Brazilian, Sumatran |

---

## OCR Extraction Best Practices

### Expected Label Fields
1. **Origin** (most prominent): Look for country/region name
2. **Roast Date**: Often in format "Roasted: MM/DD/YY" or similar
3. **Producer/Farm**: May be small text
4. **Processing Method**: Often abbreviated (W for washed, N for natural)
5. **Altitude** (if present): Look for "meters" or "ft"
6. **Taste Notes**: Usually a tag-like list
7. **Roast Level**: May be explicit or inferred from color description

### JSON Extraction Strategy
- Default missing fields to `null` (not empty strings)
- Validate date formats (accept multiple formats, normalize to ISO 8601)
- Standardize origin names (trim whitespace, proper case)
- Map roast level descriptors to standard 4-tier system
- Extract taste notes as array (split by commas/slashes)

### Common OCR Challenges
- **Blurred dates**: Ask user to verify or re-scan
- **Non-English labels**: Attempt extraction but flag for manual review
- **Hand-written notes**: May fail; document error gracefully
- **Multiple roast dates**: Assume most recent date is current roast

---

## Token-Efficient Prompting Patterns

### Pattern 1: Reference This Skill
Instead of re-explaining schemas or standards:
```
"Using the coffee-context-skill, extract brewing guide for this Ethiopian Yirgacheffe"
```
(Saves ~100 tokens vs. inline schema definition)

### Pattern 2: Structured Requests
```
TASK: Extract label data
INPUT: [image]
SCHEMA: Coffee Label Input Schema (from skill)
VALIDATION: Normalize roast level to [light|medium|dark|espresso]
OUTPUT: JSON matching schema
```
(Saves ~50 tokens vs. prose explanation)

### Pattern 3: Reuse Conversation Context
After establishing context once in a session, reference it:
```
Turn 1: "Here's the Bean Sommelier architecture..." (300 tokens)
Turn 2: "In the OCR module, handle this edge case" (20 tokens—Claude remembers architecture)
Turn 3: "Generate brew guide for this origin" (15 tokens—context still loaded)
```

---

## Common Implementations

### Scenario 1: Extract & Generate
1. User uploads coffee label image
2. Claude Vision extracts data → Coffee Label Schema
3. Match roast level and origin to brew method templates
4. Generate Brew Guide using SCA standards
5. Return JSON + human-readable recipe

### Scenario 2: Brew Session Logging
1. User logs brew session (method, parameters, tasting notes)
2. Validate against Brew Session Log Schema
3. Store in browser storage (or backend)
4. Aggregate sessions for origin tracking (BrewMap)

### Scenario 3: Origin Mapping
1. Extract `originCountry` from brew logs
2. Geocode to coordinates using ISO code
3. Plot on world map (Leaflet.js or Mapbox)
4. Cluster by country/region
5. Show stats: "You've tasted 12 coffees from 8 countries"

---

## Integration Checklist

- [ ] Schemas defined in frontend config or API contract
- [ ] SCA standards reference available (hardcoded or fetched)
- [ ] Roast level normalization function
- [ ] Date validation and normalization (ISO 8601)
- [ ] Taste notes splitting/normalization (lowercase, deduplicate)
- [ ] Origin name standardization (country codes, capitalization)
- [ ] Brew method templates (V60, AeroPress, Chemex)
- [ ] Error handling for incomplete OCR extraction
- [ ] Session logging mechanism (browser storage, backend, or file)
- [ ] Map integration for BrewMap (if applicable)

---

## Example Prompts (Using This Skill)

### Low Token Cost Prompts
```
"Debug the roastLevel normalization. Current: ['Light', 'MEDIUM', 'dark']. 
Expected: ['light', 'medium', 'dark']. What's wrong?"

"Generate brew guide for Kenya AA. Use V60 recipe template."

"Fix the date parsing in OCR extraction."

"Add Chemex to brewMethod templates."
```

All of these assume the skill context is loaded—no re-explaining schemas or standards needed.

---

## Token Savings Example

**Without skill** (each prompt):
```
"Here's the coffee schema: [50 tokens]
SCA standards: [40 tokens]
Brew templates: [30 tokens]
Task: Extract label [20 tokens]
Total: ~140 tokens per prompt
```

**With skill** (each prompt):
```
"Using coffee-context-skill, extract label [5 tokens]
Total: ~5 tokens per prompt
(Context loaded once at session start: ~150 tokens)

Over 10 prompts: 5×10 + 150 = 200 tokens vs. 140×10 = 1,400 tokens
Savings: 86%
```

---

## Quick Reference

| Item | Value |
|------|-------|
| Ideal Water Temp (V60) | 92-94°C |
| Ideal Water Temp (AeroPress) | 82-86°C |
| Ideal Water Temp (Chemex) | 95-98°C |
| SCA Golden Ratio | 1:16 (coffee:water) |
| Standard Brew Time (Pour-over) | 4:00-4:30 |
| Standard Brew Time (AeroPress) | 2:00-2:30 |
| Coarse Grind Size | >800µm |
| Medium Grind Size | 500-600µm |
| Fine Grind Size | <350µm |
