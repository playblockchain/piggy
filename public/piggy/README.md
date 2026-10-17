# Lil Piggy — character expression sheet

Every state the app can render. Drop a file here named exactly as the first
column and it replaces the vector stand-in immediately. Any of `.png` `.webp`
`.svg` `.jpg` `.gif`. Square art, transparent or pale pink background.

**Scenario art beats mood art.** `raiding_savings.png` wins over `sad.png`, so
you can ship the seven moods first and add scenarios as they're drawn. A state
with no file keeps its vector, so nothing ever breaks.

---

## Moods — the face. How he feels about you.

These are the fallback whenever there's no scenario art.

| File | When it fires | Pose |
|---|---|---|
| `proud.png` | mostly staked or stable, nothing silly | crown, full size, strutting, sparkles |
| `excited.png` | buying on a rhythm, or properly staking | eyes shut, beaming, tiny hop, hearts |
| `happy.png` | most of the money working | soft smile, content, one blush deeper |
| `curious.png` | can't read the wallet, or it's empty | head tilt, wide shiny eyes, `?` above |
| `suspicious.png` | mixed habits, could go either way | narrowed eyes, side-eye, flat mouth, `...` |
| `sad.png` | over half in dog coins | tears, shrinking, lying down |
| `unhinged.png` | nearly everything on one bet | spiral eyes, smallest size, tinfoil, static |

## Scenarios — the props. What you actually did.

| File | When it fires | Pose |
|---|---|---|
| `dca_saving.png` | regular buys, evenly spaced over weeks | one coin dropping into the slot on his back, pleased |
| `staking_yield.png` | a real share staked | spa robe, cucumber slices on the eyes, two curls of steam |
| `healthy_portfolio.png` | spread sensibly, nothing wild | crown, neat coin stacks **both sides, matched height** |
| `buying_memecoins.png` | most of the balance in long-tail tokens | clutching a phone, tongue out, coins escaping upward |
| `perps_leverage.png` | open perps positions | tinfoil hat, spiral eyes, faint sweat |
| `gambling.png` | open prediction-market positions | fan of playing cards, one bead of sweat, forced grin |
| `raiding_savings.png` | unstaking, or selling stables in a swap | cracked jar tipped over, coins spilling, tearful |
| `empty_wallet.png` | nothing in the wallet at all | tiny, hopeful, three specks of dust, nothing else |

---

## Notes from the first pass

Things the vector stand-ins got wrong, worth avoiding in the real art:

- **Ears must read as ears.** Pointed triangles at small sizes looked like coins
  stuck to his head. Floppy and rounded, with a clear pink inner.
- **Coins come in matched pairs.** One side had two and the other had one, which
  read as a mistake rather than a stack.
- **Every state needs a distinct silhouette.** Several moods differed only by eyes,
  so at card size they looked like the same pig. The prop, the posture and the
  size should all be doing work, not just the face.

## Generating these

`brand.md` §17 has the house image prompt. Subject line per file, e.g.:

> a small round pig with a cracked jar tipped over beside him, coins spilling
> out, looking tearful

Keep one outline weight, flat pastel fills, pink cheek ovals, hard pink shadow
down-left. No cats, no gradients, no text in the image.
