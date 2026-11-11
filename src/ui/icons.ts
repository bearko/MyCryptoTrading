/** Small inline pictures. They take the text colour (currentColor) unless they say otherwise. */
const svg = (size: number, body: string, box = 24): string => `<svg viewBox="0 0 ${box} ${box}" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;

export const ICON = {
  size: svg(18, '<rect x="2" y="2" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4"/><rect x="2" y="9" width="7" height="7" fill="currentColor"/>', 18),
  close: svg(18, '<path d="M3 3l12 12M15 3L3 15" stroke="currentColor" stroke-width="3" stroke-linecap="square"/>', 18),
  gearCog: svg(
    22,
    '<path d="M10 1h4l.6 3 2.4 1.1 2.7-1.5 2.8 2.8-1.5 2.700 1 2.4 3 .6v4l-3 .6-1 2.400 1.500 2.700-2.800 2.800-2.700-1.500-2.400 1-.6 3h-4l-.6-3-2.400-1-2.700 1.500-2.800-2.800 1.500-2.700-1-2.400-3-.6v-4l3-.6 1-2.400L2.500 6.400l2.800-2.800L8 5.100 10.400 4z" fill="currentColor"/><circle cx="12" cy="12" r="3.600" fill="var(--ink)"/>',
  ),
  bell: svg(
    44,
    '<ellipse cx="24" cy="40" rx="20" ry="4" fill="var(--ink)" opacity=".35"/><rect x="6" y="33" width="36" height="7" rx="2" fill="var(--brass-lo)" stroke="var(--ink)" stroke-width="2.500"/><path d="M9 33c0-12 6-20 15-20s15 8 15 20z" fill="var(--brass)" stroke="var(--ink)" stroke-width="2.500" stroke-linejoin="round"/><path d="M14 30c.5-7 3.500-11.500 8-13" fill="none" stroke="var(--paper)" stroke-width="2.500" stroke-linecap="round" opacity=".8"/><rect x="21" y="6" width="6" height="8" rx="2" fill="var(--brass)" stroke="var(--ink)" stroke-width="2.500"/><circle cx="24" cy="5" r="3.500" fill="var(--hot)" stroke="var(--ink)" stroke-width="2.500"/>',
    48,
  ),
  star: svg(14, '<path d="M12 1.500l3.200 6.700 7.300 1-5.300 5.100 1.300 7.300L12 18.100 5.500 21.600l1.300-7.300L1.500 9.200l7.300-1z" fill="currentColor"/>'),
  person: svg(12, '<circle cx="12" cy="6.500" r="5" fill="currentColor"/><path d="M2.500 23c0-6.500 4-10 9.500-10s9.500 3.500 9.500 10z" fill="currentColor"/>'),
  moon: svg(20, '<path d="M20 14.500A9 9 0 1 1 9.500 4a7 7 0 0 0 10.500 10.500z" fill="currentColor"/>'),
  bag: svg(
    44,
    '<path d="M10 16h28l3 24H7z" fill="var(--gum)" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/><path d="M17 20v-6a7 7 0 0 1 14 0v6" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/><path d="M20 29l3 3 6-7" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
    48,
  ),
  sword: svg(
    44,
    '<path d="M36 5l7 0 0 7-20 20-7-7z" fill="var(--paper)" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/><path d="M10 24l14 14" stroke="var(--ink)" stroke-width="7" stroke-linecap="round"/><path d="M10 24l14 14" stroke="var(--violet)" stroke-width="3" stroke-linecap="round"/><path d="M14 34l-8 8" stroke="var(--ink)" stroke-width="8" stroke-linecap="round"/><path d="M14 34l-8 8" stroke="var(--gum)" stroke-width="4" stroke-linecap="round"/>',
    48,
  ),
  // today's event, as a headline picture
  evNone: svg(
    56,
    '<circle cx="28" cy="28" r="12" fill="var(--gum)" stroke="var(--ink)" stroke-width="3"/><g stroke="var(--ink)" stroke-width="4" stroke-linecap="round"><path d="M28 4v7M28 45v7M4 28h7M45 28h7M11 11l5 5M40 40l5 5M45 11l-5 5M16 40l-5 5"/></g>',
    56,
  ),
  evRain: svg(
    56,
    '<path d="M14 34a10 10 0 0 1 1-20 13 13 0 0 1 25 2 9 9 0 0 1 1 18z" fill="var(--paper-2)" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/><g stroke="var(--cool)" stroke-width="4" stroke-linecap="round"><path d="M18 40l-3 9M28 40l-3 9M38 40l-3 9"/></g>',
    56,
  ),
  evCaravan: svg(
    56,
    '<path d="M6 20c0-9 8-13 18-13s18 4 18 13v14H6z" fill="var(--paper)" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/><path d="M15 8v26M24 7v27M33 8v26" stroke="var(--hot)" stroke-width="3"/><path d="M4 34h46l-3 8H7z" fill="var(--c-hp)" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/><circle cx="15" cy="45" r="6" fill="var(--ink-3)" stroke="var(--ink)" stroke-width="3"/><circle cx="38" cy="45" r="6" fill="var(--ink-3)" stroke="var(--ink)" stroke-width="3"/>',
    56,
  ),
  evBargain: svg(
    56,
    '<path d="M8 8h22l20 20-20 20L8 28z" fill="var(--gum)" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/><circle cx="17" cy="17" r="4" fill="var(--paper)" stroke="var(--ink)" stroke-width="3"/><path d="M24 34l12-12M26 24h.1M35 33h.1" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/>',
    56,
  ),
  evDemand: svg(
    56,
    '<path d="M6 46l12-14 9 7 12-18 11 9" fill="none" stroke="var(--ink)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 46l12-14 9 7 12-18 11 9" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M38 12h13v13" fill="none" stroke="var(--ink)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
    56,
  ),
  // where gear is worn
  slot: {
    head: svg(18, '<path d="M4 15a8 8 0 0 1 16 0v3H4z" fill="currentColor"/><rect x="2" y="17" width="20" height="3.500" fill="currentColor"/>'),
    body: svg(18, '<path d="M7 3l5 3 5-3 5 4-3 4-2-1v11H7V10l-2 1-3-4z" fill="currentColor"/>'),
    arm: svg(18, '<path d="M17 2l5 0 0 5-11 11-5-5z" fill="currentColor"/><path d="M4 12l8 8M7 17l-5 5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'),
    leg: svg(18, '<path d="M8 2h8v11l6 4v4H8z" fill="currentColor"/>'),
    special1: svg(18, '<path d="M12 1.500l3.200 6.700 7.300 1-5.300 5.100 1.300 7.300L12 18.100 5.500 21.600l1.300-7.300L1.500 9.200l7.300-1z" fill="currentColor"/>'),
    special2: svg(18, '<path d="M12 2l10 10-10 10L2 12z" fill="currentColor"/>'),
    wallet: svg(18, '<path d="M2 6h18a2 2 0 0 1 2 2v12H4a2 2 0 0 1-2-2z" fill="currentColor"/><path d="M2 6l14-4v4" fill="currentColor"/><circle cx="17" cy="14" r="2.200" fill="var(--ink)"/>'),
  } as Record<string, string>,
};
