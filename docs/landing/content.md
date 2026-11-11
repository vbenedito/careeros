# Landing page — content and messaging (#97)

Status: **Decided** (tech lead, by delegation from the product owner, 2026-11-10) · 2026-11-10 · Part of #102.

Every claim below is checked against the v0 specs (IDs in brackets). Anything not in v0 stays off the page: no goals, streaks, AI insights, mobile apps, user counts or testimonials.

## 1. Audience and job

- **Who:** developers preparing for technical interviews who study across several sites: LeetCode, NeetCode, GreatFrontEnd, docs, videos.
- **Their question:** *"How much did I actually study this week, and where?"* (product spec §1).
- **What gets in the way:** manual timers are forgotten; screen-time tools mix study with everything else and collect far more than needed.

## 2. Value proposition

**One sentence:** CareerOS measures your interview-prep study time automatically, only on the sites you choose, and shows your week in a simple dashboard.

Supporting points:
1. **Automatic:** no timer to start or stop. It counts while a chosen site is the tab you're looking at and you're active, pauses after 60 seconds without input, and keeps counting while the study tab plays sound (a video, unmuted), for up to 15 minutes without input (TRK-01..07).
2. **Only your study sites:** you pick the sites (up to 50); everything else is ignored (TRK-03, DATA-01).
3. **Private by design:** for your study, it stores only the site name and the start and end times. It reads the tab's address only to get the site name, and never stores or sends the address, page titles, page content or other sites; no incognito; no analytics on the dashboard; delete your account anytime (TRK-02, SEC-01, SEC-15, DASH-14).
4. **A clear picture:** time per day and per platform, week by week or month by month, in light or dark (DASH-04..10).
5. **Built not to lose or double-count time:** works offline and uploads later; browser restarts and sleep don't double-count (SYNC-01..08, TRK-12..15). (Sessions the server refuses are kept and shown as not synced; disconnecting asks before discarding unsynced time.)

## 3. Calls to action

| CTA | Label | Target | Notes |
|---|---|---|---|
| Primary | **Get started — it's free** | `/sign-in` (Google or GitHub) | A signed-in visitor is taken straight to the dashboard |
| Secondary | **Add to Chrome** | The Chrome Web Store listing (configurable link, architecture §4) | Quiet style; header and "how it works" step 1. The landing page goes live with the store link (product owner, 2026-11-10): it is built first, then the extension is published, then the link is set and the page launches |
| Tertiary | **Read the privacy policy** | `/privacy` | In the privacy section and the footer |

"Free" is true for v0 (there is no paid plan, product spec §5). If pricing ever changes, this label changes with it.

## 4. Sections and draft copy

### 4.1 Header
`CareerOS` wordmark · links: How it works · Privacy · FAQ · **Sign in** (button). Mobile: wordmark and Sign in only.

### 4.2 Hero
- **H1 (decided, has "study time" for search):** See where your study time really goes
- **Subline:** CareerOS is a study time tracker for interview prep. It counts your study hours automatically on the sites you choose, like LeetCode and NeetCode, and shows your week at a glance. No timers. Nothing else tracked.
- **CTAs:** Get started — it's free · Add to Chrome
- **Under the CTAs (small):** Sign in with Google or GitHub. Chrome on desktop.
- **Visual:** the popup ("leetcode.com · 32m", today on this computer) overlapping the dashboard's weekly bar chart. Sample data only; durations in the app's own format (`45m`, `1h 05m`, EXT-UI-02).

Alternatives for the H1, to choose with the design (#100):
- "Know how much you really study for interviews" (strongest message, but no "study time")
- "Your interview prep study time, measured automatically"

### 4.3 How it works (4 steps)
1. **Add the extension to Chrome.** One click from the Chrome Web Store.
2. **Choose your study sites.** leetcode.com, neetcode.io, docs: any site you study on.
3. **Study as usual.** Time counts only while you're active on one of them. Step away and it pauses.
4. **See your week.** Daily totals and time per platform on the dashboard; today's time on this computer in the popup.

### 4.4 Product: the dashboard
- **Heading:** Your week, at a glance
- **Text:** Today's time, the week's total and your top platform; a bar per day and the split by site. Move back through weeks and months. Light or dark.
- **Visual:** dashboard week view, light and dark (sample data).

### 4.5 Product: the popup
- **Heading:** Right there while you study
- **Text:** The popup shows whether the current tab is counting, your session, today's total on this computer, your top sites today, and when it last synced. Add the site you're on with one click.
- **Visual:** the popup in its three states: tracking, paused (idle), not a study site.

### 4.6 Privacy
- **Heading:** Only what it needs. Nothing else.
- **Text:** For your study, CareerOS records the name of a site you chose and when you started and stopped. That's all it keeps about your browsing.
- **Two columns:**
  - **Stored:** the study sites you choose · start and end times · a random device id · your account (email and sign-in provider; Google or GitHub also send your name and avatar, which CareerOS doesn't use). Sign-in and hosting providers keep their own security logs: see the privacy policy.
  - **Never:** full web addresses or search terms · page titles or content · keystrokes or screenshots · sites you didn't choose · incognito windows · analytics or ad trackers.
- **Controls (one line each):** Turn tracking off anytime. Remove a site and it stops counting. Delete your account and your data is removed right away (encrypted backups expire within 90 days).
- **Link:** Read the privacy policy →

### 4.7 FAQ
1. **Does CareerOS read the pages I visit?** No. It reads the active tab's address only to get the site name (for example `leetcode.com`) and check whether it is one of your study sites. It never stores or sends the address, and never reads page titles or content. (Because of this, Chrome describes the permission as reading your browsing history.)
2. **Which sites can I track?** Any site you add, up to 50. Subdomains count too: adding `python.org` also covers `docs.python.org`.
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
