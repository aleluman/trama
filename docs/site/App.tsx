import { useEffect, useState, type ComponentType } from "react";
import { PageContext, useRoute } from "./lib/router";
import { Api } from "./pages/Api";
import { CompleteExample } from "./pages/CompleteExample";
import { Context } from "./pages/Context";
import { Errors } from "./pages/Errors";
import { Events } from "./pages/Events";
import { FieldState } from "./pages/FieldState";
import { Fields } from "./pages/Fields";
import { Formulas } from "./pages/Formulas";
import { Introduction } from "./pages/Introduction";
import { Outputs } from "./pages/Outputs";
import { Limits } from "./pages/Limits";
import { Validation } from "./pages/Validation";
import { Dirty } from "./pages/Dirty";
import { Queries } from "./pages/Queries";
import { Query } from "./pages/Query";
import { ReactBinding } from "./pages/ReactBinding";
import { Relations } from "./pages/Relations";
import { RemoteSelection } from "./pages/RemoteSelection";
import { Rows } from "./pages/Rows";
import { RowsAsync } from "./pages/RowsAsync";
import { RuleSets } from "./pages/RuleSets";
import { Sessions } from "./pages/Sessions";
import { Submitting } from "./pages/Submitting";
import { Subtypes } from "./pages/Subtypes";

type Page = { id: string; title: string; group: string; Content: ComponentType };

const pages: readonly Page[] = [
  { id: "", title: "Introduction", group: "Get started", Content: Introduction },
  { id: "fields", title: "Fields", group: "Guide", Content: Fields },
  { id: "sessions", title: "Sessions", group: "Guide", Content: Sessions },
  { id: "react", title: "React", group: "Guide", Content: ReactBinding },
  { id: "query", title: "Loading with TanStack Query", group: "Guide", Content: Query },
  { id: "formulas", title: "Value formulas", group: "Guide", Content: Formulas },
  { id: "events", title: "Events", group: "Guide", Content: Events },
  { id: "relations", title: "Relations", group: "Guide", Content: Relations },
  { id: "field-state", title: "Field state", group: "Guide", Content: FieldState },
  { id: "decimals-and-limits", title: "Decimals and limits", group: "Guide", Content: Limits },
  { id: "validation", title: "Validation", group: "Guide", Content: Validation },
  { id: "changes", title: "Changes", group: "Guide", Content: Dirty },
  { id: "submission", title: "Submission", group: "Guide", Content: Submitting },
  { id: "remote-select", title: "Remote select", group: "Guide", Content: RemoteSelection },
  { id: "subtypes", title: "Subtypes", group: "Guide", Content: Subtypes },
  { id: "outputs", title: "Derived outputs", group: "Guide", Content: Outputs },
  { id: "context", title: "Context", group: "Guide", Content: Context },
  { id: "queries", title: "Queries", group: "Guide", Content: Queries },
  { id: "rows", title: "Rows", group: "Guide", Content: Rows },
  { id: "async-in-rows", title: "Async in rows", group: "Guide", Content: RowsAsync },
  { id: "rule-sets", title: "Rule sets", group: "Guide", Content: RuleSets },
  {
    id: "complete-example",
    title: "Complete example",
    group: "Examples",
    Content: CompleteExample,
  },
  { id: "api", title: "API", group: "Reference", Content: Api },
  { id: "errors", title: "Errors and limits", group: "Reference", Content: Errors },
];
const groups = [...new Set(pages.map((page) => page.group))];

export const App = () => {
  const route = useRoute();
  const index = Math.max(
    0,
    pages.findIndex((page) => page.id === route.page),
  );
  const current = pages[index] ?? pages[0];
  const previous = pages[index - 1];
  const next = pages[index + 1];
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.title = current === undefined ? "Trama" : `${current.title} · Trama`;
    const target =
      route.section === undefined ? null : document.querySelector(`#${CSS.escape(route.section)}`);
    if (target) target.scrollIntoView();
    else scrollTo(0, 0);
  }, [current, route.section]);

  if (current === undefined) return null;
  return (
    <div className="layout">
      <aside className={menuOpen ? "sidebar open" : "sidebar"}>
        <div className="sidebar-top">
          <a className="brand" href="#/">
            Trama <span>{`guide · ${import.meta.env.TRAMA_VERSION}`}</span>
          </a>
          <button
            type="button"
            className="menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="guide-nav"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? "Close" : "Contents"}
          </button>
        </div>
        <nav id="guide-nav" aria-label="Guide">
          {groups.map((group) => (
            <div key={group}>
              <p className="nav-group">{group}</p>
              {pages
                .filter((page) => page.group === group)
                .map((page) => (
                  <a
                    key={page.id}
                    href={`#/${page.id}`}
                    aria-current={page === current ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                  >
                    {page.title}
                  </a>
                ))}
            </div>
          ))}
        </nav>
        <ThemePicker />
      </aside>
      <main className="content">
        <PageContext value={current.id}>
          <current.Content />
        </PageContext>
        <nav className="pager" aria-label="Pages">
          {previous ? <a href={`#/${previous.id}`}>← {previous.title}</a> : <span />}
          {next && <a href={`#/${next.id}`}>{next.title} →</a>}
        </nav>
      </main>
    </div>
  );
};

const ThemePicker = () => (
  <label className="theme-picker">
    Theme
    <select
      defaultValue="light dark"
      onChange={(event) => {
        document.documentElement.style.colorScheme = event.currentTarget.value;
      }}
    >
      <option value="light dark">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </label>
);
