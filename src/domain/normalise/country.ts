// Coffee-producing countries: ISO 3166-1 alpha-2 code, English name, map
// centroid and common label spellings. Full ISO coverage is MAP-02 (R1).

export interface Country {
  code: string
  name: string
  lat: number
  lng: number
  aliases: string[]
}

export const COUNTRIES: Country[] = [
  {
    code: 'ET',
    name: 'Ethiopia',
    lat: 9.145,
    lng: 40.489,
    aliases: ['ethiopian', 'yirgacheffe', 'yirgachefe', 'sidamo', 'sidama', 'guji', 'harrar', 'harar', 'limu', 'jimma', 'gedeo'],
  },
  { code: 'KE', name: 'Kenya', lat: -0.023, lng: 37.906, aliases: ['kenyan', 'nyeri', 'kirinyaga', 'kiambu', 'muranga'] },
  { code: 'CO', name: 'Colombia', lat: 4.571, lng: -74.297, aliases: ['colombian', 'huila', 'narino', 'cauca', 'tolima', 'antioquia'] },
  { code: 'BR', name: 'Brazil', lat: -14.235, lng: -51.925, aliases: ['brazilian', 'brasil', 'minas gerais', 'cerrado', 'mogiana'] },
  { code: 'GT', name: 'Guatemala', lat: 15.783, lng: -90.23, aliases: ['guatemalan', 'antigua', 'huehuetenango', 'atitlan'] },
  { code: 'HN', name: 'Honduras', lat: 15.2, lng: -86.241, aliases: ['honduran', 'marcala', 'santa barbara'] },
  { code: 'MX', name: 'Mexico', lat: 23.634, lng: -102.552, aliases: ['mexican', 'chiapas', 'oaxaca', 'veracruz'] },
  { code: 'SV', name: 'El Salvador', lat: 13.794, lng: -88.896, aliases: ['salvadoran', 'salvadorean'] },
  { code: 'NI', name: 'Nicaragua', lat: 12.865, lng: -85.207, aliases: ['nicaraguan'] },
  { code: 'CR', name: 'Costa Rica', lat: 9.748, lng: -83.753, aliases: ['costa rican', 'tarrazu', 'west valley'] },
  { code: 'PA', name: 'Panama', lat: 8.538, lng: -80.782, aliases: ['panamanian', 'boquete', 'volcan'] },
  { code: 'CU', name: 'Cuba', lat: 21.521, lng: -77.781, aliases: ['cuban'] },
  { code: 'JM', name: 'Jamaica', lat: 18.109, lng: -77.297, aliases: ['jamaican', 'blue mountain'] },
  { code: 'HT', name: 'Haiti', lat: 18.971, lng: -72.285, aliases: ['haitian'] },
  { code: 'DO', name: 'Dominican Republic', lat: 18.735, lng: -70.162, aliases: ['dominican'] },
  { code: 'PR', name: 'Puerto Rico', lat: 18.221, lng: -66.59, aliases: ['puerto rican'] },
  { code: 'VE', name: 'Venezuela', lat: 6.424, lng: -66.59, aliases: ['venezuelan'] },
  { code: 'EC', name: 'Ecuador', lat: -1.831, lng: -78.183, aliases: ['ecuadorian', 'galapagos', 'loja'] },
  { code: 'PE', name: 'Peru', lat: -9.19, lng: -75.015, aliases: ['peruvian', 'cajamarca', 'cusco'] },
  { code: 'BO', name: 'Bolivia', lat: -16.29, lng: -63.589, aliases: ['bolivian', 'caranavi'] },
  { code: 'RW', name: 'Rwanda', lat: -1.94, lng: 29.874, aliases: ['rwandan'] },
  { code: 'BI', name: 'Burundi', lat: -3.373, lng: 29.918, aliases: ['burundian', 'kayanza'] },
  { code: 'UG', name: 'Uganda', lat: 1.373, lng: 32.29, aliases: ['ugandan', 'mount elgon', 'bugisu'] },
  { code: 'TZ', name: 'Tanzania', lat: -6.369, lng: 34.888, aliases: ['tanzanian', 'kilimanjaro'] },
  { code: 'CD', name: 'DR Congo', lat: -4.038, lng: 21.759, aliases: ['democratic republic of the congo', 'drc', 'congo', 'kivu'] },
  { code: 'MW', name: 'Malawi', lat: -13.254, lng: 34.301, aliases: ['malawian'] },
  { code: 'ZM', name: 'Zambia', lat: -13.133, lng: 27.849, aliases: ['zambian'] },
  { code: 'ZW', name: 'Zimbabwe', lat: -19.015, lng: 29.154, aliases: ['zimbabwean'] },
  { code: 'CM', name: 'Cameroon', lat: 3.848, lng: 11.502, aliases: ['cameroonian'] },
  { code: 'NG', name: 'Nigeria', lat: 9.082, lng: 8.675, aliases: ['nigerian'] },
  { code: 'TG', name: 'Togo', lat: 8.62, lng: 0.825, aliases: ['togolese'] },
  { code: 'GH', name: 'Ghana', lat: 7.946, lng: -1.023, aliases: ['ghanaian'] },
  { code: 'CI', name: "Côte d'Ivoire", lat: 7.54, lng: -5.547, aliases: ['cote d ivoire', 'ivory coast'] },
  { code: 'MG', name: 'Madagascar', lat: -18.766, lng: 46.869, aliases: ['malagasy'] },
  { code: 'YE', name: 'Yemen', lat: 15.552, lng: 48.516, aliases: ['yemeni', 'mocha', 'haraz'] },
  { code: 'IN', name: 'India', lat: 20.594, lng: 78.963, aliases: ['indian', 'karnataka', 'chikmagalur', 'monsooned malabar'] },
  { code: 'NP', name: 'Nepal', lat: 28.394, lng: 84.124, aliases: ['nepali', 'nepalese'] },
  { code: 'LK', name: 'Sri Lanka', lat: 7.873, lng: 80.772, aliases: ['sri lankan', 'ceylon'] },
  { code: 'MM', name: 'Myanmar', lat: 16.871, lng: 96.195, aliases: ['burma', 'burmese'] },
  { code: 'TH', name: 'Thailand', lat: 15.87, lng: 100.992, aliases: ['thai', 'chiang rai', 'chiang mai'] },
  { code: 'LA', name: 'Laos', lat: 19.856, lng: 102.495, aliases: ['lao', 'bolaven'] },
  { code: 'VN', name: 'Vietnam', lat: 14.058, lng: 108.277, aliases: ['viet nam', 'vietnamese', 'da lat', 'dalat'] },
  { code: 'CN', name: 'China', lat: 35.861, lng: 104.195, aliases: ['chinese', 'yunnan', 'pu er', 'puer'] },
  { code: 'TW', name: 'Taiwan', lat: 23.698, lng: 120.961, aliases: ['taiwanese', 'alishan'] },
  { code: 'PH', name: 'Philippines', lat: 12.879, lng: 121.774, aliases: ['filipino', 'philippine', 'benguet', 'mindanao'] },
  {
    code: 'ID',
    name: 'Indonesia',
    lat: -0.789,
    lng: 113.921,
    aliases: ['indonesian', 'sumatra', 'sumatran', 'java', 'javanese', 'sulawesi', 'toraja', 'bali', 'flores', 'aceh', 'gayo'],
  },
  { code: 'TL', name: 'Timor-Leste', lat: -8.874, lng: 125.727, aliases: ['east timor', 'timor'] },
  { code: 'PG', name: 'Papua New Guinea', lat: -6.314, lng: 143.956, aliases: ['png', 'papua'] },
  { code: 'US', name: 'United States (Hawaii)', lat: 19.6, lng: -155.5, aliases: ['hawaii', 'hawaiian', 'kona', 'kau'] },
]

// Names as printed on Traditional Chinese, Simplified Chinese and Japanese
// labels, keyed by ISO code so they carry over to the full reference data
// (MAP-02). The scan prompt asks for English, but models sometimes return the
// label text as printed; without these the origin is flagged as unmatched
// (AI-01, CAP-04). Regions are listed only where an English alias above already
// maps them and the name means one origin. Left out on purpose: 藍山 and
// ブルーマウンテン (also a blend style) and 摩卡 and モカ (Yemen, Ethiopia or a drink).
// Taiwan comes before China so that 中国台湾 reads as Taiwan, as "Taiwan, China" does.
export const CJK_NAMES: Record<string, string[]> = {
  ET: [
    '衣索比亞',
    '衣索匹亞',
    '埃塞俄比亞',
    '埃塞俄比亚',
    'エチオピア',
    '耶加雪菲',
    '耶加雪啡',
    'イルガチェフェ',
    '西達摩',
    '西达摩',
    'シダモ',
    '古吉',
    'グジ',
  ],
  KE: ['肯亞', '肯雅', '肯尼亞', '肯尼亚', 'ケニア'],
  CO: ['哥倫比亞', '哥伦比亚', 'コロンビア'],
  BR: ['巴西', 'ブラジル'],
  GT: ['瓜地馬拉', '瓜地马拉', '危地馬拉', '危地马拉', 'グアテマラ', '安提瓜', 'アンティグア', '薇薇特南果', 'ウエウエテナンゴ'],
  HN: ['宏都拉斯', '洪都拉斯', 'ホンジュラス'],
  MX: ['墨西哥', 'メキシコ'],
  SV: ['薩爾瓦多', '萨尔瓦多', 'エルサルバドル'],
  NI: ['尼加拉瓜', 'ニカラグア'],
  CR: ['哥斯大黎加', '哥斯達黎加', '哥斯达黎加', 'コスタリカ'],
  PA: ['巴拿馬', '巴拿马', 'パナマ', 'ボケテ'],
  CU: ['古巴', 'キューバ'],
  JM: ['牙買加', '牙买加', 'ジャマイカ'],
  HT: ['海地', 'ハイチ'],
  DO: ['多明尼加', '多米尼加', 'ドミニカ'],
  PR: ['波多黎各', 'プエルトリコ'],
  VE: ['委內瑞拉', '委内瑞拉', 'ベネズエラ'],
  EC: ['厄瓜多', '厄瓜多爾', '厄瓜多尔', 'エクアドル'],
  PE: ['秘魯', '秘鲁', 'ペルー'],
  BO: ['玻利維亞', '玻利维亚', 'ボリビア'],
  RW: ['盧安達', '盧旺達', '卢旺达', 'ルワンダ'],
  BI: ['蒲隆地', '布隆迪', 'ブルンジ'],
  UG: ['烏干達', '乌干达', 'ウガンダ'],
  TZ: ['坦尚尼亞', '坦桑尼亞', '坦桑尼亚', 'タンザニア', '吉力馬札羅', '乞力馬扎羅', '乞力马扎罗', 'キリマンジャロ'],
  CD: ['剛果', '刚果', 'コンゴ'],
  MW: ['馬拉威', '馬拉維', '马拉维', 'マラウイ'],
  ZM: ['尚比亞', '贊比亞', '赞比亚', 'ザンビア'],
  ZW: ['辛巴威', '津巴布韋', '津巴布韦', 'ジンバブエ'],
  CM: ['喀麥隆', '喀麦隆', 'カメルーン'],
  NG: ['奈及利亞', '尼日利亞', '尼日利亚', 'ナイジェリア'],
  TG: ['多哥', 'トーゴ'],
  GH: ['迦納', '加納', '加纳', 'ガーナ'],
  CI: ['象牙海岸', '科特迪瓦', 'コートジボワール'],
  MG: ['馬達加斯加', '马达加斯加', 'マダガスカル'],
  YE: ['葉門', '也門', '也门', 'イエメン'],
  IN: ['印度', 'インド'],
  NP: ['尼泊爾', '尼泊尔', 'ネパール'],
  LK: ['斯里蘭卡', '斯里兰卡', 'スリランカ', '錫蘭', '锡兰', 'セイロン'],
  MM: ['緬甸', '缅甸', 'ミャンマー'],
  TH: ['泰國', '泰国', 'タイ', '清萊', '清莱', 'チェンライ', '清邁', '清迈', 'チェンマイ'],
  LA: ['寮國', '老撾', '老挝', 'ラオス'],
  VN: ['越南', 'ベトナム', '大叻', 'ダラット'],
  TW: ['台灣', '臺灣', '台湾', '阿里山'],
  CN: ['中國', '中国', '雲南', '云南'],
  PH: ['菲律賓', '菲律宾', 'フィリピン'],
  ID: [
    '印尼',
    '印度尼西亞',
    '印度尼西亚',
    'インドネシア',
    '蘇門答臘',
    '苏门答腊',
    'スマトラ',
    '爪哇',
    'ジャワ',
    '蘇拉威西',
    '苏拉威西',
    'スラウェシ',
    'トラジャ',
    '峇里',
    '巴厘',
    'バリ',
  ],
  TL: ['東帝汶', '东帝汶', '東ティモール'],
  PG: ['巴布亞紐幾內亞', '巴布亞新畿內亞', '巴布亚新几内亚', 'パプアニューギニア'],
  US: ['夏威夷', 'ハワイ', '科納', '科纳', 'コナ'],
}

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]))

/** Latin text only. NFKD also turns full-width letters (ＣＯＬＯＭＢＩＡ) into plain ones. */
function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const TERMS: Array<{ term: string; country: Country }> = COUNTRIES.flatMap((c) => [c.name, ...c.aliases].map((t) => ({ term: fold(t), country: c }))).sort(
  (a, b) => b.term.length - a.term.length,
) // longest first: "democratic republic of the congo" before "congo"

// Chinese and Japanese have no spaces between words, so CJK names match
// anywhere in the text, longest first: 印度尼西亞 before 印度, インドネシア before インド.
const CJK_TERMS: Array<{ term: string; country: Country; short: boolean }> = Object.entries(CJK_NAMES)
  .flatMap(([code, names]) => names.map((n) => ({ term: n.normalize('NFKC'), country: BY_CODE.get(code)!, short: /^[ァ-ヿ]{1,2}$/.test(n) })))
  .sort((a, b) => b.term.length - a.term.length)

const KATAKANA = /[ァ-ヺー-ヿ]/ // katakana letters and ー, but not the ・ separator

/** A two-character katakana name must stand alone, so that スタイル is not タイ and ココナッツ is not コナ. */
function cjkMatch(text: string, term: string, short: boolean): boolean {
  if (!short) return text.includes(term)
  for (let i = text.indexOf(term); i !== -1; i = text.indexOf(term, i + 1)) {
    if (!KATAKANA.test(text.charAt(i - 1)) && !KATAKANA.test(text.charAt(i + term.length))) return true
  }
  return false
}

export function countryByCode(code: string | null | undefined): Country | null {
  if (!code) return null
  return BY_CODE.get(code.toUpperCase()) ?? null
}

/** Match free text such as "Ethiopia Yirgacheffe", "Kenya AA", "Sumatra", "哥倫比亞" or "エチオピア・グジ" to a country. */
export function normaliseCountry(raw: string | null | undefined): Country | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (/^[A-Za-z]{2}$/.test(trimmed)) return countryByCode(trimmed)
  const latin = ` ${fold(trimmed)} `
  if (latin.trim() !== '') {
    for (const { term, country } of TERMS) {
      if (latin.includes(` ${term} `)) return country
    }
  }
  const cjk = trimmed.normalize('NFKC') // half-width ｺﾛﾝﾋﾞｱ → コロンビア
  for (const { term, country, short } of CJK_TERMS) {
    if (cjkMatch(cjk, term, short)) return country
  }
  return null
}
