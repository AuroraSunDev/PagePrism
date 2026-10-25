(() => {
  const targetSelector = __TARGET_SELECTOR__;
  const selector = (el) => {
    if (el.id) return "#" + CSS.escape(el.id);
    for (const attr of el
      .getAttributeNames()
      .filter(
        (n) => n.startsWith("data-") || ["aria-label", "title"].includes(n),
      )) {
      const value = el.getAttribute(attr);
      if (!value || value.length > 120 || /[\n\r]/.test(value)) continue;
      const q =
        el.tagName.toLowerCase() +
        "[" +
        CSS.escape(attr) +
        "=" +
        JSON.stringify(value) +
        "]";
      try {
        if (document.querySelectorAll(q).length === 1) return q;
      } catch {}
    }
    const parts = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.id) return "#" + CSS.escape(n.id) + " > " + parts.join(" > ");
      const siblings = [...n.parentElement.children].filter(
        (x) => x.tagName === n.tagName,
      );
      parts.unshift(
        n.tagName.toLowerCase() +
          ":nth-of-type(" +
          (siblings.indexOf(n) + 1) +
          ")",
      );
    }
    return "body > " + parts.join(" > ");
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect(),
      s = getComputedStyle(el);
    return (
      r.width > 1 &&
      r.height > 1 &&
      r.bottom > 0 &&
      r.top < innerHeight &&
      r.right > 0 &&
      r.left < innerWidth &&
      s.visibility !== "hidden" &&
      s.display !== "none" &&
      Number(s.opacity) > 0.02 &&
      (!el.matches("canvas") ||
        [
          [0.5, 0.5],
          [0.2, 0.2],
          [0.8, 0.8],
        ].some(
          ([x, y]) =>
            document.elementFromPoint(
              Math.max(0, Math.min(innerWidth - 1, r.x + r.width * x)),
              Math.max(0, Math.min(innerHeight - 1, r.y + r.height * y)),
            ) === el,
        ))
    );
  };
  const properties = [
    "transform",
    "translate",
    "rotate",
    "scale",
    "opacity",
    "filter",
    "fill",
    "stroke",
    "color",
    "background-color",
    "box-shadow",
    "border-color",
    "clip-path",
    "letter-spacing",
    "font-size",
  ];
  const node = (el) => {
    const r = el.getBoundingClientRect(),
      s = getComputedStyle(el);
    return {
      selector: selector(el),
      tag: el.tagName.toLowerCase(),
      children: el.children.length,
      group: el.tagName + "|" + el.getAttribute("class"),
      text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 180),
      styles: Object.fromEntries(
        properties.map((k) => [k, s.getPropertyValue(k)]),
      ),
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      timing: Object.fromEntries(
        [
          "transition-duration",
          "transition-delay",
          "transition-timing-function",
          "animation-name",
          "animation-duration",
          "animation-delay",
          "animation-timing-function",
          "animation-iteration-count",
        ].map((k) => [k, s.getPropertyValue(k)]),
      ),
    };
  };
  const all = [...document.querySelectorAll("body *")].slice(0, 5000);
  const root = targetSelector ? document.querySelector(targetSelector) : null;
  if (targetSelector && !root)
    return { nodes: [], floating: [], animations: [], missingTarget: true };
  const animatedTargets = new Set(
    document
      .getAnimations()
      .map((a) => a.effect?.target)
      .filter(Boolean),
  );
  let elements = root
    ? [root, ...root.querySelectorAll("*")].slice(0, 40)
    : all
        .filter(
          (el) =>
            visible(el) &&
            ((el.children.length === 0 && el.textContent.trim()) ||
              el.id ||
              animatedTargets.has(el) ||
              el.matches("img,canvas")),
        )
        .slice(0, 180);
  const nodes = elements.filter(visible).map(node);
  if (root && visible(root))
    for (const pseudo of ["::before", "::after"]) {
      const s = getComputedStyle(root, pseudo);
      if (s.content !== "none" && s.content !== "normal")
        nodes.push({
          ...node(root),
          selector: selector(root) + pseudo,
          text: s.content,
          timing: Object.fromEntries(
            [
              "transition-duration",
              "transition-delay",
              "transition-timing-function",
              "animation-name",
              "animation-duration",
              "animation-delay",
              "animation-timing-function",
              "animation-iteration-count",
            ].map((k) => [k, s.getPropertyValue(k)]),
          ),
          styles: Object.fromEntries(
            properties.map((k) => [k, s.getPropertyValue(k)]),
          ),
        });
    }
  const floating = all
    .filter((el) => {
      if (
        !visible(el) ||
        el.children.length ||
        !el.textContent.trim() ||
        el.textContent.trim().length > 220
      )
        return false;
      const s = getComputedStyle(el);
      return (
        el.getAttribute("role") === "tooltip" ||
        /tooltip|\btip\b|bubble|speech/.test(
          (el.id + " " + el.className).toLowerCase(),
        ) ||
        s.position === "fixed" ||
        s.position === "absolute"
      );
    })
    .map(node)
    .filter(
      (n) =>
        !root ||
        (() => {
          const r = root.getBoundingClientRect();
          return (
            n.rect.x < r.right + 360 &&
            n.rect.x + n.rect.width > r.left - 360 &&
            n.rect.y < r.bottom + 220 &&
            n.rect.y + n.rect.height > r.top - 220
          );
        })(),
    )
    .slice(0, 40);
  const animations = document
    .getAnimations()
    .filter(
      (a) =>
        a.playState === "running" &&
        a.effect &&
        a.effect.target instanceof Element &&
        visible(a.effect.target),
    )
    .slice(0, 20)
    .map((a) => {
      const effect = a.effect,
        t = effect.getTiming();
      return {
        selector: selector(effect.target),
        properties: [
          ...new Set(
            effect
              .getKeyframes()
              .flatMap((k) =>
                Object.keys(k).filter(
                  (p) =>
                    ![
                      "offset",
                      "computedOffset",
                      "easing",
                      "composite",
                    ].includes(p),
                ),
              ),
          ),
        ],
        duration: typeof t.duration === "number" ? t.duration : 0,
        iterations: Number.isFinite(t.iterations) ? t.iterations : "infinite",
        name: a.animationName || "浏览器动画",
        transformFrames: effect
          .getKeyframes()
          .map((k) => String(k.transform || k.rotate || ""))
          .filter(Boolean),
      };
    });
  return { nodes, floating, animations };
})();
