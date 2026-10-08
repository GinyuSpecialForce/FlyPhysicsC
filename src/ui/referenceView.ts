/**
 * The Reference tab: the AP Physics C equation sheet and the constants table,
 * rendered from the very same data the circuits solve with and the timeline
 * cites. It cannot drift out of sync with the fly because it IS the fly's copy.
 */
import { SHEET_SECTIONS, sheetDisplays } from "../core/equation-sheet";
import { allConstants } from "../core/constant-table";
import type { Constant } from "../core/constant-table";
import { byId, esc } from "./dom";

const GROUP_TITLES: Record<Constant["group"], string> = {
  universal: "Universal constants",
  "earth-moon-sun": "Earth, the Moon and the Sun",
  planets: "Planets and moons",
  electromagnetic: "Electromagnetic constants",
  other: "Other useful values",
};

function symbolFor(key: string): string {
  return key.replace(/_/g, " ");
}

function equationsHtml(): string {
  const rows = sheetDisplays();
  return SHEET_SECTIONS.filter((s) => rows.some((r) => r.section === s))
    .map((section) => {
      const items = rows
        .filter((r) => r.section === section)
        .map((r) => {
          const vars = Object.entries(r.vars)
            .map(([k, fam]) => `${symbolFor(k)}<span class="ref-dim"> (${fam.replace("-", " ")})</span>`)
            .join(", ");
          return `<li><span class="ref-eq">${esc(r.display)}</span><span class="ref-vars">${vars}</span></li>`;
        })
        .join("");
      return `<div class="panel"><div class="panel-head"><span>${esc(section)}</span></div><ul class="ref-list">${items}</ul></div>`;
    })
    .join("");
}

function constantsHtml(): string {
  const groups: Constant["group"][] = ["universal", "earth-moon-sun", "planets", "electromagnetic", "other"];
  return groups
    .map((group) => {
      const items = allConstants()
        .filter((c) => c.group === group)
        .map(
          (c) => `<tr>
            <td><b>${esc(c.symbol)}</b></td>
            <td>${esc(c.name)}</td>
            <td class="num">${esc(c.display)}</td>
            <td class="muted small">${esc(c.derived ?? "")}</td>
          </tr>`,
        )
        .join("");
      return `<div class="panel"><div class="panel-head"><span>${esc(GROUP_TITLES[group])}</span></div>
        <div class="table-scroll"><table class="ref-table"><thead><tr><th>Symbol</th><th>Quantity</th><th>Value</th><th>How it is obtained</th></tr></thead>
        <tbody>${items}</tbody></table></div></div>`;
    })
    .join("");
}

export function renderReference(): void {
  byId("referenceContent").innerHTML = `
    <h1>Reference</h1>
    <p class="muted">The two sheets this app actually runs on. Every answer the fly gives
    names the equation it used from here, and every number it cites comes from the table below;
    the fly reads the same pages you do.</p>
    <h2>The AP Physics C equation sheet</h2>
    ${equationsHtml()}
    <h2>Constants and conversion factors</h2>
    ${constantsHtml()}`;
}
