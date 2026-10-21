---
title: Which order should you learn Morse code in?
description: Alphabetical is the worst order to learn Morse code in. Koch and shortest-first both work, and choosing between them matters far less than avoiding A B C.
published: 2026-08-23
updated: 2026-10-21
answer: Not alphabetically. A B C D groups characters that sound alike and follows an order the code itself does not use. The two that work are Koch, which starts with two characters at full target speed and adds one each time you clear 90% accuracy, and shortest-first, which follows the code outwards from E and T. Either is fine — the gap between them is far smaller than the gap to the alphabet.
tags: [learning, technique, beginners]
---

Almost everyone starts with A. It is the worst available choice, and the reason
is not obvious until you have hit the problem.

## Why alphabetical fails

The alphabet is an ordering of _letters_. Morse is an ordering of _sounds_, and
the two have nothing to do with each other.

Learn A through F in order and you meet:

|     |        |                                    |
| --- | ------ | ---------------------------------- |
| A   | `.-`   |                                    |
| B   | `-...` |                                    |
| C   | `-.-.` |                                    |
| D   | `-..`  | sounds like B without its last dot |
| E   | `.`    |                                    |
| F   | `..-.` |                                    |

B, C and D all start with a dash and are all four or three elements long. You
are learning three confusable sounds in a row, at the exact moment you have
least ability to tell them apart. Meanwhile E — one dot, the single most common
letter in English and the easiest thing in the code — is fifth.

It gets worse further in. There is no point at which the alphabet happens to
group things sensibly, because it was never trying to.

## Koch's method

Ludwig Koch, a German psychologist, published his method in the 1930s after
testing what actually produced fluent operators rather than what seemed
reasonable. Two rules:

1. **Start at your target speed immediately.** Not slow, not building up. If
   you want to copy at 20 WPM, every character you ever hear is sent at 20 WPM
   from the first minute.
2. **Start with two characters. Add one when you can copy at 90% accuracy.**
   Usually K and M, because they are distinct and both contain dashes.

The first rule is the important one, and it is counterintuitive enough that
most people ignore it. Learning at a slow speed and building up does not work,
because slow characters are a different perceptual task — you count them rather
than recognise them, and the counting has to be
[unlearned](/blog/what-farnsworth-timing-is/) before you can go fast.

Koch's method avoids that by never letting you learn the wrong thing. It is
harder at the start and has no wall later.

The 90% rule matters too. Adding a character before the previous ones are solid
is how people end up with twenty-six characters they half-know, which is worse
than eight they know cold.

## Shortest-first

The other defensible order follows the structure of the code itself. Morse is a
binary tree — a dot goes one way, a dash goes the other — so you can walk it
layer by layer:

- **One element:** E `.`, T `-`
- **Two elements:** I, A, N, M
- **Three elements:** S, U, R, W, D, K, G, O
- **Four elements:** H, V, F, L, P, J, B, X, C, Y, Z, Q

Each layer is short, and each new character is a character you already know
plus one more element. You are never learning something unrelated to what you
learned yesterday, and the [tree](/tree/) fills in visibly as you go.

It also front-loads the useful letters. E and T are the two most common in
English; the first fourteen characters cover most of what you will actually
meet.

The trade against Koch: characters within a layer can sound similar to each
other, whereas Koch's order is chosen partly to keep consecutive additions
distinct.

## So which one

Honestly: either. The gap between Koch and shortest-first is much smaller than
the gap between either and the alphabet, and smaller again than the gap between
practising daily and not.

Pick shortest-first if you want the code to make sense as a structure rather
than a list — it is the more satisfying route, and the tree stops being a
diagram you looked at once.

Pick Koch if you want the shortest path to a specific target speed and are
willing to have a harder first week.

Both are available in [practice](/practice/), along with alphabetical, which is
there because people ask for it and the page says plainly that it is the worst
of the three.

## The rule that matters more than the order

Whichever you pick: **do not add a character until the ones you have are
automatic.** Not "I can get it if I think" — automatic, at the speed you intend
to work at.

Every ordering scheme is a way of managing that one constraint. Get it wrong
and no order saves you.
