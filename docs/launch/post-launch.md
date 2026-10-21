# After launch: the first 48 hours, objections, and feedback

## What to watch

**Hour 0–6 (Show HN day)**

| Signal | Where | What it tells you | Act if |
| --- | --- | --- | --- |
| HN comments | the thread | What people try first and what confuses them | Any question you can answer, answer it. Any bug, file it and reply with the issue link |
| Visits and top pages | Cloudflare Web Analytics | Whether people go past the landing page | Almost nobody reaches `/learn/`: the hero isn't handing off. Note it; don't redesign mid-launch |
| Event counts | `/panel/` | The funnel: `hero_send` → `lesson_start` → `lesson_finish`; sharing: `share_open`, `share_copy`, `daily_share`, `message_create` → `message_open`, `challenge_start` | `hero_send` high but `lesson_start` near zero: same as above. `message_open` well above `message_create`: messages are travelling |
| Errors | Browser console on your own phone; Cloudflare → origin errors | Anything broken under real traffic | Any 5xx: it's a static site, so check the origin/vhost first |
| GitHub | Issues, stars | Who wants to contribute | New issue: label it and answer within the day |

**Hour 6–48**

- Shares in the wild: search X for `morse.iamcanturk.dev` and `MorseForge
  Daily #`. The daily share text starts with that phrase, so you can find real
  posts.
- Which share is used: compare `share_open`/`share_copy` (challenge and
  telegraph), `daily_share` and `message_create` in `/panel/`. Whichever moves
  most is the one to make easier next.
- Day-2 return: Cloudflare's visits on day 2 against day 1 tell you whether
  anyone came back. That's the number that matters, and you'll only have it for
  yourself. Don't publish it.

**What not to do in the first 48 hours:** redesign, change the copy on the
front page, or deploy anything bigger than a bug fix.

## Objections and honest answers

Short, first person, no defensiveness. If the objection is right, say so.

### "You're not a licensed operator. Why should I trust the on-air material?"

> You shouldn't, blindly. I'm not licensed, and the README says so. The codes
> follow ITU-R M.1677-1, and the marks the standard doesn't define are kept in
> a separate table. The on-air phrases and Q-codes are where I'm least sure.
> If you see something wrong, there's an issue template for exactly that, and
> I'll fix it and thank you in the release notes.

### "Why not LCWO or Morse Mania?"

> If one of those works for you, keep using it. LCWO in particular has helped
> a lot of people for a long time. MorseForge makes a different bet on the
> first week: you send from the first minute, the plan is seven short stages,
> and it runs offline in a browser without an account. It's meant to get
> someone from zero to "I know every character" without friction, not to be
> where you go for 30 WPM copy.

Don't describe either product's pricing, ads or features. You haven't verified
them today, and getting a competitor wrong in public costs more than any
comparison gains.

### "Seven days is a lie. Nobody learns Morse in a week."

> Agreed, and the plan doesn't claim that. Seven days introduces every
> character (two on day one, all 26 letters and 10 digits by day seven, about
> 2 hours 15 minutes of practice). Copying at speed takes months. The plan is
> there so the start isn't the place people quit.

### "Koch is the only right way" / "Farnsworth is wrong"

> Koch is an ordering and Farnsworth is a timing, so they aren't alternatives.
> Practice offers Koch order. The default walks the code tree by length, and
> the Farnsworth spacing can be turned off in Settings.

### "No paddles = useless for real operators"

> Fair. Today it's for beginners, and beginners mostly start on a straight
> key. Iambic support is the most-wanted open issue (#43). If you know keyer
> timing well, help is very welcome.

### "Gamification is a gimmick"

> The games are only allowed to credit a skill the player actually used.
> Signal Defender shows only the code, Morse Runner only the letter. If the
> screen did the work, the game doesn't count it. The streak counts showing
> up, not passing.

### "You say no tracking but there's Cloudflare"

> Right, and I don't say "no tracking". There's Cloudflare's cookieless Web
> Analytics and a first-party counter of event names (no URLs, no text), which
> you can switch off in Settings. /privacy/ lists what each one sees.

### "The secret message isn't secret"

> Correct, and the page says it isn't encryption. The only promise is that the
> text never reaches my server, because it lives after the #.

## Capturing feedback into GitHub issues

1. **Every actionable comment becomes an issue within the day,** with a link
   back to the comment and the right template:
   - on-air content → **On-air correction** (`content` label)
   - a learner who stopped → **Where I got stuck** (`ui` label)
   - something broken → **Bug** (`bug` label)
   - a feature request → plain issue, `enhancement`
2. **Reply in the thread with the issue link.** People see they were heard,
   and the conversation moves to where it can be tracked.
3. **Duplicates:** if five people ask for paddles, link them all to #43 and
   add one comment there summarising the demand ("asked for on HN ×3, Reddit
   ×2"). Don't open five issues.
4. **Weekly:** on Monday 2 and Monday 9 November, sort the new issues into
   "fix this week" (bugs, wrong on-air content), "next" and "not doing" (close
   with a sentence why). Thank contributors by name in the next release notes.
5. **Write down the questions you answered more than twice.** They're the
   FAQ entries and the technical article (see
   [newsletters.md](newsletters.md#a-technical-article)).
