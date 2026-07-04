const express = require('express');
const router  = express.Router();
const Groq    = require('groq-sdk');

/**
 * ── Provider adapter pattern (A7) ──
 * Each adapter knows how to build a client for its own provider and how to
 * turn (systemPrompt + history) into a reply string for that provider's
 * SDK/response shape. The pool/rotation logic below only ever talks to this
 * interface, so adding a second provider later means writing a new adapter
 * object and registering it in PROVIDERS — not touching the rotation loop.
 */
const groqAdapter = {
  name: 'groq',
  createClient(apiKey) {
    // 20s timeout so a hung Groq request fails fast and rotates to the next
    // key instead of leaving the widget stuck on "typing…" forever.
    return new Groq({ apiKey, timeout: 20_000 });
  },
  async complete(client, { model, systemPrompt, history }) {
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...history],
      max_tokens: 400,
      temperature: 0.75,
    });
    return completion.choices[0]?.message?.content || '';
  },
};

// Registry of available provider adapters. Add future providers here
// (e.g. `openai: openaiAdapter`) once they're needed — see A7 note below.
const PROVIDERS = { groq: groqAdapter };

// ── Model per provider ──
// A3: `llama-3.1-8b-instant` was confirmed (console.groq.com/docs/deprecations,
// checked 2026-07-02) as deprecated by Groq on 2026-06-17, with a shutdown
// date of 2026-08-16 — it still works today but will hard-fail after that
// date. Switched proactively to Groq's recommended replacement,
// `openai/gpt-oss-20b`, rather than leaving a time bomb in main. Flagging
// this model change explicitly in the PR per the brief.
const MODELS = { groq: 'openai/gpt-oss-20b' };

/**
 * ── Key pool (A7) ──
 * Each entry: { provider, key, failCount, active }.
 *
 * IMPORTANT — scope of what's done here: this pool is currently populated
 * from env vars only (GROQ_API_KEYS comma-separated, or single
 * GROQ_API_KEY), same as the original getNextClient(), just restructured so
 * silent failover and per-key failure tracking work. It does NOT yet read
 * from or write back to the backend worker's shared key-pool store /
 * admin CRUD endpoint (their task B6) — that integration is BLOCKED
 * pending the field-name schema for that endpoint, per the brief's
 * instruction not to guess it. Once that schema is available, replace
 * `loadKeysFromEnv()` with a fetch against the backend pool, and change
 * `recordSuccess`/`recordFailure` below to also write back `failCount`/
 * `active` there instead of only in memory.
 *
 * What *is* solid today: Groq-only, multi-key, silent, cross-request
 * failover — any failure (auth error, 429, timeout, malformed response)
 * rotates to the next active key without the visitor ever seeing an error,
 * a key that fails MAX_FAILS_BEFORE_DEACTIVATE times in a row gets
 * deactivated automatically, and a user-facing error is only returned once
 * every active key in the pool has been exhausted for this request.
 */
function loadKeysFromEnv() {
  const raw = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '';
  return raw.split(',').map(k => k.trim()).filter(Boolean).map(key => ({
    provider: 'groq',
    key,
    failCount: 0,
    active: true,
  }));
}

const pool = loadKeysFromEnv();

if (pool.length === 0) {
  console.warn('⚠️   No API keys configured for any provider — chat will not work');
}

const MAX_FAILS_BEFORE_DEACTIVATE = 3;
let cursor = 0;

function activeKeys() {
  return pool.filter(k => k.active);
}

function nextKeyEntry() {
  const active = activeKeys();
  if (active.length === 0) return null;
  const entry = active[cursor % active.length];
  cursor++;
  return entry;
}

function recordSuccess(entry) {
  entry.failCount = 0;
}

function recordFailure(entry) {
  entry.failCount++;
  if (entry.failCount >= MAX_FAILS_BEFORE_DEACTIVATE) {
    entry.active = false;
    console.warn(
      `Key pool: deactivating ${entry.provider} key (…${entry.key.slice(-4)}) ` +
      `after ${entry.failCount} consecutive failures`
    );
  }
}

// ── Full SoSpark Design system prompt ──
// A4: content unchanged from the existing prompt. Founder name, the six
// services, and the pricing/redirect policy all need owner confirmation
// that they're still current — see PR notes. Not silently edited.
const SYSTEM_PROMPT = `You are Spark — the AI brand consultant and creative assistant for SoSpark Design.

## WHO YOU ARE
You represent SoSpark Design, a full-service creative agency founded and led by Soahim Rahman Tasin. You speak with creative authority, warmth, and confidence. You are not a generic chatbot — you are a knowledgeable team member of a premium design studio.

## SOSPARK DESIGN — FULL BRIEF
**Founded by:** Soahim Rahman Tasin (Founder & CEO)
**Type:** Full-service creative agency
**Philosophy:** World-class creative work isn't just about aesthetics — it's about making brands impossible to ignore.
**Availability:** Remote-ready, working with clients worldwide.

## SERVICES (know these inside out)

### 1. Graphic Design
Everything visual your brand needs: social media graphics, marketing collateral, print materials (flyers, brochures, banners, posters), digital advertising creatives, email design, infographics, pitch deck design, packaging & labels.

### 2. Branding
Full brand identity from strategy to system: brand strategy & positioning, logo design (primary + variations), typography systems, colour palettes, tone of voice documentation, brand guidelines document, iconography, pattern libraries, application mockups. We build brands that are unmistakable.

### 3. Web Design
Editorial-level interface design: UX research, wireframes, high-fidelity Figma mockups, design systems, component libraries, mobile & desktop layouts, interaction specs, WCAG AA accessibility compliance, developer-ready handoff documentation.

### 4. Web Development
Clean, performant production code: custom HTML/CSS/JS, CMS integration, e-commerce development, performance optimisation (sub-2s load target), responsive mobile-first builds, SEO-ready semantic structure, API integrations, deployment & hosting setup.

### 5. Video Editing
Cinematic editing for brands: brand films, social reels, product & explainer videos, YouTube content, ad creatives, colour grading, motion graphics & text animation, sound design & music selection, captions, multi-format export.

### 6. Page Management
Your always-on creative team: monthly content calendars, branded social graphics, caption copywriting, scheduling & publishing, story & reel templates, website content updates, monthly performance reports, dedicated account management.

## PRICING APPROACH
Pricing depends on scope and complexity. You never quote specific prices — instead say "pricing depends on scope, and we always provide a detailed quote after a brief consultation." Then encourage them to get in touch via the contact page.

## HOW TO HANDLE CONVERSATIONS

### Lead Qualification
When someone is interested in a service, ask:
1. What's the project? (brief description)
2. What's the timeline?
3. Have they worked with a design agency before?
Then direct them to contact.html to start the project.

### FAQs
- "How long does a project take?" → Depends on scope: logos 3–7 days, full branding 2–4 weeks, websites 3–8 weeks, video editing 2–5 days.
- "Do you work with small businesses?" → Absolutely. Some of our best work is with early-stage founders who need to establish a brand from scratch.
- "Can I see your work?" → Direct them to portfolio.html
- "Who runs SoSpark?" → Soahim Rahman Tasin — founder, CEO, and the creative standard the studio works to.
- "Where are you based?" → We're remote-first and work with clients worldwide.

## TONE
- Creative, confident, premium — not salesy or corporate
- Direct answers — never vague filler
- Max 3–4 sentences unless detail is genuinely needed
- End responses with a soft next step when relevant (e.g. "Want to get a quote? Head to our contact page.")

## HARD RULES
- Never invent team members beyond Soahim Rahman Tasin as founder/CEO
- Never quote specific prices
- If asked something completely off-topic from design/business, gently redirect: "I'm best placed to help with anything SoSpark Design related — what can I help you with creatively?"
- Never claim capabilities the agency doesn't have`;

router.post('/', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }

    const history = messages.slice(-16).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: String(m.content || '').slice(0, 1200),
    }));

    // A6 — case 1: no keys configured for any provider at all.
    if (pool.length === 0) {
      return res.status(503).json({
        error: 'AI service not configured',
        code: 'NOT_CONFIGURED',
      });
    }

    // A6 — case: every key in the pool has been auto-deactivated by
    // repeated failures (distinct from "never configured" above, so the
    // owner can tell them apart in logs).
    if (activeKeys().length === 0) {
      return res.status(503).json({
        error: 'AI service temporarily unavailable',
        code: 'POOL_EXHAUSTED',
      });
    }

    // A7 — try every currently-active key, silently, before giving up.
    let lastError;
    const attempts = activeKeys().length;
    for (let i = 0; i < attempts; i++) {
      const entry = nextKeyEntry();
      if (!entry) break; // pool emptied mid-loop by deactivations

      const adapter = PROVIDERS[entry.provider];
      if (!adapter) {
        recordFailure(entry);
        continue;
      }

      try {
        const client = adapter.createClient(entry.key);
        const reply = await adapter.complete(client, {
          model: MODELS[entry.provider],
          systemPrompt: SYSTEM_PROMPT,
          history,
        });
        recordSuccess(entry);
        return res.json({
          reply: reply || "I couldn't generate a response — please try again.",
        });
      } catch (err) {
        lastError = err;
        recordFailure(entry);
        // Silent rotation: auth errors, 429s, timeouts, and any other
        // failure all move on to the next key without surfacing to the
        // visitor, as long as an active key remains. Nothing to check on
        // err.status here on purpose — every failure type rotates.
        continue;
      }
    }

    // A6 — case 2/3: the whole pool failed for this request (API failure,
    // timeout, or every key currently rate-limited/exhausted).
    console.error('Chat: entire key pool failed for this request. Last error:', lastError?.message);
    return res.status(503).json({
      error: 'AI service temporarily unavailable. Try again in a moment.',
      code: 'POOL_EXHAUSTED',
    });
  } catch (err) {
    console.error('Chat route error:', err.message);
    res.status(500).json({
      error: 'AI service temporarily unavailable. Try again in a moment.',
      code: 'INTERNAL',
    });
  }
});

module.exports = router;
