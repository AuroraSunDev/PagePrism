(() => {
  const selector = (element) => {
    if (element.id) return `#${CSS.escape(element.id)}`;
    const parts = [];
    for (
      let node = element;
      node && node !== document.body;
      node = node.parentElement
    ) {
      const tag = node.tagName.toLowerCase();
      const siblings = node.parentElement
        ? [...node.parentElement.children].filter(
            (x) => x.tagName === node.tagName,
          )
        : [];
      parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(node) + 1})`);
    }
    return "body > " + parts.join(" > ");
  };
  const properties = [
    "transform",
    "opacity",
    "box-shadow",
    "border-color",
    "background-color",
    "color",
    "transition-duration",
    "transition-timing-function",
    "animation-name",
    "animation-duration",
  ];
  const sample = (el) => ({
    selector: selector(el),
    tag: el.tagName.toLowerCase(),
    label: (
      el.querySelector("h1,h2,h3")?.textContent ||
      el.textContent ||
      el.getAttribute("aria-label") ||
      el.tagName
    )
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 100),
    styles: Object.fromEntries(
      properties.map((prop) => [
        prop,
        getComputedStyle(el).getPropertyValue(prop),
      ]),
    ),
  });
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return (
      r.width > 60 &&
      r.height > 20 &&
      s.display !== "none" &&
      s.visibility !== "hidden"
    );
  };
  const elements = [
    ...document.querySelectorAll("main,section,header,article,div"),
  ]
    .slice(0, 2500)
    .filter(visible);
  const layouts = elements
    .filter((el) => ["grid", "flex"].includes(getComputedStyle(el).display))
    .slice(0, 12)
    .map((el) => {
      const s = getComputedStyle(el);
      return {
        selector: selector(el),
        display: s.display,
        columns: s.gridTemplateColumns,
        gap: s.gap,
        label: (
          el.getAttribute("aria-label") ||
          el.querySelector("h2")?.textContent ||
          el.tagName
        )
          .trim()
          .slice(0, 80),
      };
    });
  const targets = [
    ...document.querySelectorAll('a,button,[role="button"],article'),
  ]
    .filter(visible)
    .sort(
      (a, b) =>
        Number(!!b.querySelector("img")) - Number(!!a.querySelector("img")),
    )
    .slice(0, 3)
    .map(sample);
  const revealTargets = elements
    .filter((el) => {
      const s = getComputedStyle(el);
      return (
        Number(s.opacity) < 0.99 ||
        ((el.className || "").toString().match(/reveal|animate/) &&
          s.transitionDuration !== "0s")
      );
    })
    .slice(0, 8)
    .map(sample);
  const heading = document.querySelector("h1");
  const body = getComputedStyle(document.body);
  return {
    title: document.title.slice(0, 180),
    heading: (heading?.textContent || document.title).trim().slice(0, 180),
    font: body.fontFamily,
    headingSize: heading ? getComputedStyle(heading).fontSize : body.fontSize,
    background: body.backgroundColor,
    color: body.color,
    layouts,
    targets,
    revealTargets,
    height: document.documentElement.scrollHeight,
  };
})();
