import type { Process, RoastLevel } from '../enums.js'

// Label wording in English, Chinese (Traditional and Simplified) and Japanese.
// Models are asked to translate, but sometimes return the label text as
// printed (AI-01). 天日乾燥 (sun-dried) and 發酵 (fermentation) are left out:
// Japanese and Chinese labels also use them for washed coffee.

function fold(s: string): string {
  return s
    .normalize('NFKC') // half-width ﾅﾁｭﾗﾙ → ナチュラル
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim()
}

/**
 * Map label wording to a process. Order matters: "anaerobic natural" is anaerobic, "unwashed" is natural,
 * 半水洗 (semi-washed) is honey and 非水洗 (unwashed) is natural, although both contain 水洗 (washed).
 */
export function normaliseProcess(raw: string | null | undefined): Process | null {
  if (!raw) return null
  const t = fold(raw)
  if (/anaerobic|carbonic|thermal shock|fermented|厭氧|厌氧|嫌気|アナエロ|カーボニック|二氧化碳浸[漬渍]/.test(t)) return 'anaerobic'
  if (/wet[- ]?hulled|giling basah|濕剝|湿剥|スマトラ式/.test(t)) return 'wet-hulled'
  if (/honey|pulped natural|semi[- ]?washed|蜜[處处処]理|[紅红黃黄黑白橙金]蜜|半水洗|ハニー|パルプド|セミウォッシュ/.test(t)) return 'honey'
  if (/unwashed|natural|dry[- ]?process|sun[- ]?dried|^n$|日曬|日晒|非水洗|ナチュラル/.test(t)) return 'natural'
  if (/washed|wet[- ]?process|^w$|水洗|ウォッシュ/.test(t)) return 'washed'
  return null
}

/**
 * Map roast wording (including roaster jargon such as "full city") to a roast level. Order matters:
 * 中深焙 is medium-dark and 中淺焙 or 淺中焙 medium-light, although they contain 深焙, 淺焙 and 中焙.
 */
export function normaliseRoast(raw: string | null | undefined): RoastLevel | null {
  if (!raw) return null
  const t = fold(raw).replace(/-/g, ' ')
  if (/medium dark|full city|dark medium|中深|ミディアムダーク|フルシティ/.test(t)) return 'medium-dark'
  if (/medium light|light medium|^city$|city roast|中[淺浅]|[淺浅]中|ミディアムライト|ライトミディアム|^シティー?$|シティー?ロースト/.test(t))
    return 'medium-light'
  if (/dark|french|italian|vienna|espresso|深[焙煎烘度]|法式|義式|意式|ダーク|フレンチ|イタリアン/.test(t)) return 'dark'
  if (/medium|city\+|city plus|omni|中[焙煎烘度]|ミディアム/.test(t)) return 'medium'
  if (/light|cinnamon|nordic|filter|[淺浅][焙煎烘度]|北[歐欧]|ライト|シナモン/.test(t)) return 'light'
  return null
}
