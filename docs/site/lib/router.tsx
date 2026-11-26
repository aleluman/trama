import { createContext, use, useSyncExternalStore, type ReactNode } from "react";

// Hash routes: #/page or #/page/section. The guide is a static page without a server router.
const subscribe = (notify: () => void) => {
  addEventListener("hashchange", notify);
  return () => removeEventListener("hashchange", notify);
};
const readHash = () => location.hash;

export const useRoute = () => {
  const hash = useSyncExternalStore(subscribe, readHash);
  const [page = "", section] = hash.replace(/^#\/?/u, "").split("/");
  return { page, section };
};

export const PageContext = createContext("");
export const usePage = () => use(PageContext);

export const Link = ({
  to,
  section,
  children,
}: {
  to: string;
  section?: string;
  children: ReactNode;
}) => <a href={`#/${to}${section === undefined ? "" : `/${section}`}`}>{children}</a>;
