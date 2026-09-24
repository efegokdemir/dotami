import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("..", import.meta.url);

function source(path: string) {
  return readFileSync(new URL(path, root), "utf8");
}

describe("accessibility contracts for interactive map controls", () => {
  it("keeps selection state on intake chips", () => {
    expect(source("components/ui/chip.tsx")).toContain("aria-pressed={active}");
  });

  it("names map cards and exposes their selection state", () => {
    const map = source("components/cockpit/strategy-map.tsx");
    expect(map).toContain("aria-label={`${node.label}, ${chip.label}, opens detail`}");
    expect(map).toContain(
      'aria-label={`${item.typeChip}: ${item.title}, ${label}${item.fork ? ", fork" : ""}${partial ? ", partial citation" : ""}${fact ? `, ${fact}` : ""}, opens detail`}',
    );
    expect(map).toContain("aria-pressed={selected}");
  });

  it("names preview and node-detail disclosure controls", () => {
    const intake = source("components/discovery/intake-page.tsx");
    const detail = source("components/node-detail-panel.tsx");
    expect(intake).toContain("aria-expanded={expanded}");
    expect(intake).toContain("aria-label={`${expanded ? \"Hide\" : \"Show\"} details for ${item.title}`}");
    expect(detail).toContain("aria-expanded={open}");
    expect(detail).toContain("aria-label={`${open ? \"Hide\" : \"Show\"} details for ${item.title}`}");
  });
});
