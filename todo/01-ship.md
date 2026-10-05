# 1. Ship

Competitors have store listings, ratings and years of reviews; Spamset is a development build.

## Tasks

- [x] Create the prod-spamset stack on the VPS (`tools/vps/setup-stack.sh`, port prefix 3) and pick its hostname. Replace the placeholder `https://api.spamset.example` in `app.config.ts` and the empty production key in `eas.json`.
- [x] Apply the migrations to prod-spamset (confirm with the owner first; see AGENTS.md).
- [ ] Sign-in for production: rotate the Google client secret that was pasted in chat, fix the Google consent screen branding (it shows loadoutlog.com), and add Apple sign-in.
- [ ] App Store and Google Play: icons, screenshots, descriptions, privacy policy, and `eas build` / `eas submit` with the production profile.
- [ ] Host the web app and rebuild the Chrome extension for its origin (`SPAMSET_WEB_ORIGINS=… npm run extension`), then publish the extension on the Chrome Web Store.
- [ ] Landing page: the pitch (adaptive strength snacks, the 3D demo, leaderboards and rivals), store badges and the extension link.
- [ ] Pricing: freemium with a 7-day trial, around $3–5 a month or $20–30 a year, in line with the market (Moova $6.99–59.99, ShortReps $4.99/month or $14.99/year, Snack App $4.99 once). Decide what is premium; the candidates are the 3D demo, adaptive targets and leaderboards.

## Notes

- Market check (Oct 2026): Wakeout is the leader (Apple App of the Year, 4.8★) with a subscription and a free Chrome extension; most others are small. See the comparison in the conversation of 2026-10-04.
