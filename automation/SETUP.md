# Instagram comment → DM automation

Everything here drives one thing: someone comments on your Reel, they get the
game link in their DMs automatically.

**Before you switch it on:** confirm https://mirzawasiq.github.io/first-project-/
actually loads. If GitHub Pages isn't enabled yet, the automation will happily
DM hundreds of people a dead link.

---

## Files

| File | What it's for |
|---|---|
| `instagram-dm-flow.json` | The whole flow — triggers, messages, buttons, branches |
| `SETUP.md` | This guide |

**Only edit the `links` block** at the top of the JSON. Every message pulls from
it, so changing the URL once updates everywhere.

---

## Option A — ManyChat (recommended, free tier is enough)

ManyChat has no import format, so you paste the message bodies in. 10 minutes.

1. **manychat.com** → sign up → connect your Instagram (must be a **Business or
   Creator** account linked to a Facebook Page).
2. **Automation → New Automation → Instagram → Comments**.
3. **Trigger:** select your Reel. Under keywords, paste from
   `trigger.keywords` in the JSON:
   `code, game, play, link, send, how, gta`
   Turn on **"Reply to any comment"** if you want everyone DM'd, not just
   keyword matches — this is `trigger.catchAll` in the JSON.
4. **Public reply:** paste the 5 strings from `publicCommentReply.variants`.
   ManyChat rotates them for you. Do use all five — identical replies look botted.
5. **DM messages:** add four text blocks and paste `flow[].text` in order.
   Set the delay on each from `delaySeconds` (0, 2, 2, 2).
6. **Buttons:** on the last block add the three buttons from `flow[3].buttons`.
   The first two are URL buttons; "🔥 How I built it" points at a new flow
   holding the two `branches.branch_how` messages.
7. **Publish**, then comment on your own Reel from a second account to test.

## Option B — Chatfuel / InstaChamp / Zapier

Same structure, different UI. Map it like this:

- `trigger.keywords` → the tool's keyword trigger
- `flow[]` → sequential message blocks, honouring `delaySeconds`
- `branches.branch_how` → a separate flow fired by the button
- `fallback` → the default/unmatched reply

## Option C — Instagram Messaging API (if you're building it yourself)

Consume this JSON directly:

- Subscribe to the `comments` webhook field on your IG Business account.
- On each event, match `trigger.keywords` against the comment text.
- Resolve `{{links.*}}` placeholders against the `links` block.
- POST each `flow[]` item to `/{ig-user-id}/messages`, sleeping `delaySeconds`
  between them.
- Respect `compliance.messagingWindowHours` — you have **24 hours** from the
  comment, and one flow per user per post.

---

## Rules that will actually get you blocked

- **24-hour window.** A comment opens it. Miss it and the send fails.
- **One flow per user per post.** Repeat sends read as spam.
- **Vary the public replies.** Five identical comments in a row is the tell.
- **Business/Creator account required.** Personal accounts can't do this at all.

---

## Test before you post

1. Confirm the play link loads **and the game actually starts**.
2. Comment "code" from a second account.
3. Check all four DMs arrive, in order, with working links.
4. Tap every button.

Then post the Reel.
