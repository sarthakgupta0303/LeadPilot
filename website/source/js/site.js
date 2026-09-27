/* Site chrome: mobile nav toggle + sticky nav shadow */
(function () {
  "use strict";
  const nav = document.getElementById("siteNav");
  const burger = document.getElementById("navBurger");
  const mobile = document.getElementById("navMobile");
  if (!nav || !burger || !mobile) return;

  function closeMenu() {
    nav.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
  }
  burger.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    burger.setAttribute("aria-expanded", String(open));
  });
  mobile.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeMenu));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

  let lastY = window.scrollY;
  window.addEventListener("scroll", () => {
    nav.style.boxShadow = window.scrollY > 4 ? "0 1px 0 rgba(13,21,38,.06)" : "none";
    lastY = window.scrollY;
  }, { passive: true });
})();
