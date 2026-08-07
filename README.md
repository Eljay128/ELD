# Stride — equine gait screening

Upload up to three views of a horse in motion — **front** (toward the camera), **rear** (away) and
**side** (lateral pass). Stride samples frames from each, reads the gait against the way
veterinarians actually localise lameness, checks its reading against current published sources, and
returns:

- an estimated **AAEP lameness grade** and which limb(s) are implicated, with the visual evidence
- a **ranked differential** — most likely and most common first, down to least likely — each entry
  carrying both supporting *and* contradicting evidence
- **remedies** for each candidate: what to do today, veterinary options to raise, farriery changes,
  rehab exercises, expected timeline and prognosis
- a phased **conditioning plan** to rebuild the horse toward a full, free stride
- a checklist to take to the vet

> **This is a screening aid, not a diagnosis.** It reads still frames. It cannot palpate, feel a
> digital pulse, use hoof testers, flex a joint or run a nerve block — the things that actually
> confirm a lameness. Visual assessment also misses asymmetry below roughly 25%, so a genuinely
> subtle lameness can be invisible on video. Anything sudden, severe or worsening needs a vet.

---

## Setup

Requires Node 20+. No system ffmpeg needed — the binaries ship with the dependencies.

```bash
npm install
cp .env.example .env      # then add your ANTHROPIC_API_KEY
npm run doctor            # verifies the key, the model, ffmpeg and the schema
npm start
```

Open <http://localhost:3000>.

Get an API key at <https://console.anthropic.com/settings/keys>.

### Preflight

`npm run doctor` checks everything the app needs *before* you upload anything — Node version, key
present and accepted, `claude-opus-5` reachable, the web-search tool available, the ffmpeg and
ffprobe binaries, the knowledge base, and the report schema. It exits non-zero on failure, so it
works as a CI gate too.

Point it at real footage to exercise frame extraction as well:

```bash
npm run doctor -- ./my-horse-clip.mp4
```

A passing run ends with the frame count, clip duration, resolution and payload size — which is the
quickest way to confirm a given clip is usable before spending a full analysis on it.

### Standalone single-file build

There is a second way to run this with no server at all:

```bash
npm run build:standalone     # writes standalone/stride.html
```

Open that file in a browser — double-click it, no localhost, no Node running. It asks for your API
key, then does everything the server does *in the tab*: frame extraction with `<video>` and a
canvas, motion profiling with pixel diffs, and the same two calls straight to `api.anthropic.com`.

It is genuinely one file. The build inlines the stylesheet, the knowledge base, both system prompts
and the report schema by importing them from `src/`, so the standalone cannot drift from the served
version — the prompts and schema are the same objects, not a copy.

Trade-offs against `npm start`:

| | Server | Standalone file |
| --- | --- | --- |
| Setup | `npm install`, `.env`, `npm start` | open the file |
| Where the key lives | `.env` on the server | `sessionStorage` in the tab, gone when it closes |
| Where the video goes | uploaded, then deleted | never leaves the machine — read locally by the browser |
| Video decoding | ffmpeg, any codec | the browser's decoder (Safari and Chrome read iPhone HEVC; Firefox does not) |

Because the key sits in the page, treat the standalone as a **personal** tool: don't host it on a
shared server and don't hand the file to anyone with a key saved in it.

**Hosted copy.** The same build is published by GitHub Pages from `docs/` on this branch:

<https://eljay128.github.io/ELD/>

`npm run build:standalone` writes both `standalone/stride.html` and `docs/index.html` from one build,
so committing a rebuild is what updates the hosted page — there is no separate deploy step. Pages is
configured as *Deploy from a branch* → `/docs`. Note that a Pages site is publicly reachable even
when the repository is private, so nothing secret can ever be baked into the page; the API key is
entered at runtime and kept in `sessionStorage` only.

**On a phone.** The run takes eight minutes or more inside the tab, so the page holds a screen wake
lock for the duration and warns before a navigation that would discard the work. Two caveats:

- **Android** opens the local file directly in Chrome and it works.
- **iOS will not run it from a local file at all.** Safari cannot open `file://` HTML, and the Files
  app preview renders the page but does not execute JavaScript, so the app appears dead. On an
  iPhone the file has to be served over http(s) — either from a web host, or from `npm start` on a
  computer on the same network, which is the better option anyway because ffmpeg then handles the
  codec and the key stays on the computer.

### Configuration

All optional, set in `.env`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — | **Required.** |
| `PORT` | `3000` | HTTP port. |
| `MAX_UPLOAD_MB` | `250` | Upload size cap. |
| `FRAME_BUDGET` | `36` | Total frames across all views in one case (clamped 6–60). Divided between the views supplied, so three views cost about the same as one. |
| `FRAME_COUNT` | `18` | Frames sampled per video (clamped 6–24). More frames resolve the stride cycle better and cost more. |
| `BURST_COUNT` | `3` | How many dense bursts those frames are split across (clamped 1–5). See Sampling below. |
| `WEB_RESEARCH` | `true` | Set `false` to skip the live research pass — faster and cheaper, slightly less current. |

---

## How it works

```
video ──▶ ffmpeg samples N frames as dense bursts (see Sampling below)
             │
             ▼
     Pass 1 · observation + research      (claude-opus-5, vision + web_search)
       reads head/neck excursion, pelvic symmetry, stride length, foot flight,
       landing pattern, hoof-pastern axis, muscle symmetry; applies the
       laterality rules; then searches published sources to check its reading
             │
             ▼
     Pass 2a · assessment                 (claude-opus-5, JSON schema)
       emergency status, per-view contribution, footage quality, gait
       assessment, ranked differential with remedies
             │
             ▼
     Pass 2b · plan                       (claude-opus-5, JSON schema)
       conditioning plan, vet checklist and limitations, written with
       the finished differential in hand
             │
             ▼
     browser  (progress streamed over SSE)
```

**Why the observation pass is separate.** One call juggling server-side web search *and* a rigid
output schema is much more likely to come back malformed or truncated. Splitting them keeps the JSON
reliable and lets the observation pass reason freely and search as much as it needs.

**Why the report itself is two calls.** The API compiles an output schema into a grammar and rejects
one that grows too large. The full report is over that ceiling — measured, not guessed: the schema
minus one field compiles, and adding as few as four trivial string fields fails. Adding
`viewsAnalyzed` for three-view support was exactly what tipped it over, and it failed with
`The compiled grammar is too large`.

Splitting the report into an assessment schema and a plan schema puts both comfortably inside the
limit, and it improves the output: pass 2b receives the finished assessment, so the rehab plan is
written against the actual ranked differential instead of being generated alongside it.

`npm run doctor` now sends both schemas to the API and checks they compile, because that ceiling is
not expressible as a field count and a single added field can cross it.

**Why frames rather than the video file.** The Messages API takes images, not video.

### Sampling — why bursts, not an even spread

This is the least obvious design decision in the project, and it was forced by a live run.

The laterality rules need you to see *which limb is grounded at each extreme of head or pelvic
movement*. That only works if consecutive frames are consecutive stride phases. Spreading 14 frames
evenly across an 11-second clip puts them **0.79s apart** — and a trot stride cycle is roughly
**0.6–0.85s**. The sampling interval and the signal period were nearly identical, so frames landed
at effectively arbitrary points in the stride and the head-nod rule became unusable.

That is exactly what happened on the first real run: the model correctly refused to call laterality
and named the aliasing as the reason. Mock data could never have surfaced it, because mock data has
no stride cycle.

Frames are now captured as **3 separated bursts**, each dense enough to track the head through a
full stride. The prompt tells the model which frames are burst-adjacent and which are not, so it
knows what it may compare directly.

Two further refinements came out of later live runs on real footage:

**Burst span is keyed to gait.** A trot cycle is 0.6–0.85s but a *walk* cycle is 1.1–1.3s, so the
original flat 0.8s span could never contain a complete walk stride — a run on a walk-only clip said
exactly that. Span is now 0.85s for trot, 1.45s for walk, 0.95s for canter, and 1.15s when the gait
is unknown (long enough for a walk, still usable for a trot).

**Bursts are placed where the clip is actually moving.** Fixed intervals land on whatever happens to
be there. On one trot-up that meant burst 1 on a turn and burst 3 on the walk-down, leaving one of
three bursts on usable trot — again, the model reported it. `src/motion.js` now profiles the clip
(mean frame-to-frame difference, 10fps at 64×36 greyscale — cheap) and scores candidate windows by
`mean − standard deviation`, so it prefers sustained movement and avoids windows straddling a
transition. Measured against the previous even spacing on real clips, this captures 28–48% more
motion energy.

Bursts are also required to stay *separated*, not merely non-overlapping: three adjacent bursts are
really one long burst, and the value of separate bursts is that a phase relationship confirmed at
t=3s and again at t=9s is independent evidence. Separation relaxes only when a clip is too short or
too briefly active to support it, and the whole profiler degrades to even spacing if it fails.

Tune with `FRAME_COUNT` and `BURST_COUNT`. More bursts sample more of the clip; more frames per
burst resolve the stride more finely.

The first and last 5% of the clip is skipped: in a hand-held video that is usually the handler
still setting up or the horse already halted.

### Validation

The sampling change above was driven by, and then confirmed by, a ground-truth test. A synthetic
trotting horse was rendered with a *known* injected lameness — the head lifts as the left fore
loads — and put through the full pipeline three times:

| | Run 1 — even sampling | Run 2 — bursts | Run 3 — bursts + distinguishable limbs |
| --- | --- | --- | --- |
| Head nod | **not detected**, dismissed as camera pan | **detected**, "stride-locked" | detected |
| Stride period | not measurable | **0.64s** (true 0.690s) | measured |
| Laterality | undetermined (low conf.) | undetermined (high conf.) | **left fore — correct** |
| Footage rated | poor | fair | fair |

Run 1 is why bursts exist: the model correctly refused to call a limb and named the aliasing as the
reason. Run 2 recovered the nod and measured the stride period to within 7%. Run 3 additionally made
the near and far limbs visually separable — a flaw in the test stimulus, not the app — and the
pipeline then applied the "down on sound" rule to the correct limb, while flagging on its own that
the call inverts if the near/far assignment is wrong.

**What this does and does not establish.** It validates the sampling and the laterality reasoning
chain end to end. It says nothing about clinical accuracy: a rendered silhouette with an
exaggerated head-lift is not a lame horse. Real footage remains the only test of whether the
differential itself is any good.

### The three views

Each view answers different questions, and they are not interchangeable:

| View | What it is for |
| --- | --- |
| **Front** — toward the camera | The **head nod** — the key forelimb sign. Also medio-lateral limb deviation (winging, paddling, plaiting). |
| **Rear** — away from the camera | The **hip hike** / sacral rise — the key hindlimb sign. Also hindlimb tracking and base width. |
| **Side** — lateral pass | Stride length, overtrack, cranial vs caudal phase, foot flight arc, landing pattern, hoof-pastern axis, and **withers movement**. |

The single most valuable cross-view inference is withers movement from the side against the head nod
from the front: in a genuine forelimb lameness the withers asymmetry tracks with the head nod, while
in hindlimb-induced compensation it shifts to the opposite side. That distinction decided a real run
that could not be resolved from one view alone, and it needs two views to make.

One view is enough to run. Three is much better, and the report says per view what each contributed
and what each missing view would have resolved. The frame budget is shared across views
(`FRAME_BUDGET`, default 36), so three views cost roughly what one does.

### Grounding

`src/knowledge.js` is a reference library handed to the model in the system prompt: the AAEP 0–5
scale, the laterality rules (head nod, hip hike, bilateral masking, compensatory patterns), red
flags, and 18 conditions with prevalence, signalment, video-visible gait signs, confirmatory
diagnostics and remedies. It exists so the differential is ranked by **what is actually common** in
that region for that signalment, rather than by what sounds impressive. Common things are common:
a middle-aged sport horse with a short choppy hind gait far more often has distal hock arthritis
than something exotic.

### Safety behaviour

- Red-flag findings (non-weight-bearing, suspected laminitis or fracture, ataxia, open wound over a
  joint) set an emergency flag that renders above everything else and turns the top recommendation
  into "call your veterinarian today".
- Veterinary treatments are framed as options to discuss. The prompt forbids suggesting prescription
  medications, doses, or injections an owner would administer alone.
- The conditioning plan is explicitly conditional on veterinary clearance.
- Every ranked condition must carry contradicting evidence as well as supporting evidence, and
  anything the footage cannot assess is stated as such.

---

## Getting a clip that's worth analyzing

The quality of the answer is mostly set by the quality of the footage.

1. **Trot, in hand, on a loose lead.** A tight lead masks the head nod — the single most useful sign.
2. **Hard, flat, level ground.** A driveway beats an arena for spotting foot pain.
3. **Film from the side first**, then straight toward and straight away from the camera.
4. **Whole horse in frame, 8–10 seconds, camera still.** Let the horse move past you; don't pan.
5. **Good light, no long shadows.** If you can, film the same clip on a circle in both directions —
   many lamenesses only show on a turn.

---

## Project layout

```
server.js            Express server, upload handling, job store, SSE progress
src/frames.js        ffprobe/ffmpeg frame sampling and video validation
src/knowledge.js     AAEP scale, laterality rules, red flags, condition library
src/schema.js        JSON Schema for the structured report
src/analyze.js       Two-pass Claude pipeline
public/              Single-page frontend (no build step)
standalone/          Server-free build — shell.html + app.template.js + build.mjs
```

Uploaded videos are written to `uploads/`, processed, and deleted in a `finally` block whether the
analysis succeeds or fails. Nothing is retained.

The job store is in-memory, so this runs as a single process as written. To scale horizontally,
move `jobs` in `server.js` to Redis.

---

## Reference sources

The knowledge base was compiled from:

- [AAEP lameness scale — The Horse](https://thehorse.com/199286/the-aaep-horse-lameness-scale-explained/)
- [The Lameness Examination in Horses — Merck Veterinary Manual](https://www.merckvetmanual.com/musculoskeletal-system/lameness-in-horses-overview-and-examination/the-lameness-examination-in-horses)
- [Overview of Lameness in Horses — Merck Veterinary Manual](https://www.merckvetmanual.com/musculoskeletal-system/lameness-in-horses-overview-and-examination/overview-of-lameness-in-horses)
- [Navicular Syndrome in Horses — Merck Veterinary Manual](https://www.merckvetmanual.com/musculoskeletal-system/disorders-of-the-foot-in-horses/navicular-syndrome-in-horses)
- [Lameness exam and scale — Mad Barn](https://madbarn.com/lameness-exam-for-horses/)
- [Lameness evaluation in horses — University of Minnesota, Large Animal Surgery](https://open.lib.umn.edu/largeanimalsurgery/chapter/lameness-evaluation-in-horses/)
- [Robustness of five visual assessment methods for hindlimb lameness (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9787951/)
- [Vertical movement symmetry of the withers in induced fore- and hindlimb lameness (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6175082/)
- [Asymmetry thresholds in visual assessment of forelimb lameness on circles (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10650068/)
- [Causes of lameness in horses — Avonvale Equine](https://www.avonvaleequine.co.uk/blog/causes-of-lameness-in-horses/)

At runtime the model also searches the web for the specific presentation it observes, and the
sources it consulted are listed at the bottom of each report.

---

## Licence and disclaimer

Educational software. It does not diagnose, prescribe, or replace veterinary examination, and no
warranty is made as to the accuracy of its output. If a horse is non-weight-bearing, badly lame, or
laminitis or a fracture is suspected, contact a veterinarian immediately.
