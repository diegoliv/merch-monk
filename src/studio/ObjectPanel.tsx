import { useMemo, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";

type ObjectPanelProps = {
  objects: string[];
  visibleNames: string[];
  activeName: string | null;
  onToggle: (name: string) => void;
  onActivate: (name: string) => void;
};

function objectLabel(name: string) {
  return name
    .replace(/_bones$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\bumbrela\b/gi, "umbrella")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
export function ObjectPanel({
  objects,
  visibleNames,
  activeName,
  onToggle,
  onActivate,
}: ObjectPanelProps) {
  const [query, setQuery] = useState("");
  const visibleObjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return objects;
    return objects.filter((name) => objectLabel(name).toLowerCase().includes(normalized));
  }, [objects, query]);

  return (
    <aside className="studio-panel studio-object-panel" aria-label="Studio objects">
      <div className="studio-panel-heading">
        <span>Objects</span>
        <span className="studio-count">{visibleNames.length}/{objects.length}</span>
      </div>
      <label className="studio-search">
        <MagnifyingGlass size={15} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search objects"
          aria-label="Search objects"
        />
      </label>
      <div className="studio-object-list">
        {visibleObjects.map((name) => {
          const label = objectLabel(name);
          const isVisible = visibleNames.includes(name);
          const isActive = name === activeName;
          return (
            <div
              key={name}
              className={[
                "studio-object-row",
                isVisible ? "is-visible" : "",
                isActive ? "is-active" : "",
              ].filter(Boolean).join(" ")}
            >
              <input
                type="checkbox"
                checked={isVisible}
                onChange={() => onToggle(name)}
                aria-label={"Show " + label}
              />
              <button
                type="button"
                onClick={() => onActivate(name)}
                aria-current={isActive ? "true" : undefined}
              >
                {label}
              </button>
            </div>
          );
        })}
        {visibleObjects.length === 0 ? (
          <p className="studio-empty-state">No matching objects</p>
        ) : null}
      </div>
    </aside>
  );
}
