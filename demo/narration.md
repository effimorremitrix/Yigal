# Tidelane demo video — narration script

**Generated from `demo/scene.html` by `scripts/demo/narration.mjs`. Do not edit by hand;**
edit the `SCENES` array in the scene and re-run `npm run demo:narration`.

Total 3:15 at 30fps. 1440x900, no audio track: the captions carry the script,
and the .srt beside this file lets a voiceover be recorded against the same timings later.

Two rules govern every line, both from `CLAUDE.md`: nothing may imply a mock connector is
live or that the seeded data is real, and the video says out loud that Deckhand and the
Tidelane record are separate today rather than letting the cut imply otherwise.

| # | In | Out | On screen | Caption |
|---|---|---|---|---|
| 1 | 0:00 | 0:08 | Full-frame card | From the email to the booking. Two tools, two jobs. |
| 2 | 0:08 | 0:15 | Full-frame card | Part one. What Deckhand does. It takes the identifiers out of the email. Nothing else. |
| 3 | 0:15 | 0:32 | The inbound email | This is the job. Two container numbers, two seal numbers, and they have to reach INTTRA without a typo. |
| 4 | 0:32 | 0:42 | Screenshot: 03-deckhand-empty.png | Deckhand is in the sidebar, under Invoices. Nothing is saved here: it reads the document and forgets it. |
| 5 | 0:42 | 0:52 | Screenshot: 04-deckhand-pasted.png | Select the whole email and paste it. Headers, signature, all of it. Then press Extract. |
| 6 | 0:52 | 1:04 | Screenshot: 05-deckhand-result.png | Four cards come back. The paste-ready block is the one you copy from. |
| 7 | 1:04 | 1:20 | Screenshot: 06-block.png | Read the block against the email before it goes anywhere. That check is the point, not a formality. |
| 8 | 1:20 | 1:33 | Screenshot: 07-pairs.png | Paired only where the document showed them together. The note in brackets tells you what the evidence was. |
| 9 | 1:33 | 1:47 | Screenshot: 09b-unpaired.png | Two lists side by side is not evidence. Deckhand will not guess which seal belongs to which container, and neither should you. |
| 10 | 1:47 | 2:00 | Screenshot: 10b-checkdigit.png | Container numbers carry a check digit. A failure is flagged in red, never corrected quietly. Retype it from the source. |
| 11 | 2:00 | 2:14 | Full-frame card | Copy all, then paste into INTTRA. In your own browser, in the session you already opened. Deckhand never logs in for you and never sees your password. |
| 12 | 2:14 | 2:22 | Full-frame card | Part two. What Tidelane does. It keeps the record. It does not read your email. |
| 13 | 2:22 | 2:29 | Screenshot: 11-booking-route.png | Step one, route. Where the cargo is going, and on what terms. |
| 14 | 2:29 | 2:36 | Screenshot: 12-booking-cargo.png | Step two, cargo. Container types and counts. |
| 15 | 2:36 | 2:44 | Screenshot: 13-booking-schedule.png | Step three, sailing. These come from the INTTRA connector, running in mock mode. |
| 16 | 2:44 | 2:51 | Screenshot: 14-booking-review.png | Step four, review. Read the small print before you confirm. |
| 17 | 2:51 | 2:58 | Screenshot: 15-booking-confirmed.png | Booking confirmed. This writes to Tidelane only. No booking is sent to a carrier. |
| 18 | 2:58 | 3:06 | Screenshot: 17-containers.png | These are Tidelane's own container and seal numbers, not the ones from the email. |
| 19 | 3:06 | 3:15 | Full-frame card | Two separate jobs. Deckhand's output goes to INTTRA. Tidelane keeps its own record. When Deckhand gets something wrong: trust the email, not the block. |
