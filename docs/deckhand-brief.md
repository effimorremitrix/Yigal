# Deckhand — brief

The thing Yigal actually asked for, built in three stages. Only v0 and possibly v1 are in scope for the Los Angeles visit.

**A deckhand is the junior crew member who handles the routine deck work so the officers can navigate.** That is the whole design intent: Deckhand does the copying, Yigal keeps the judgment.

## The problem, in his words

Shipment IDs and seal IDs arrive by email. He retypes them into INTTRA. Every time.

Everything below is a response to that sentence and nothing more. If a design decision does not make that sentence less true, it does not belong here.

## The intake has two sides

Yigal is a trader: he buys from producers and sells to importers, so the emails arrive from two
different directions and they do not look alike.

| | Buy side | Sell side |
|---|---|---|
| Sender | the producer, or the producer's forwarder | his own carrier or forwarder |
| Typical document | booking confirmation, packing list, mill certificate | booking confirmation, arrival notice, draft B/L |
| Format follows | the producer's country and house style | the carrier |

The mechanism is unaffected — text in, paste-ready block out — but "the three most common email
formats in his actual inbox" may mean three per side, which is six. Count them separately in
session 1, or v0 ships against half the corpus and looks broken on the first real email from the
other direction. Background in `docs/trader-model.md`.

## The number that governs the whole design

Measured in session 1 (Thu 24 Sep), before anything is built:

- How many of these does he do per day?
- How many minutes does each one take, door to door?
- **How do those split between buy side and sell side?**
- How often does he get one wrong, and what happens when he does?

Rough guide: five a day at two minutes is about 160 hours a year and justifies v1. Two a week means v0 is the entire product and nobody should touch a browser.

**Do not skip this. Do not estimate it. Watch and time it.**

## v0 — Extraction (in scope, session 2)

No browser, no credentials, no automation. Input is an email; output is a clean, paste-ready block.

**Input:** the email body, plus attachments (arrival notice, booking confirmation, BOL, container list) as PDF or image.

**Output:** a structured block Yigal can read at a glance and copy field by field:

```
Booking / shipment ref : ...
Container numbers      : ... (one per line)
Seal numbers           : ... (aligned to the container above)
Vessel / voyage        : ...
Ports (POL → POD)      : ...
Anything I am unsure of: ... (flagged explicitly)
```

**Design rules:**

- Alignment between container and seal is the whole job. A seal on the wrong container is worse than no output at all. When alignment is uncertain, say so rather than guessing.
- Never silently drop a field. Missing is a value, and it is printed.
- Confidence is shown per field, not as one overall score.
- Output is read by a human before it goes anywhere. That is a feature, not a limitation.
- Container numbers follow ISO 6346 and carry a check digit. Validate it. A failed check digit is a loud flag, not a silent correction.

**Delivery:** simplest thing that works on his machine on the morning of 25 September. A page in Tidelane, or a standalone worker endpoint, or a paste box. Do not architect this. It should be usable the same day it is built.

**Why this is 80 percent of the value:** the retyping is the cost, not the navigating. He already knows where the INTTRA form is.

## v1 — Browser assist (conditional, reserve session R1)

Only if the session 1 numbers justify it, and only in this shape:

- Runs in **Yigal's own browser, in a session he already logged into**. Deckhand never sees a password and never performs a login.
- Fills the INTTRA form fields from the v0 output.
- **Stops before submit, always.** He presses submit.
- Attended. He is at the machine.

**What is prohibited, permanently:**

- Storing, transmitting or using Yigal's INTTRA, ACE or Login.gov credentials
- Headless or unattended login to any of the three portals
- Any automation of CBP ACE. ACE accounts are tied to a named individual behind Login.gov MFA, and automating credentialed access to a US customs system is a compliance problem before it is an engineering one.
- Bypassing MFA by any means

**Separately legitimate and worth doing once:** an attended, one-time bulk extraction to pull historical bookings out of a portal that has no export, with Yigal present, to give session 5 real data to load. One-off, supervised, then deleted.

## v2 — Inbox intake (parking list, not during the visit)

The larger version, deliberately deferred until after 3 October.

1. **Trigger** on a dedicated alias such as `bookings@`, never the whole inbox
2. **Gate** with a cheap classifier: is this shipment-related at all? Most mail is not, and this runs before anything expensive
3. **Extract** into JSON matching the Tidelane domain model
4. **Match** to an existing shipment by booking ref or container number, else propose a new one
5. **Write** through the existing worker API, never directly to D1
6. **Propose, never commit.** Control Tower shows "4 items need review". Yigal approves. High-confidence classes may auto-commit later, once there is a track record to justify it
7. **Audit** the source email, the extraction, the per-field confidence and the approver, on every record

The reason v2 waits: it is a new module, and the visit exists to make what already exists real rather than to make it bigger. A Deckhand v2 demo during the seven sessions would quietly displace the handover.

## Open questions

- Where does a seal number live in the Tidelane domain model? It may not be first-class today. Confirm before building anything that reads or writes one.
- Do the emails come from a predictable set of senders, or from anyone? Ask per side; the producers are probably a stable short list and the carriers definitely are.
- Does the same container ever arrive described twice, once by the producer and once by the carrier, with the two descriptions disagreeing? That is the trader's version of a conflict, and Deckhand should flag it rather than pick one.
- Is there a variant where the IDs arrive as an image or a scan rather than text?
- What does INTTRA do on a duplicate submission, and how would he recover?
