# Yigal is a trader — what that changes

Last corrected 12 September 2026. An earlier version of this document said Yigal earns "the
margin between two prices". **That was wrong**, and the correction matters because it makes the
model smaller rather than larger. The wrong version proposed a `Trade` entity holding two
independently negotiated prices per shipment. None of that is needed and none of it was built.

## The one sentence

**Yigal buys from producers and sells to importers, and is paid a commission retained out of the
producer's side of one price.**

There is one price, not two:

```
X  = the all-in deal value: goods + freight + insurance + duty
     the importer is invoiced X
     the producer receives  X − commission
     Yigal keeps            commission   (default 2% of X)
```

The fee comes **out of the producer's side**, not on top of the buyer's. The importer pays the
headline price either way, which is the commercially interesting part: his presence does not make
the goods more expensive, so the buyer has no price incentive to go around him.

**The analogy:** a travel agent paid out of the hotel's rate. The traveller pays the rack rate,
the agent keeps a slice, the hotel nets less. Nobody is paying extra for the agent; the supplier
funds him. (An earlier version of this document used a market stallholder buying a crate at dawn
and selling it by the piece. That analogy is wrong for the same reason the old economics were
wrong: a stallholder sets his own margin.)

## What is built

| Term | Where | Meaning |
|---|---|---|
| **Deal value** | `shipments.deal_value_usd`, stored | X. What the importer is invoiced |
| **Commission rate** | `business_profile.commission_rate_pct` (house), `shipments.commission_rate_pct` (override) | Default 2.0 |
| **Commission** | derived, never stored | `dealValue × rate / 100`. Yigal's income |
| **Producer payable** | derived, never stored | `dealValue − commission` |

`deriveEconomics` in `worker/business.ts` is the only place the arithmetic lives, so the shipment
view and the invoice ledger cannot disagree about what he earned. It is derived rather than stored
for the same reason `Invoice.status` is: one source of truth, so changing a rate re-derives the
pair and the two can never drift. `producerPayable + commission === dealValue` holds to the cent,
because the payable is subtracted from the already-rounded commission rather than rounded
separately.

**A missing price reads as missing.** A shipment booked before an agreed price, or booked in
operator mode, carries no deal value, and then no commission and no payable either — never a zero,
and never a number inferred from the freight cost. Inventing a customer's price is worse than
showing a blank.

**The commission never travels with the invoice.** The mock QuickBooks invoice is addressed to the
importer, and the one number he must not be handed is what Yigal kept out of the producer's side.
`InvoiceSeed` deliberately does not carry it.

## The business model switch

`business_profile` is one row for the whole deployment, selecting how the application presents
itself.

| | `trader` (default) | `operator` |
|---|---|---|
| Party labels | Producer / Importer | Exporter / Consignee |
| Shipment money | deal value, rate, commission, producer payable | freight cost only |
| Analytics | deal value invoiced, commission earned, effective rate | freight spend, avg cost per TEU |
| Invoices | the importer is billed the deal value | the shipper is billed freight plus a surcharge |
| Counterparty isolation | **on** | **off** |

`src/lib/vocabulary.ts` is the single definition of both vocabularies. No page hardcodes a role
label; add wording there or it will drift.

**Why one row and not a user preference.** This gates server-side access control. Per-user, a
partner user could switch off the rule that hides their counterparties from them. So the write is
`requireInternal(user, ['admin'])`, the worker reads the row on every request, and nothing is
trusted from the client. The read is open to any signed-in user because every screen's vocabulary
depends on it, and knowing the model discloses nothing.

**`operator` turns counterparty isolation off**, and that is the one control in the application
that widens who can see whom. It is correct for that model — an exporter and a consignee on one
bill of lading already know each other, and withholding either would break the collaboration the
model exists for — and it is wrong with a trader's real supplier and customer data loaded. The
Settings UI says so at the control. The security checklist in `CLAUDE.md` requires confirming the
mode reads `trader` before real data goes in.

## Counterparty isolation

The rule: a partner user sees their own organization's party rows plus the service providers
(`forwarder`, `carrier`), and never another organization in a commercial role. Carrier and
forwarder stay visible deliberately — the carrier and vessel are already on the shipment record
and on the bill of lading, and a forwarder cannot work blind.

Why it matters to a trader: the producer and the importer are both parties to one shipment, and
the supplier list and the customer list **are** the business. The trade already knows this and
calls the paper version a **switch bill of lading**: one physical movement, deliberately two sets
of paper.

The retained-commission correction does not weaken the case. A buyer who knows the rate could work
out what the producer received; what he must not learn is **who the producer is**.

The same filter closes the two doors beside the party list: comment authors and document uploaders
belonging to a withheld counterparty are withheld too.

**What it does not close, stated plainly:**

- Comment text is free prose. A seeded comment already reads "Draft B/L shared — please review
  consignee details." A sentence naming the other side cannot be filtered, so the exception
  register has to record whether the collaboration thread is used across counterparties at all.
- The match is by author name, because `comments.author` and `documents.uploaded_by` are plain
  text with no organization link. Making that structural is a session 4 item.
- `shipper` and `consignee` are transport roles, which is all the model carries today.

Covered by `e2e/app.spec.ts`: "a partner never learns the other commercial counterparties on a
shipment" (trader mode, list and detail endpoints, comment and document doors) and "only an
internal admin may switch the business model, and the switch moves isolation" (both directions).

## What is still open, for session 4

Session 4 is the reality check against his real records. Each of these is a proposal, not a
decision.

### 1. Is it really 2 percent, and really on the all-in value?

The first thing to check, because everything above assumes it. Ask specifically:

- Is the rate the same for every producer and every customer, or does it move?
- Is it charged on goods only, or on goods plus freight plus insurance plus duty as modelled?
- When the freight cost changes after the price is agreed, who absorbs it?
- Are there deals where he is paid differently altogether — a flat fee, or a real markup?

A per-shipment rate column already exists and `deriveEconomics` honours it, but nothing in the UI
sets one. If session 4 finds the rate moves often, that control is the next small thing to build.

### 2. Incoterm per leg

`shipments.incoterm` is a single column. He buys on one term and sells on another, and FOB in with
CIF out is ordinary. One column reports one of the two with no sign the other exists.

### 3. A supplier/customer axis

`shipper` and `consignee` are transport roles. A producer is a supplier, an importer is a
customer, and the same organization can be both across different deals. That belongs on the deal,
not on the organization.

### 4. Payables

QuickBooks pulls receivables. The producer's invoice to Yigal is a payable, and without it there is
no independent check on the producer payable the app derives. Session 6 decides receivables-only or
both; if payables are out, the Invoices page should say receivables rather than looking complete.

### 5. Back-to-back or stock

Still a session 1 question, but it matters far less than it did. With one deal value and one rate
per shipment, matching a buyer before the container moves needs no extra entity at all. Only buying
into stock and selling later would, and nothing is built for it.

### 6. The old weak spots, re-read

`CLAUDE.md` lists four. Three are sharper as a trader's questions:

- *Can a shipment carry containers for more than one consignee?* That is one purchase split across
  several customers, which is the stock case in disguise.
- *Does a document belong to a shipment or a container?* A commercial invoice belongs to a deal,
  and there are two per shipment with different numbers.
- *Can an invoice cover more than one shipment?* Almost certainly yes, and it is the same
  allocation question.

## What this changes about Deckhand

Deckhand's mechanism is unaffected: text in, paste-ready block out. Its **intake** is two-sided,
and that touches the 25 September delivery.

| | Buy side | Sell side |
|---|---|---|
| Sender | the producer, or the producer's forwarder | his own carrier or forwarder |
| Typical document | booking confirmation, packing list, mill certificate | booking confirmation, arrival notice, draft B/L |
| Format follows | the producer's country and house style | the carrier |

"The three most common email formats in his actual inbox" may mean three per side, which is six.
**Session 1 has to count the two sides separately**, or session 2 ships against half the corpus and
looks broken on the first real email from the other direction.
