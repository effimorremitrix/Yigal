# Yigal is a trader — what that changes

Written 12 September 2026, before the Los Angeles visit. Nothing here is built except the
counterparty isolation in **The leak** below. Everything else is a session 4 decision, made
against his real records rather than against this document.

## The one sentence

**Yigal buys from producers and manufacturers, and sells to importers.** He is a principal, not
an agent and not a carrier: he takes title to the goods, and his income is the difference
between the two prices, not a fee on top of one of them.

Tidelane was built on the opposite assumption. It models an operator running freight for
large-volume shippers, where the internal organization moves other people's cargo and the
counterparties are typed by their role on the bill of lading. That is a forwarder's model. It
is not a merchant's.

## The shape of one deal

Every physical shipment carries two commercial transactions.

| | Buy leg | Sell leg |
|---|---|---|
| Counterparty | producer / manufacturer | importer / buyer |
| Yigal's position | buyer; consignee on the paper | seller; shipper on the paper |
| Paper | the supplier's invoice to him (payable) | his invoice to the customer (receivable) |
| Incoterm | typically origin-side, e.g. FOB | typically destination-side, e.g. CIF |
| Money | cost | revenue |

The delta is margin. **Tidelane today cannot express the number his business actually runs on.**

The analogy that fits: a market stallholder who buys a crate at the wholesale market at dawn and
sells it by the piece all morning. The crate is one physical object. The two transactions on it
are unrelated to each other, have different counterparties, different prices and different
terms, and the stallholder's whole business is the gap between them. Tidelane currently tracks
the crate and neither transaction.

## Naming

Terms to use consistently, in code, in the guide and out loud in the sessions.

| Term | Meaning |
|---|---|
| **Principal** | Yigal's position: takes title, carries the risk, is not paid a fee |
| **Trade** | one commercial transaction attached to a shipment; has a side |
| **Buy leg** / **sell leg** | the purchase from the producer; the sale to the importer |
| **Back-to-back** | one physical shipment carrying a matched buy and sell |
| **Supplier** / **customer** | the commercial axis, as opposed to shipper/consignee which is the transport axis |
| **Counterparty isolation** | the rule that a buy-leg party never learns a sell-leg party |
| **Switch bill of lading** | the trade's own name for the same idea, on paper |

Hebrew where it is natural in the room: סוחר, רגל קנייה, רגל מכירה, מרווח, ספק, לקוח.

## The leak, and what was done about it

This is the one item that was not left for session 4, because it is a defect rather than a
feature and it blocks loading real data.

Partner visibility is "your organization sees shipments where it is a party", and the shipment
carried its full party list. Put the producer and the importer on one shipment and each could
read the other's name. For a trader the supplier list and the customer list **are** the
business; disclosing one to the other is how he gets disintermediated. The trade already knows
this, which is why it invented the switch bill of lading and the neutral packing list: one
physical movement, deliberately two sets of paper.

`worker/shipments.ts` now withholds it. A partner user sees:

- their own organization's party rows
- the service providers, `forwarder` and `carrier`

and never another organization in a commercial role. Carrier and forwarder stay visible
deliberately: the carrier and vessel are already on the shipment record and on the bill of
lading, and a forwarder cannot do the job blind.

The same filter closes the two doors beside the party list. Comment authors and document
uploaders are withheld when they belong to a withheld counterparty.

**What it does not close, stated plainly:**

- Comment text is free prose. A seeded comment already reads "Draft B/L shared — please review
  consignee details." A sentence naming the other side cannot be filtered, so the exception
  register has to record whether the collaboration thread is used across counterparties at all,
  or only between Yigal and one side at a time.
- The match is by author name, because `comments.author` and `documents.uploaded_by` are plain
  text with no organization link. Making that link structural is a session 4 item.
- `shipper` and `consignee` are transport roles, which is all the model carries today. Once the
  supplier/customer axis exists, the rule should be expressed on that axis instead.

Covered by `e2e/app.spec.ts` — "a partner never learns the other commercial counterparties on a
shipment", which asserts it on both the list and the detail endpoint.

## What is still wrong, for session 4

These are proposals, not decisions. Session 4 (Sun 27 Sep) is the reality check against his real
records, and that is where each one is confirmed, changed or dropped.

### 1. The fork that governs everything else: back-to-back or stock?

**Ask this in session 1, before the model work.** Does he match a buyer before the container
moves, or does he buy into stock and sell later?

- **Back-to-back.** Buy and sell are matched before sailing. A trade hangs off the shipment,
  margin is per shipment, and the model stays small.
- **Stock.** Purchase and sale are decoupled; one purchase may split across several sales, or one
  sale may draw on several purchases. A trade cannot hang off a shipment. It needs its own
  entity with a many-to-many to shipments, and margin becomes an allocation question with a
  costing convention behind it.
- **Both.** The model has to carry the decoupled case, and back-to-back is the degenerate
  one-to-one. Same cost as stock.

Everything below assumes back-to-back until session 1 says otherwise. **Do not build until it
does.**

### 2. Trade as an entity

```
Trade
  id
  shipmentId          -- becomes a join table if the answer to (1) is stock or both
  side                -- 'buy' | 'sell'
  counterpartyOrgId   -- the producer, or the importer
  incoterm            -- per leg, not per shipment
  currency
  goodsValue
  invoiceId           -- links to the QuickBooks row, once AP exists
```

### 3. Incoterm is per leg

`shipments.incoterm` is a single column (`migrations/0001_schema.sql:53`). FOB in and CIF out is
the ordinary case, and one column reports one of the two with no sign that the other exists.

### 4. Organization type has no commercial axis

`internal | shipper | forwarder | consignee | carrier` are transport roles. A producer is a
supplier; an importer is a customer; the same organization can be both across different deals.
Type on the organization is probably the wrong place for it — it belongs on the trade.

### 5. Invoices are receivable-only

`worker/shipments.ts` bills the shipper, and the QuickBooks connector pulls invoices. Half a
trader's money is payable: the producer's invoice to him. Without it there is no cost, no
margin, and the Invoices page shows one side of every deal while looking complete.

Session 6 has to decide AR-only or AR and AP. If AP is out of scope, the Invoices page should
say receivables, not invoices.

### 6. The questions already open, re-read as a trader's

CLAUDE.md lists four unresolved weak spots. Three of them are sharper now:

- *Can a shipment carry containers for more than one consignee?* For a trader this is one
  purchase split across several customers, which is the stock case in disguise.
- *Does a document belong to a shipment or a container?* A commercial invoice belongs to a
  **trade**, and there are two of them per shipment with different numbers and different values.
- *Can an invoice cover more than one shipment?* Almost certainly yes for a trader, and it is
  the same allocation question as the stock case.

## What this changes about Deckhand

Deckhand's mechanism is unaffected: text in, paste-ready block out. Its **intake** is two-sided,
and that does touch the 25 September delivery.

| | Buy side | Sell side |
|---|---|---|
| Sender | the producer, or the producer's forwarder | his own carrier or forwarder |
| Typical document | booking confirmation, packing list, mill certificate | booking confirmation, arrival notice, draft B/L |
| Language and format | follows the producer's country | follows the carrier |

The definition of done says Deckhand handles "the three most common email formats in his actual
inbox". That may mean three per side, which is six. **Session 1 has to count the two sides
separately**, or session 2 ships against half the corpus and looks broken on the first real
email from the other direction.
