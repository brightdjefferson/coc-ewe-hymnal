/** The COC Ewe Hymnal logo: sunrise over an open hymnal, with the Ewe letter ɛ as a note. */
export default function Logo({ size = 40, label }: { size?: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="logo"
    >
      <rect width="128" height="128" rx="32" fill="#14213D" />
      <circle cx="64" cy="54" r="36" fill="#F08A5D" />
      <path
        d="M71 34 C66 25 48 26 47 37 C46 45 53 49 61 49 C51 49 44 54 45 63 C47 74 65 75 73 67"
        fill="none"
        stroke="#14213D"
        strokeWidth="8.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M79 70 V27" stroke="#14213D" strokeWidth="7.5" strokeLinecap="round" />
      <path d="M79 24 C89 27 95 35 91 47 C89 41 85 38 79 37 Z" fill="#14213D" />
      <path d="M16 80 C33 72 50 72 64 82 C78 72 95 72 112 80 V106 C95 99 78 99 64 109 C50 99 33 99 16 106 Z" fill="#FFFFFF" />
      <path d="M64 82 V109" stroke="#DDE2EA" strokeWidth="2.5" />
      <path d="M60 107 V121 L64 117 L68 121 V107 Z" fill="#F08A5D" />
    </svg>
  )
}
