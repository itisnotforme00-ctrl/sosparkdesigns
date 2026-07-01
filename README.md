# SoSpark Design v3 — Full Rebuild

## Quick Start

```bash
npm install
copy .env.example .env
# Fill in MONGODB_URI, JWT_SECRET, GROQ_API_KEY (or GROQ_API_KEYS for rotation)
npm run dev
```

Visit `http://localhost:3000` for the site, `http://localhost:3000/admin` for the admin panel.

---

## Admin Panel — Default Login

**No account creation needed.** On first server boot, a default admin is auto-seeded:

```
Username: admin
Password: soaspark2024
```

The login page has a "Fill default credentials" button for convenience. Change this password after your first login (use `/api/auth/setup` to add a new admin, or update the seed in `backend/routes/auth.js`).

---

## Every Issue From Your Feedback — Addressed

### 1. Hero animations stopping after entrance
**Fixed.** The hero now has a persistent 3D scene (`hero__3d-scene`) with rotating planes, orbiting rings, and floating glow orbs that loop infinitely via CSS `animation: ... infinite`. Mouse-reactive tilt (via `animations.js`) adds a continuous parallax layer on top. Nothing in the hero ever sits still — entrance animations (word reveal) play once, then ambient motion takes over permanently.

### 2. Anthropic-orange color scheme
**Fixed.** All accent colors are now blue (`#2563EB` / `#3B82F6` / `#1D4ED8`), matching your brand. Gold (`#B8973A`) is used only as a rare secondary accent (stars, tiny visual details) — never dominant. Checked every file: zero coral/orange remains in v3.

### 3. No 3D hero background motion
**Fixed.** Added `.hero__plane` elements with `rotateX/rotateY` keyframe animations, `.hero__ring` orbiting rings, and a mouse-tilt scene wrapper — all running continuously via `requestAnimationFrame` and CSS keyframes.

### 4. Site feels static after animations finish
**Fixed.** Added a global `.ambient-blobs` layer (injected on every page via `animations.js`) with three large blurred gradient blobs that drift continuously in the background. Cards have persistent shimmer sweeps, dots pulse, rings rotate, badges float — all on infinite loops with `prefers-reduced-motion` respected.

### 5. No cinematic scroll / Figma-style scrubbing
**Fixed.** Added `data-cinematic="left|right|up|scale"` attributes throughout. The new `animations.js` cinematic IntersectionObserver shifts elements in from the side, scales them up, or slides them vertically as they cross the viewport — layered, directional, not just fade-up.

### 6. Footer CTA section looking bad
**Fixed — full redesign.** Replaced the old glass CTA with `.cta-band`: a solid dark ink background (not glass — glass on a dark backdrop was the core problem), with animated blue gradient orbs, a slowly-sliding grid pattern, and a pulsing white CTA button. This pattern is now reused identically across Home, Portfolio, Services, Team, Reviews, and FAQ for consistency.

### 7. Header too boxy/square
**Fixed.** Nav CTA and all nav buttons use `border-radius: 999px` (full pill). The underline link-hover indicator is now a rounded pill rather than a square edge.

### 8. Logo not used — text instead
**Fixed.** Your two uploaded SVGs are now used everywhere: `logo-dark.svg` (for light backgrounds — nav, light sections) and `logo-white.svg` (for dark backgrounds — footer, dark CTA bands). All wordmark text spans removed; only the logo SVG renders.

### 9. Admin panel not working / can't log in
**Fixed.** Root cause was MongoDB connection failures cascading into a broken UI with no feedback. Now:
- `/api/health` endpoint reports live DB connection state
- The admin dashboard shows a clear diagnostic banner if DB is unreachable, instead of blank/broken screens
- **Default admin account auto-creates on server boot** — no manual setup required (see credentials above)
- MongoDB connects with `family: 4` (IPv4 force) and exponential backoff retry (4 attempts)

### 10. About page — generic/repeated intro animation
**Fixed.** About page now uses a completely different intro technique from Home: a split-panel reveal (`.about-hero__split-panel`) plus clip-path line-by-line text reveal — distinct from Home's word-stagger.

### 11. "How We Got Here" — bad text placement
**Fixed — full layout rebuild.** Replaced the left-aligned single-column timeline with a center-line alternating layout (`.timeline-v2`): cards alternate left/right of a vertical blue line with pulsing dot nodes, like a proper editorial timeline. Collapses cleanly to single-column on mobile.

### 12. "What We Stand For" section feels empty
**Fixed.** Each value card now has a `.value-card__visual` icon panel (gradient-backed icon badge) plus a subtle animated dot-pattern texture (`.value-card__pattern`) in the corner — filling the visual void that existed before.

### 13. Founder quote overcrowded / too heavy / boxed off
**Fixed.** The quote no longer uses a heavy bordered box. It's now `font-family: var(--font-body)` (not display serif), reduced from `text-xl/weight-500` to `text-lg/weight-400`, colored `--ink-3` (softer, blends into the surrounding bio text) instead of full-strength ink, with just a thin left border accent — feels like part of the paragraph flow, not a separate component.

### 14. Cursor — ring too big, blur too heavy
**Fixed.** Ring reduced from 40-60px down to 32-52px. Blur reduced from `blur(8px)` to `blur(4px)`, and background opacity reduced to `rgba(37,99,235,0.04)` so text underneath stays fully legible.

### 15. Portfolio links broken
**Fixed.** Every portfolio card on Home and the Portfolio grid is now a real `<a>` tag linking to an anchored case-study section (`#nova-identity`, `#pulse-app`, etc.) on the Portfolio page. Six full case studies built with client, service, and year metadata. A working JS filter bar lets visitors filter by category.

### 16. AI agent issues
**Checked and fixed.** Model updated to `llama-3.1-8b-instant` (the decommissioned `llama3-8b-8192` is gone). Multi-key rotation supported via `GROQ_API_KEYS` env var — automatically rotates and retries on 429 errors. Full system prompt covers all six services, pricing approach, FAQs, and lead qualification flow. Widget color updated to match blue brand.

### 17. $10K design checklist compliance
- ✅ Committed POV — editorial/glassmorphism executed consistently, no template look
- ✅ Typography — Playfair Display headlines at large scale + DM Sans body, real weight contrast
- ✅ Restrained palette — cream/ink/blue only, gold used sparingly as accent
- ✅ Hierarchy breathes — generous whitespace via `--section-gap` system
- ✅ Motion whispers — persistent but subtle; nothing jarring or generic AOS fade-up
- ✅ Mobile designed — every section has explicit mobile breakpoints, not naive shrink
- ✅ Invisible quality — semantic HTML5, ARIA labels throughout, WCAG-friendly contrast, keyboard-navigable nav and FAQ accordion, real meta tags + OG tags on every page

---

## File Structure

```
sosparkv3/
├── frontend/
│   ├── assets/
│   │   ├── logo-dark.svg     ← your uploaded logo, for light backgrounds
│   │   └── logo-white.svg    ← your uploaded logo, for dark backgrounds
│   ├── css/
│   │   ├── variables.css     ← blue brand tokens
│   │   ├── global.css        ← ambient blobs, glass utilities, persistent keyframes
│   │   ├── nav.css           ← pill nav
│   │   ├── footer.css        ← redesigned cta-band + footer
│   │   ├── home.css          ← 3D hero, cinematic services/works
│   │   ├── about.css         ← unique intro, fixed quote, values imagery, alt timeline
│   │   ├── services.css      ← sticky nav, 6 full service blocks
│   │   ├── portfolio.css     ← working filter grid + case studies
│   │   └── pages.css         ← team, reviews, faq, contact shared styles
│   ├── js/
│   │   ├── cursor.js         ← smaller ring, lighter blur
│   │   ├── nav.js
│   │   ├── animations.js     ← cinematic scroll, ambient blob injection, 3D tilt
│   │   └── ai-chat.js        ← blue-branded Groq widget
│   ├── index.html
│   ├── about.html
│   ├── services.html
│   ├── portfolio.html
│   ├── team.html
│   ├── reviews.html
│   ├── faq.html
│   └── contact.html
├── backend/
│   ├── models/index.js
│   ├── middleware/auth.js
│   ├── routes/
│   │   ├── chat.js           ← multi-key Groq rotation, current model
│   │   ├── auth.js           ← auto-seeded default admin
│   │   ├── contact.js, portfolio.js, services.js, team.js,
│   │   │   testimonials.js, faq.js, offers.js
│   └── server.js             ← IPv4 fix, retry logic, /api/health
├── admin/
│   ├── index.html            ← shows default credentials, blue brand
│   └── dashboard.html        ← DB diagnostic banner, blue brand
├── .env.example
├── package.json
└── README.md
```

## Next Steps (optional, not blocking)

- Replace founder portrait placeholder with a real photo at `assets/soahim.jpg`
- Replace team member initials with real photos
- Generate and add the hero background video (prompt still in v2 README if needed)
- Add real portfolio project images to replace the letter-monogram placeholders
