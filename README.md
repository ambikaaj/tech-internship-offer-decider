# Tech Internship Offer Decider

A free tool for Wharton MBA students deciding between tech internship offers, or deciding whether to accept an offer that's about to expire.

It covers four kinds of roles: **product management, strategy & business operations, finance & corporate development, and product marketing & go-to-market.**

## How to use it

1. Open `decider.html` on a laptop. It opens in your web browser.
   - Nothing to install, no account, works offline.
   - On a phone, or in an email, Google Drive or Slack preview, the tool may look blank. Download the file and open it in Chrome, Safari or Edge on a computer.
2. Take the quiz (about 10 minutes).
3. On **Your profile**, click **Download my profile** and keep the file somewhere safe, like your email or Google Drive.
4. Whenever you get an offer, open the tool, click **Load my saved profile**, then go to **Compare my offers** and enter the offers you actually have. You won't need to retake the quiz.

Your answers stay in your own browser. Nobody else sees them, including the person who sent you the tool.

## What the quiz asks

- **Two setup questions:** do you need visa sponsorship, and which kinds of roles are you recruiting for? The rest of the tool only shows what fits.
- **Rank companies:** tap the companies you like, in order.
- **20 blind comparisons:** two real internships with the company names hidden. Pick the one you'd rather take. This shows what you care about: pay, location, type of company, role type, and so on.
- **Exploding offers:** you hold one offer that expires soon and are waiting on a better one. Would you accept now or wait? This measures how much risk you're comfortable with.
- **Brand check:** real names are shown. Each pair is set up so the less famous company wins on everything else. This shows how much a big name sways you.

Tapped the wrong answer? Hit **← Back** (or the Backspace key).

## What you get

- **Your profile:** what each factor is worth to you in dollars per month, how cautious you are about risk, and whether brand names change your choices.
- **Compare my offers:** your offers ranked, why the top one wins, and how much more pay would flip the result.
- **Exploding offer advice:** if you have an offer that's about to expire, the tool tells you how confident you'd need to be about your other offer before letting this one go.

## Please read

- **Never renege.** Once you accept an offer, it's final. Reneging hurts every future Wharton student who recruits at that company.
- **Check Wharton's offer-deadline rules** with MBA Career Management. The tool shows the 2025–26 rule as reported, but it hasn't been confirmed for this year.
- **The numbers are a starting point, not the truth:**
  - **Pay** comes from job postings where we found one, otherwise it's an estimate (marked "est.").
  - **Return-offer odds** and **brand levels** are rough guesses.
  - In Compare my offers, always type in the pay from your actual offer letter.
- **This doesn't replace talking to people.** Use it alongside conversations with second-years, recruiters and Career Management.

## Where the data comes from

- **Companies and cities:** a core list of top MBA tech employers.
- **Visa sponsorship:** a compiled list of which companies sponsor, sponsor in limited cases, or don't sponsor.
- **Job titles, pay and timelines:** company job postings plus the public [MBA Tech Internships 2027 tracker](https://github.com/TrevorDohm/MBA-Tech-Internships-2027), updated weekly. Companies added from the tracker are marked "from tracker."
- **Product management has the most complete data.** Strategy, finance and marketing roles come only from the tracker.

The **Company data** tab lists every role, with links to the postings.

## Found a mistake or have an idea?

Use the **Feedback** tab, or email ambikaaj@wharton.upenn.edu.

---

## For the maintainer

These notes are for whoever keeps the tool up to date. Students can skip this part.

- **Weekly update:** every Monday at 9am, `research/sync_tracker.js` pulls the latest postings from the GitHub tracker into `decider.html`. It does this through a Mac background job named `com.ajaggi.pm-offer-decider-sync`.
  - It logs changes in `research/tracker-changes.md`, keeps the last 8 versions in `research/backups/`, and shows a Mac notification.
  - If the download looks broken, it changes nothing.
  - Run it now: `node research/sync_tracker.js`. Add `--dry` to preview, or `--file <path>` to use a downloaded copy.
  - Stop it: `launchctl bootout gui/$(id -u)/com.ajaggi.pm-offer-decider-sync && rm ~/Library/LaunchAgents/com.ajaggi.pm-offer-decider-sync.plist`
- **New companies:** a company the tool hasn't seen gets default values and a "needs review" badge. Classify it in `TRACKER_META` in `decider.html`.
- **Fixing numbers:** pay, return odds and brand levels for core-list companies live in the `RAW` list near the top of `decider.html`. Researched PM roles are in `research/g1–g4.json`. Rebuild them with `node research/build_roles.js decider.html research`.
- **Self-test:** open `decider.html#selftest` to check that the quiz still recovers a simulated student's preferences.
