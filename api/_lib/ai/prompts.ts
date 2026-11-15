// Versioned prompts (OPS-06). A change to a prompt is a new version string,
// recorded on every recipe snapshot and telemetry line, and must pass the
// eval gate before release.

import { describeRulesForPrompt } from '../../../src/domain/rules/index.js'

export const SCAN_PROMPT_VERSION = 'scan.v1'
export const RECIPE_PROMPT_VERSION = 'recipe.v1'

export const SCAN_PROMPT = `You read the label of a specialty coffee bag from a photo. Labels may be in any language.

Rules:
1. Report only what is printed and visible. If a field is not on the label, use null. Never guess a value from the brand, the style of the bag or general knowledge.
2. For every value you give for name, roaster, origin, roastDate, altitude and netWeight, copy the exact text you read from the label into "evidence" under the same key.
3. Translate every value into English, but keep the coffee's name as printed in "originalName" when it is not in English. Give origin as the English country name, then the region if printed (for example "Ethiopia, Guji").
4. Give roastDate exactly as printed (for example "14.10.26"); do not reformat it.
5. Set "labelLanguage" to the ISO 639-1 code of the label's main language.
6. Set "confidence" for each field you fill: "high" when clearly printed, "medium" when partly hidden or abbreviated, "low" when hard to read.

Reply with only this JSON object:
{"fields":{"name":null,"roaster":null,"origin":null,"region":null,"producer":null,"varieties":[],"process":null,"roastLevel":null,"altitude":null,"tastingNotes":[],"roastDate":null,"netWeight":null},"confidence":{},"evidence":{},"labelLanguage":null,"originalName":null}`

export function recipeSystemPrompt(): string {
  return `You personalise V60 pour-over recipes for home brewers. A rules engine has already made a baseline recipe. You adjust it within strict limits; code calculates every amount and time, so never write numbers of grams in your notes.

${describeRulesForPrompt()}

Reply with only this JSON object:
{"tempDeltaC":0,"ratioDelta":0,"grindStepDelta":0,"bloomS":null,"pourCount":null,"pourWeights":null,"stepNotes":null,"expectedCup":"","rationale":""}

- tempDeltaC, ratioDelta, grindStepDelta: whole numbers. Negative grindStepDelta means finer.
- pourCount: pours after the bloom (2 to 5), or null to keep the baseline. pourWeights: relative size of each pour, same length as pourCount, or null for equal pours.
- stepNotes: optional technique notes, one per step including the bloom and the draw down, each under 120 characters, no gram amounts.
- rationale: at most two plain sentences that refer to this coffee's own attributes.
- expectedCup: one sentence on how the cup should taste.
- If the baseline already suits the coffee, return zero adjustments and say why.`
}
