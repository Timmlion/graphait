const ICONS: Record<string, React.ReactNode> = {
  plus:       <><path d="M12 5v14"/><path d="M5 12h14"/></>,
  minus:      <path d="M5 12h14"/>,
  close:      <><path d="M6 6l12 12"/><path d="M18 6L6 18"/></>,
  check:      <path d="M4 12l5 5L20 6"/>,
  chevDown:   <path d="M6 9l6 6 6-6"/>,
  chevRight:  <path d="M9 6l6 6-6 6"/>,
  chevLeft:   <path d="M15 6l-6 6 6 6"/>,
  search:     <><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></>,
  filter:     <path d="M3 5h18l-7 9v6l-4-2v-4z"/>,
  more:       <><circle cx="5"  cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  moreV:      <><circle cx="12" cy="5"  r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></>,
  trash:      <><path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></>,
  edit:       <><path d="M4 20h4L20 8l-4-4L4 16z"/><path d="M14 6l4 4"/></>,
  settings:   <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>,
  logout:     <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></>,
  board:      <><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="10" rx="1"/></>,
  agents:     <><circle cx="12" cy="12" r="2.5"/><circle cx="4.5" cy="5.5" r="1.8"/><circle cx="19.5" cy="5.5" r="1.8"/><circle cx="4.5" cy="18.5" r="1.8"/><circle cx="19.5" cy="18.5" r="1.8"/><path d="M10 10.5L6 7"/><path d="M14 10.5L18 7"/><path d="M10 13.5L6 17"/><path d="M14 13.5L18 17"/></>,
  graph:      <><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8 7l8 0"/><path d="M7 8l4 8"/><path d="M17 8l-4 8"/></>,
  list:       <><path d="M8 6h12"/><path d="M8 12h12"/><path d="M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></>,
  clock:      <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  play:       <path d="M7 5l12 7-12 7z"/>,
  pause:      <><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></>,
  ai:         <><rect x="4" y="5" width="16" height="14" rx="1"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><path d="M4 9h16"/><path d="M12 2v3"/><path d="M10 2h4"/></>,
  human:      <><circle cx="12" cy="8" r="3.5"/><path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6"/></>,
  link:       <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></>,
  arrowRight: <><path d="M5 12h14"/><path d="M13 5l7 7-7 7"/></>,
  theme:      <path d="M12 3a9 9 0 1 0 9 9c-3.5 0-6-2.5-6-6 0-1.5.5-2.5 1-3-1 .5-2.5 1-4 0z"/>,
  spark:      <><path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/><path d="M5.6 5.6l2.8 2.8"/><path d="M15.6 15.6l2.8 2.8"/><path d="M5.6 18.4l2.8-2.8"/><path d="M15.6 8.4l2.8-2.8"/></>,
  alert:      <><path d="M12 3l10 18H2z"/><path d="M12 10v5"/><circle cx="12" cy="18" r="0.6" fill="currentColor"/></>,
  logo:       <><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M6 8v8"/><path d="M8 6h8"/><path d="M7.5 7.5l9 9"/></>,
  activity:   <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>,
  reportsTo:  <><path d="M5 6h10a4 4 0 0 1 4 4v8"/><path d="M15 15l4 4 4-4"/></>,
  collab:     <><path d="M4 8h12"/><path d="M12 4l4 4-4 4"/><path d="M20 16H8"/><path d="M12 20l-4-4 4-4"/></>,
  eye:        <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
  eyeOff:     <><path d="M17.9 17.9A11 11 0 0 1 12 20c-7 0-11-8-11-8a18 18 0 0 1 5.1-5.9"/><path d="M10.7 5.1A10 10 0 0 1 12 4c7 0 11 8 11 8a18 18 0 0 1-2.2 3.2"/><path d="M3 3l18 18"/></>,
  key:        <><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.77-7.77zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></>,
}

export default function Icon({ name, size = 14, stroke = 1.6, className = '' }: {
  name: string; size?: number; stroke?: number; className?: string
}) {
  const paths = ICONS[name]
  if (!paths) return null
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      className={className} style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      {paths}
    </svg>
  )
}
