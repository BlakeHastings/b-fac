// Reads the two lines SKILL.md already requires at the end of every turn.
//
// THE FORMAT WAS SPECIFIED FOR THIS AND NOTHING EVER READ IT
// "Before you stop" mandates these, verbatim, as the last thing in the message:
//
//   Next: dispatching #41 and #43 as one wave, briefs below.
//   Blocked on: warn-or-block on an expired licence. Owner. Asked in #52.
//     Meanwhile: #42 does not touch that path, so it goes out in this wave.
//
// and justifies the rigidity by saying "a turn missing one is countable
// afterwards and a disposition is not". Nobody was counting. This file is the
// counter, so the format finally buys what it was priced at.
//
// IT REPORTS WHAT IT FOUND, NEVER WHAT IT GUESSED
// A parser over model output is reading a claim, not a fact, so every field it
// cannot fill stays null rather than being inferred. `blocked` with no
// `answerer` is a blocker nobody was assigned, which is a real finding about
// the turn and not a defect in the parse. The front end shows the gap; it does
// not fill it.
//
// THE MISSING LINE IS THE INTERESTING CASE
// A turn with neither line is the failure the skill mined twenty-one times: a
// status update that reads as a finished turn while unblocked work sits there.
// So `present` is part of the result, and a turn that skipped the format is
// recorded as having skipped it rather than as having nothing to say.

const NOTHING = /^(nothing|none|n\/a)\b[.!]?$/i

// Fenced blocks, list bullets and bold markers all survive into
// `last_assistant_message`, and an agent that formats its report slightly
// differently should still be counted. Everything here is cosmetic stripping;
// no line is invented or reordered.
function tidy(line) {
  return line
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/^\s*`{3,}.*$/, '')
    .replace(/\r$/, '')
}

function issueRefs(text) {
  const found = new Set()
  for (const match of text.matchAll(/#(\d+)\b/g)) found.add(match[1])
  return [...found]
}

// "Owner." and "The owner can answer" both mean the same thing, and anything
// else is left alone rather than being forced into a taxonomy this file does
// not own.
function answererOf(text) {
  if (/\bowner\b/i.test(text)) return 'owner'
  if (/\b(you|the human|the user)\b/i.test(text)) return 'owner'
  return null
}

function askedInOf(text) {
  const match = text.match(/\basked\s+(?:in|at|on)\s+#?(\d+)/i)
  return match ? match[1] : null
}

// The format packs three things onto one line: the question, who can answer it,
// and where it was asked. Splitting them is not tidiness, it is what makes the
// cross-check in view.mjs work at all.
//
// A declared need carries the question alone, because a human typed it into
// `factory ask`. A derived blocker carries the question plus "Owner. Asked in
// #52." If the metadata stays attached, the two never match on text and the
// same open question shows up twice: once as filed and once as restated, with
// nothing saying they are the same thing. Measured on exactly that pair.
//
// The issue numbers matter for the same reason. "Asked in #52" means the
// question lives in item 52, not that it blocks item 52, and reading it as the
// second puts a false dependency on the page.
function splitBlocker(body) {
  let rest = body
  const askedIn = askedInOf(rest)
  rest = rest.replace(/[,;.]?\s*\basked\s+(?:in|at|on)\s+#?\d+\b[.!]?/i, '')

  const answerer = answererOf(rest)
  // Only a standalone attribution is removed. "the owner's retention policy" is
  // part of the question and stays, which is why this matches a whole sentence
  // rather than the word.
  //
  // End-of-string has to terminate it as well as a full stop. Stripping "Asked
  // in #52." first takes the punctuation that used to follow "Owner" with it,
  // so by the time this runs the attribution is very often the last thing on
  // the line with nothing after it. Requiring a trailing stop left "Owner"
  // welded to the question and the cross-check silently stopped matching.
  rest = rest.replace(/(?:^|[.;]\s*)(the\s+)?(owner|you|the human|the user)\s*(?=[.;]|$)/i, ' ')

  // Removing a clause leaves its punctuation and its spaces behind, so the
  // cleanup runs until nothing is left to strip rather than once in a fixed
  // order. A single trailing space here is not cosmetic: the question text is
  // the identity used to match a filed need against a restated one.
  const question = rest
    .replace(/\s+/g, ' ')
    .replace(/\s*([,;.])\s*$/g, '')
    .trim()
    .replace(/[,;.]+$/, '')
    .trim()
  return {
    question: question || body.trim(),
    answerer,
    askedIn,
    blocks: issueRefs(question),
  }
}

export function parseTurn(message) {
  const result = {
    present: { next: false, blocked: false },
    next: null,
    nextIsNothing: false,
    blockers: [],
  }
  if (typeof message !== 'string' || !message.trim()) return result

  const lines = message.split('\n').map(tidy)
  let current = null

  for (const raw of lines) {
    const nextMatch = raw.match(/^\s*Next\s*:\s*(.*)$/i)
    if (nextMatch) {
      result.present.next = true
      const body = nextMatch[1].trim()
      result.next = body || null
      result.nextIsNothing = NOTHING.test(body)
      current = null
      continue
    }

    const blockedMatch = raw.match(/^\s*Blocked\s+on\s*:\s*(.*)$/i)
    if (blockedMatch) {
      result.present.blocked = true
      const body = blockedMatch[1].trim()
      current = null
      if (!body || NOTHING.test(body)) continue
      current = { ...splitBlocker(body), meanwhile: null }
      result.blockers.push(current)
      continue
    }

    // Indentation is what the format uses to attach a Meanwhile to the blocker
    // above it, but an agent that loses the indent still means the same thing,
    // so the attachment is positional rather than whitespace-sensitive.
    const meanwhileMatch = raw.match(/^\s*Meanwhile\s*:\s*(.*)$/i)
    if (meanwhileMatch && current) {
      current.meanwhile = meanwhileMatch[1].trim() || null
    }
  }

  return result
}

// A stable identity for a blocker across turns, so the same open question
// reported in five consecutive turns is one row in the front end rather than
// five. The question text is the identity because it is the only part an agent
// restates consistently; an issue number would be better and is often absent.
export function blockerKey(blocker) {
  return blocker.question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 120)
}

export const _test = { tidy, answererOf, askedInOf, issueRefs, splitBlocker }
