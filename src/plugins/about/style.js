export default String.raw`
.cc-about { display: flex; flex-direction: column; gap: 16px; }
.cc-about-hero { display: flex; align-items: center; gap: 16px; padding: 20px; border: 1px solid var(--settings-card-line, var(--line)); border-radius: 8px; background: var(--settings-card-bg, var(--panel)); }
.cc-about-hero img { width: 56px; height: 56px; flex: none; border-radius: 12px; }
.cc-about-hero-text { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.cc-about-name { font-size: 18px; font-weight: var(--fw-bold); line-height: 1.2; }
.cc-about-pitch { color: var(--muted); }
.cc-about-version { align-self: flex-start; padding: 2px 8px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font-size: var(--fs-small); font-variant-numeric: tabular-nums; }
.cc-about-links-title { margin: 0 0 8px; color: var(--muted); font-size: var(--fs-small); font-weight: var(--fw-medium); }
.cc-about-links { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.cc-about-link { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 1px solid var(--settings-card-line, var(--line)); border-radius: 8px; background: var(--settings-card-bg, var(--panel)); color: inherit; text-decoration: none; }
a.cc-about-link:hover { background: var(--hover); border-color: var(--primary); }
a.cc-about-link:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.cc-about-link-icon { display: grid; place-items: center; width: 36px; height: 36px; flex: none; border-radius: 8px; background: var(--hover); }
.cc-about-link-icon svg { width: 20px; height: 20px; }
.cc-about-link-text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.cc-about-link-text strong { font-weight: var(--fw-medium); }
.cc-about-link-text span { color: var(--muted); font-size: var(--fs-small); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-about-link > .cc-icon, .cc-about-link-pending { color: var(--muted); font-size: var(--fs-small); flex: none; }
`;
