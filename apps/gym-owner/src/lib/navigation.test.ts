import { describe, expect, it } from 'vitest';

import {
  CONSOLE_HOME,
  CONSOLE_SECTIONS,
  NAV_GROUPS,
  SECTION_HEADINGS,
  sectionFromPathname,
} from './navigation';

describe('the information architecture', () => {
  it('puts every section in exactly one nav group', () => {
    const linked = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.section));
    expect(new Set(linked)).toEqual(new Set(CONSOLE_SECTIONS));
    expect(linked).toHaveLength(CONSOLE_SECTIONS.length);
  });

  /** A href that does not match its section would light the wrong nav item. */
  it('derives every href from its section name', () => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        expect(item.href, item.section).toBe(`/${item.section}`);
      }
    }
  });

  it('gives every section but the overview a fixed heading', () => {
    for (const section of CONSOLE_SECTIONS) {
      if (section === 'overview') continue;
      expect(SECTION_HEADINGS[section]).toBeDefined();
    }
  });

  it('sends a signed-in owner to a section that exists', () => {
    expect(sectionFromPathname(CONSOLE_HOME)).toBe('overview');
  });
});

describe('sectionFromPathname', () => {
  it.each(CONSOLE_SECTIONS)('resolves /%s', (section) => {
    expect(sectionFromPathname(`/${section}`)).toBe(section);
  });

  /**
   * Matches the FIRST segment only, so a future `/members/:id` keeps "Members"
   * lit rather than lighting nothing.
   */
  it('keeps the parent section lit on a detail route', () => {
    expect(sectionFromPathname('/members/m-aarav-shah')).toBe('members');
  });

  it('tolerates a trailing slash', () => {
    expect(sectionFromPathname('/fees/')).toBe('fees');
  });

  it.each(['/', '/login', '/nope', ''])('returns null for %j', (pathname) => {
    expect(sectionFromPathname(pathname)).toBeNull();
  });
});
