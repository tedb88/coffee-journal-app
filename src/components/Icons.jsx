// Minimal geometric SVG icons — all use currentColor so they inherit CSS color.

const S = (size) => ({
  width: size, height: size, viewBox: '0 0 20 20',
  fill: 'none', stroke: 'currentColor',
  strokeWidth: '1.5', strokeLinecap: 'round', strokeLinejoin: 'round',
})

export const IconScan = ({ size = 18 }) => (
  <svg {...S(size)}>
    <path d="M3 7V4a1 1 0 011-1h3M13 3h3a1 1 0 011 1v3M17 13v3a1 1 0 01-1 1h-3M7 17H4a1 1 0 01-1-1v-3"/>
    <rect x="7" y="7" width="6" height="6" rx="1"/>
  </svg>
)

export const IconBook = ({ size = 18 }) => (
  <svg {...S(size)}>
    <path d="M3 4.5A1.5 1.5 0 014.5 3H10v14H4.5A1.5 1.5 0 013 15.5v-11z"/>
    <path d="M17 4.5A1.5 1.5 0 0015.5 3H10v14h5.5A1.5 1.5 0 0017 15.5v-11z"/>
    <path d="M10 3v14"/>
  </svg>
)

export const IconGlobe = ({ size = 18 }) => (
  <svg {...S(size)}>
    <circle cx="10" cy="10" r="8"/>
    <path d="M2 10h16"/>
    <path d="M10 2c-3 3-3 13 0 16"/>
    <path d="M10 2c3 3 3 13 0 16"/>
  </svg>
)

export const IconCamera = ({ size = 18 }) => (
  <svg {...S(size)}>
    <path d="M1.5 7A1.5 1.5 0 013 5.5h1.09a1.5 1.5 0 001.2-.6l.82-1.1A1.5 1.5 0 017.31 3h5.38a1.5 1.5 0 011.2.8l.82 1.1a1.5 1.5 0 001.2.6H17A1.5 1.5 0 0118.5 7v8.5A1.5 1.5 0 0117 17H3A1.5 1.5 0 011.5 15.5V7z"/>
    <circle cx="10" cy="11" r="2.75"/>
  </svg>
)

export const IconUpload = ({ size = 18 }) => (
  <svg {...S(size)}>
    <path d="M10 13V4M6 7.5l4-4 4 4"/>
    <path d="M3 14.5v2a1 1 0 001 1h12a1 1 0 001-1v-2"/>
  </svg>
)

export const IconArrowRight = ({ size = 16 }) => (
  <svg {...S(size)}>
    <path d="M4 10h12M11 5l5 5-5 5"/>
  </svg>
)

export const IconRefresh = ({ size = 16 }) => (
  <svg {...S(size)}>
    <path d="M4.5 10a5.5 5.5 0 109.77-3.46"/>
    <path d="M14.5 3.5v4h-4"/>
  </svg>
)

export const IconTrash = ({ size = 16 }) => (
  <svg {...S(size)}>
    <path d="M3 5.5h14M8 5.5V3.5h4v2M6.5 5.5l1 11h5l1-11"/>
  </svg>
)

export const IconChevronDown = ({ size = 14 }) => (
  <svg {...S(size)}>
    <path d="M5 8l5 4 5-4"/>
  </svg>
)

export const IconChevronUp = ({ size = 14 }) => (
  <svg {...S(size)}>
    <path d="M5 12l5-4 5 4"/>
  </svg>
)

export const IconFlame = ({ size = 14 }) => (
  <svg {...S(size)}>
    <path d="M10 2c0 4-5 5-4 9a5 5 0 0010 0c0-5-4-5.5-3.5-9C11 4 11.5 5.5 10 7c-.5-1.5-.5-3.5 0-5z"/>
  </svg>
)

export const IconGear = ({ size = 14 }) => (
  <svg {...S(size)}>
    <circle cx="10" cy="10" r="2.5"/>
    <path d="M10 3.5v2M10 14.5v2M3.5 10h2M14.5 10h2M5.4 5.4l1.4 1.4M13.2 13.2l1.4 1.4M5.4 14.6l1.4-1.4M13.2 6.8l1.4-1.4"/>
  </svg>
)

export const IconLeaf = ({ size = 14 }) => (
  <svg {...S(size)}>
    <path d="M3.5 16.5C3.5 10 7 5 17 3c-2 8-6 12-13.5 13.5z"/>
    <path d="M3.5 16.5c2-2 4-5 5.5-8.5"/>
  </svg>
)

export const IconMountain = ({ size = 14 }) => (
  <svg {...S(size)}>
    <path d="M1.5 16.5l6.5-11 3.5 6 2.5-4 5 9H1.5z"/>
  </svg>
)

export const IconSparkle = ({ size = 14 }) => (
  <svg {...S(size)}>
    <path d="M10 2l1.5 5.5L17 9l-5.5 1.5L10 16l-1.5-5.5L3 9l5.5-1.5L10 2z"/>
  </svg>
)

export const IconScale = ({ size = 14 }) => (
  <svg {...S(size)}>
    <path d="M10 4v12M7 4h6"/>
    <path d="M4 9l2-4 2 4a2 2 0 01-4 0z"/>
    <path d="M12 9l2-4 2 4a2 2 0 01-4 0z"/>
  </svg>
)

export const IconDroplet = ({ size = 14 }) => (
  <svg {...S(size)}>
    <path d="M10 2l5.5 8.5a5.5 5.5 0 01-11 0L10 2z"/>
  </svg>
)

export const IconThermometer = ({ size = 14 }) => (
  <svg {...S(size)}>
    <path d="M8.5 11.5V5a1.5 1.5 0 013 0v6.5a3.5 3.5 0 11-3 0z"/>
  </svg>
)

export const IconClock = ({ size = 14 }) => (
  <svg {...S(size)}>
    <circle cx="10" cy="10" r="7.5"/>
    <path d="M10 6.5v4l2.5 2.5"/>
  </svg>
)

export const IconGrid = ({ size = 14 }) => (
  <svg {...S(size)}>
    <circle cx="10" cy="10" r="7.5"/>
    <circle cx="10" cy="10" r="2.5"/>
    <path d="M10 2.5v5M10 12.5v5M2.5 10h5M12.5 10h5"/>
  </svg>
)

export const IconRuler = ({ size = 14 }) => (
  <svg {...S(size)}>
    <path d="M3 13.5L13.5 3l3.5 3.5L6.5 17 3 13.5z"/>
    <path d="M8 9l1 1M6 11l1 1M10 7l1 1"/>
  </svg>
)

export const IconLightbulb = ({ size = 14 }) => (
  <svg {...S(size)}>
    <path d="M10 2a6 6 0 014 10.5V14a1 1 0 01-1 1H7a1 1 0 01-1-1v-1.5A6 6 0 0110 2z"/>
    <path d="M7.5 18h5"/>
  </svg>
)

export const IconInbox = ({ size = 36 }) => (
  <svg {...S(size)}>
    <path d="M2 10h4.5l2 3.5h3l2-3.5H18"/>
    <path d="M2 5.5A1.5 1.5 0 013.5 4h13A1.5 1.5 0 0118 5.5L20 10v6a1.5 1.5 0 01-1.5 1.5h-17A1.5 1.5 0 010 16v-6l2-4.5z"/>
  </svg>
)

export const IconMapPin = ({ size = 36 }) => (
  <svg {...S(size)}>
    <path d="M10 2a7 7 0 017 7c0 5.5-7 11-7 11S3 14.5 3 9a7 7 0 017-7z"/>
    <circle cx="10" cy="9" r="2.5"/>
  </svg>
)

export const IconCheck = ({ size = 13 }) => (
  <svg {...S(size)}>
    <path d="M3 10l4 4 8-8"/>
  </svg>
)

export const IconBean = ({ size = 22 }) => (
  <svg {...S(size)}>
    <ellipse cx="10" cy="10" rx="6" ry="9" transform="rotate(-20 10 10)"/>
    <path d="M5.5 5.5c3 2 3 7 0 9" transform="rotate(-20 10 10)"/>
  </svg>
)
