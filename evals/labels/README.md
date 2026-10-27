# Label evaluation set (AI-01)

The set that decides which vision model reads labels (Solution Plan §6.1–6.3, ADR-09).

## Rules

- **Photos never go in this repository.** They show third-party branding. Keep them in a private folder, bucket or repository. This folder holds only the ground truth and each photo's SHA-256, so a run can prove it used the right photos.
- **Ground truth records what is printed, not what is true.** If the bag does not print a roast level, `roastLevel` is `null`, even if you know it. A model that fills it in is fabricating, and that is the gate (≤ 2%).
- Use the app's canonical values: ISO 3166-1 alpha-2 country codes; `washed`, `natural`, `honey`, `anaerobic`, `wet-hulled`; `light`, `medium-light`, `medium`, `medium-dark`, `dark`; dates as `YYYY-MM-DD`; altitude in metres; weight in grams.

## Target mix for the first 50 (Hong Kong market)

English ≥ 40%, Traditional Chinese ≥ 15%, Japanese ≥ 15%, Simplified Chinese ≥ 10%, Korean and others ≥ 10%. Include glare, curved bags, low light and partial views. At least 30% should show a roast date.

## Steps

1. Photograph each bag with a phone, as a user would. Name the files `L001.jpg`, `L002.jpg`, …
2. Make the bake-off sizes and get the hashes:
   `npx tsx evals/prepare-photos.ts /path/to/photos`
3. Copy `ground-truth.template.json` to `ground-truth.json` and add one entry per photo, with its hash, language (`en`, `zh-Hant`, `zh-Hans`, `ja`, `ko`, …), conditions and truth.
4. Run one candidate at one size:
   ```sh
   AI_BASE_URL=… AI_API_KEY=… AI_SCAN_MODEL=… \
   npx tsx evals/run.ts labels --photos /path/to/photos --size 1024 --today 2026-10-27
   ```
   Pass `--today` as the date the photos were taken, so roast dates are judged as they were then.
5. Repeat for each candidate and size. Reports land in `evals/reports/` (not committed). Summarise them in ADR-09.

## Metrics

| Metric | Definition | Threshold |
|---|---|---|
| Core field accuracy | Name, roaster, origin country, process, roast level and roast date, when printed. Names are fuzzy-matched. | ≥ 90% |
| Fabrication rate | Fields filled in when the label does not print them, over all absent fields | ≤ 2% (gate) |
| Roast date accuracy | Exact date, when printed | ≥ 85% |
| Schema-valid responses | Calls that returned usable output | ≥ 99% |
| p90 latency | Per call, measured from Hong Kong | ≤ 6 s |
