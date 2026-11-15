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

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]))

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const TERMS: Array<{ term: string; country: Country }> = COUNTRIES.flatMap((c) => [c.name, ...c.aliases].map((t) => ({ term: fold(t), country: c }))).sort(
  (a, b) => b.term.length - a.term.length,
) // longest first: "democratic republic of the congo" before "congo"

export function countryByCode(code: string | null | undefined): Country | null {
  if (!code) return null
  return BY_CODE.get(code.toUpperCase()) ?? null
}

/** Match free text such as "Ethiopia Yirgacheffe", "Kenya AA" or "Sumatra" to a country. */
export function normaliseCountry(raw: string | null | undefined): Country | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (/^[A-Za-z]{2}$/.test(trimmed)) return countryByCode(trimmed)
  const text = ` ${fold(trimmed)} `
  if (text.trim() === '') return null
  for (const { term, country } of TERMS) {
    if (text.includes(` ${term} `)) return country
  }
  return null
}
