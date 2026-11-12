# Landing page — content and messaging (#97)

Status: **Decided** (tech lead, by delegation from the product owner, 2026-11-10) · 2026-11-10 · Part of #102.

> **Status 2026-11-11 (#131):** implemented and live at `/` (#125, #127). The binding content rules are LAND-03; the approved design and the shipped page may word sections differently from this plan.
>
> **Update 2026-11-11 (#140, product owner):** the privacy section (§4.6) is removed; privacy is now a badge row under the hero (§4.2a′). A new study-hours section follows How it works (§4.3a). Page order: header · hero · privacy badges · site belt · problem · bento (three cards) · how it works · study hours · the rules · FAQ · final CTA · footer.

Every claim below is checked against the v0 specs (IDs in brackets). Anything not in v0 stays off the page: no goals, streaks, AI insights, mobile apps, user counts or testimonials.

## 1. Audience and job

- **Who:** developers preparing for technical interviews who study across several sites: LeetCode, NeetCode, GreatFrontEnd, docs, videos.
- **Their question:** *"How much did I actually study this week, and where?"* (product spec §1).
- **What gets in the way:** manual timers are forgotten; screen-time tools mix study with everything else and collect far more than needed.

## 2. Value proposition

**One sentence:** CareerOS measures your interview-prep study time automatically, only on the sites you choose, and shows your week in a simple dashboard.

Supporting points:
1. **Automatic:** no timer to start or stop. It counts while a chosen site is the tab you're looking at and you're active, pauses after 60 seconds without input, and keeps counting while the study tab plays sound (a video, unmuted), for up to 15 minutes without input (TRK-01..07).
2. **Only your study sites:** you pick the sites (up to 12); everything else is ignored (TRK-03, DATA-01).
3. **Private by design:** for your study, it stores only the site name and the start and end times. It reads the tab's address only to get the site name, and never stores or sends the address, page titles, page content or other sites; no incognito; no ad trackers, only cookieless page analytics on the website (SEC-15, amended 2026-11-11, #137; the dashboard uses session cookies for sign-in, so the page never says "no cookies"); delete your account anytime (TRK-02, SEC-01, SEC-15, DASH-14).
4. **A clear picture:** time per day and per platform, week by week or month by month, in light or dark (DASH-04..10).
5. **Built not to lose or double-count time:** works offline and uploads later; browser restarts and sleep don't double-count (SYNC-01..08, TRK-12..15). (Sessions the server refuses are kept and shown as not synced; disconnecting asks before discarding unsynced time.)

## 3. Calls to action

| CTA | Label | Target | Notes |
|---|---|---|---|
| Primary | **Get started — it's free** | `/sign-in` (Google or GitHub) | A signed-in visitor is taken straight to the dashboard |
| Secondary | **Add to Chrome** | The Chrome Web Store listing (configurable link, [architecture](../history/landing/architecture.md) §4) | Quiet style; header and "how it works" step 1. The landing page goes live with the store link (product owner, 2026-11-10): it is built first, then the extension is published, then the link is set and the page launches |
| Tertiary | **Privacy** | `/privacy` | In the header and the footer (the privacy section was removed, #140) |

"Free" is true for v0 (there is no paid plan, product spec §5). If pricing ever changes, this label changes with it.

## 4. Sections and draft copy

### 4.1 Header
`CareerOS` wordmark · links: How it works · Privacy (`/privacy`) · FAQ · **Sign in** (button). Mobile: wordmark and Sign in only.

### 4.2 Hero
- **H1 (decided, has "study time" for search):** See where your study time really goes
- **Subline:** CareerOS is a study time tracker for interview prep. It counts your study hours automatically on the sites you choose, like LeetCode and NeetCode, and shows your week at a glance. No timers. Nothing else tracked.
- **CTAs:** Get started — it's free · Add to Chrome
- **Under the CTAs (small):** Sign in with Google or GitHub. Chrome on desktop.
- **Visual:** the popup ("leetcode.com · 26m", today on this computer) overlapping the dashboard's weekly bar chart. Sample data only; durations in the app's own format (`45m`, `1h 05m`, EXT-UI-02).

Alternatives for the H1, to choose with the design (#100):
- "Know how much you really study for interviews" (strongest message, but no "study time")
- "Your interview prep study time, measured automatically"

### 4.2a Site belt (below the hero)
Monospace, scrolling: leetcode.com · neetcode.io · greatfrontend.com · docs.python.org · developer.mozilla.org · react.dev · coursera.org · github.com. Note under it: "Examples. Any site you study on works; you choose."

### 4.2a′ Privacy badges (directly under the hero, #140)
One line of three pills, a list: **Never reads page content** · **No URLs stored** · **No ad trackers**. No "no cookies" claim (the dashboard uses session cookies).

### 4.2b Engine log (in How it works, beside the steps)
Sample times; each line is a real rule (TRK-03/05, SYNC-01/02); a saved session never exceeds 30 minutes (TRK-08):
`09:20:02 tab leetcode.com — study site, counting` · `09:46:10 no input for 60 s — session closed, 26m` · `09:46:10 saved on this computer — 1 waiting to upload` · `09:50:00 sync — 1 session confirmed` · `09:51:15 tab youtube.com — not a study site, ignored` · `09:52:03 tab neetcode.io — study site, counting`.

### 4.3 How it works (4 steps)
1. **Add the extension to Chrome.** One click from the Chrome Web Store.
2. **Choose your study sites.** leetcode.com, neetcode.io, docs: any site you study on.
3. **Study as usual.** Time counts only while you're active on one of them. Step away and it pauses.
4. **See your week.** Daily totals and time per platform on the dashboard; today's time on this computer in the popup.

### 4.3a How many hours should you study (#140)
- **H2:** How many hours should you study for coding interviews?
- **Lede:** There's no magic number. Steady, measured practice beats occasional marathons, and you can only steer what you measure.
- **Points:**
  1. **Measure a normal week first.** Let CareerOS count one ordinary week before you plan. A measured week can turn out smaller than the one you remember.
  2. **Look for consistency.** Several steady days add up, and they're easier to keep than one marathon Sunday.
  3. **Plan from the real week.** On Sunday, open the week view and plan the next week from what really happened (DASH-04: weeks start on Monday).
- **Illustration (CSS only):** a Remembered / Measured radio toggle over a 7-day bar chart titled "An example week, remembered and measured". Measured is the sample week (6h 40m); Remembered is an invented example (10h 00m), drawn with dashed outlines. Text under it: "Example data, not from real users. Remembered: an invented guess at the week, 10h 00m. Measured: the same sample week as counted, 6h 40m."
- **Not claimed:** a recommended number of hours, studies or statistics, goals or targets, comparison with last week (none exist in v0).

### 4.4 Product: the dashboard
- **Heading:** Your week, at a glance
- **Text:** Today's time, the week's total and your top platform; a bar per day and the split by site. Move back through weeks and months. Light or dark.
- **Visual:** dashboard week view, light and dark (sample data).

### 4.5 Product: the popup
- **Heading:** Right there while you study
- **Text:** The popup shows whether the current tab is counting, your session, today's total on this computer, your top sites today, and when it last synced. Add the site you're on with one click.
- **Visual:** the popup in its three states: tracking, paused (idle), not a study site.

### 4.6 Privacy (removed from the page, #140; kept for the record)
- **Heading:** Only what it needs. Nothing else.
- **Text:** For your study, CareerOS records the name of a site you chose and when you started and stopped. That's all it keeps about your browsing.
- **Two columns:**
  - **Stored:** the study sites you choose · start and end times · a random device id · your account (email and sign-in provider; Google or GitHub also send your name and avatar, which CareerOS doesn't use). Sign-in and hosting providers keep their own security logs: see the privacy policy.
  - **Never:** full web addresses or search terms · page titles or content · keystrokes or screenshots · sites you didn't choose · incognito windows · ad trackers or cookies.
- **Controls (one line each):** Turn tracking off anytime. Remove a site and it stops counting. Delete your account and your data is removed right away (encrypted backups expire within 90 days).
- **Link:** Read the privacy policy →

### 4.7 FAQ
1. **Does CareerOS read the pages I visit?** No. It reads the active tab's address only to get the site name (for example `leetcode.com`) and check whether it is one of your study sites. It never stores or sends the address, and never reads page titles or content. (Because of this, Chrome describes the permission as reading your browsing history.)
2. **Which sites can I track?** Any site you add, up to 12. Subdomains count too: adding `python.org` also covers `docs.python.org`.
3. **What happens when I step away?** After 60 seconds without keyboard or mouse input, tracking pauses. If the study tab in front of you is playing sound (a video, not muted), it keeps counting for up to 15 minutes without input.
4. **Does it work offline?** Yes. Time is saved on your computer and uploaded when you're back online.
5. **Can I use it on more than one computer?** Yes. Install the extension on each and connect it to the same account. The dashboard adds them up.
6. **Is it free?** Yes. There's no paid plan.
7. **Which browsers?** Chrome on desktop. The dashboard works in any modern browser, including on your phone.
8. **How do I delete my data?** Settings → Delete account removes your account and all study records right away (encrypted backups expire within 90 days). When the extension is no longer connected, its "Forget local data" clears what's left on that computer.

### 4.8 Final CTA
- **Heading:** Start measuring this week's study
- **Button:** Get started — it's free
- **Small:** Google or GitHub sign-in · Chrome extension

### 4.9 Footer
CareerOS · Privacy · GitHub (repository) · Sign in · © 2026.

## 5. Tone and style

- Clear, calm, confident; short sentences; second person ("you").
- Specific numbers from the specs instead of adjectives ("pauses after 60 seconds", not "smart idle detection").
- No hype words ("revolutionary", "supercharge"), no exclamation marks.
- English only for now (product owner, 2026-11-10).

## 6. Decisions (2026-11-10)

1. **H1:** "See where your study time really goes" (the alternatives stay available if the design needs a shorter line).
2. **Code wording:** "public code on GitHub", not "open source" (no license; product owner).
3. **GitHub link in the footer:** kept, because it builds trust with developers.
4. **Install CTA:** "Add to Chrome", pointing to the Chrome Web Store listing; the page launches once the listing is live.
