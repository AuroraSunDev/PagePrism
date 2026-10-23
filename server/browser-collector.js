(() => {
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
  const properties = [
    "transform",
    "translate",
    "scale",
    "rotate",
    "opacity",
    "filter",
    "fill",
    "stroke",
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
      el.getAttribute("aria-label") ||
      el.querySelector("h1,h2,h3")?.textContent ||
      el.textContent ||
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
    const r = el.getBoundingClientRect(),
      s = getComputedStyle(el);
    return (
      r.width > 8 &&
      r.height > 8 &&
      s.display !== "none" &&
      s.visibility !== "hidden"
    );
  };
  const inView = (el) => {
    const r = el.getBoundingClientRect();
    return (
      visible(el) &&
      r.bottom > 0 &&
      r.top < innerHeight &&
      r.right > 0 &&
      r.left < innerWidth &&
      Number(getComputedStyle(el).opacity) > 0.02 &&
      !el.closest('[hidden],[inert],[aria-hidden="true"]')
    );
  };
  const reachable = (el) => {
    const r = el.getBoundingClientRect();
    return [
      [0.5, 0.5],
      [0.25, 0.65],
      [0.75, 0.65],
    ].some(([x, y]) => {
      const hit = document.elementFromPoint(
        Math.max(0, Math.min(innerWidth - 1, r.x + r.width * x)),
        Math.max(0, Math.min(innerHeight - 1, r.y + r.height * y)),
      );
      return hit === el || el.contains(hit);
    });
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
  const hoverHints = new Set();
  const scan = (rules) => {
    for (const rule of [...rules].slice(0, 2000)) {
      if (rule.cssRules) scan(rule.cssRules);
      if (rule.selectorText && /:hover|:focus-visible/.test(rule.selectorText))
        for (const part of rule.selectorText.split(",")) {
          try {
            document
              .querySelectorAll(part.split(/:(?:hover|focus-visible)/)[0])
              .forEach((el) => hoverHints.add(el));
          } catch {}
        }
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      scan(sheet.cssRules);
    } catch {}
  }
  const candidates = [
    ...new Set([
      ...document.querySelectorAll(
        'a,button,[role="button"],[tabindex]:not([tabindex="-1"]),article',
      ),
      ...hoverHints,
      ...elements.filter((el) => getComputedStyle(el).cursor === "pointer"),
    ]),
  ].filter((el) => inView(el) && reachable(el));
  const score = (el) =>
    (hoverHints.has(el) ? 40 : 0) +
    (el.hasAttribute("tabindex") ? 20 : 0) +
    (el.querySelector("img,svg,canvas") ? 20 : 0);
  const groups = new Set();
  const targets = candidates
    .sort((a, b) => score(b) - score(a))
    .filter((el) => {
      if (
        candidates.some(
          (parent) =>
            parent !== el &&
            parent.contains(el) &&
            score(parent) >= score(el) &&
            parent.getBoundingClientRect().height < innerHeight * 0.9,
        )
      )
        return false;
      const key = el.tagName + "|" + el.getAttribute("class");
      if (groups.has(key)) return false;
      groups.add(key);
      return true;
    })
    .slice(0, 8)
    .map((el) => ({
      ...sample(el),
      group: el.tagName + "|" + el.getAttribute("class"),
    }));
  const forbidden =
    /login|log.?out|sign.?in|sign.?up|register|subscribe|purchase|buy|pay|submit|delete|remove|accept|agree|download|install|connect|close|dismiss|登录|注册|订阅|购买|支付|提交|删除|同意/i;
  const controls = [
    ...document.querySelectorAll(
      'button,[role="button"],a[href],input[type="submit"],input[type="button"]',
    ),
  ].filter((el) => inView(el) && reachable(el));
  const buttons = controls.filter(
    (el) =>
      el.tagName === "BUTTON" &&
      !el.form &&
      !el.hasAttribute("formaction") &&
      !el.hasAttribute("disabled") &&
      !forbidden.test(
        [
          el.textContent,
          el.getAttribute("aria-label"),
          el.getAttribute("title"),
          el.getAttribute("name"),
        ].join(" "),
      ),
  );
  const entryTargets = buttons
    .filter((el) => {
      for (
        let n = el.parentElement;
        n && n !== document.body;
        n = n.parentElement
      ) {
        const r = n.getBoundingClientRect(),
          s = getComputedStyle(n);
        if (
          r.width * r.height >= innerWidth * innerHeight * 0.8 &&
          /fixed|absolute/.test(s.position) &&
          Number(s.zIndex) > 0
        ) {
          const context = [
            n.innerText,
            n.getAttribute("aria-label"),
            ...["aria-labelledby", "aria-describedby"].flatMap((attr) =>
              (n.getAttribute(attr) || "")
                .split(/\s+/)
                .map((id) => document.getElementById(id)?.textContent || ""),
            ),
          ].join(" ");
          if (
            n.matches('dialog,[role="dialog"],[role="alertdialog"]') ||
            n.querySelector(
              'form,input,textarea,select,[contenteditable="true"]',
            ) ||
            /\b(?:terms|consent|privacy|cookies?|policy|agreement|checkout|payment|account)\b|条款|隐私|协议|支付|注册|登录/.test(
              context.toLowerCase(),
            )
          )
            return false;
          return controls.filter((b) => n.contains(b)).length === 1;
        }
      }
      return false;
    })
    .slice(0, 1)
    .map(sample);
  const scrollContainers = elements
    .filter((el) => {
      const s = getComputedStyle(el);
      return (
        inView(el) &&
        reachable(el) &&
        /auto|scroll/.test(s.overflowY) &&
        el.clientHeight > 120 &&
        el.scrollHeight > el.clientHeight + 50
      );
    })
    .slice(0, 2)
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
    .slice(0, 12)
    .map((el) => ({
      ...sample(el),
      group: el.tagName + "|" + el.getAttribute("class"),
    }));
  const heading = document.querySelector("h1"),
    body = getComputedStyle(document.body);
  return {
    title: document.title.slice(0, 180),
    heading: (heading?.textContent || document.title).trim().slice(0, 180),
    font: body.fontFamily,
    headingSize: heading ? getComputedStyle(heading).fontSize : body.fontSize,
    background: body.backgroundColor,
    color: body.color,
    layouts,
    targets,
    entryTargets,
    scrollContainers,
    revealTargets,
    height: document.documentElement.scrollHeight,
  };
})();
