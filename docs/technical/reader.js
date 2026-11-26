const tocButton = document.querySelector("#toc-toggle");
const setMenuOpen = (open) => {
  tocButton.setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("toc-open", open);
};

tocButton.addEventListener("click", () => {
  setMenuOpen(tocButton.getAttribute("aria-expanded") !== "true");
});
document.querySelectorAll(".sidebar a").forEach((link) => {
  link.addEventListener("click", () => {
    if (matchMedia("(max-width:730px)").matches) setMenuOpen(false);
  });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.body.classList.contains("toc-open")) {
    setMenuOpen(false);
    tocButton.focus();
  }
});
document.querySelector("#print").addEventListener("click", () => window.print());

const links = [...document.querySelectorAll(".sidebar nav a")];
const sections = [...document.querySelectorAll(".chapter")];
let queued = false;
const update = () => {
  const current = sections.findLast((section) => section.getBoundingClientRect().top <= 90);
  for (const link of links) {
    if (current && link.hash === `#${current.id}`) {
      link.setAttribute("aria-current", "location");
    } else {
      link.removeAttribute("aria-current");
    }
  }
};
addEventListener(
  "scroll",
  () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      update();
      queued = false;
    });
  },
  { passive: true },
);
update();
