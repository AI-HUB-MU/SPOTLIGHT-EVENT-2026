/**
 * TURING TIME round bank.
 * Each round shows OPTION A / OPTION B. Exactly one of them was written by a
 * human. `human: 'A' | 'B'` is the answer key - the judge sees it and confirms.
 *
 * Deliberately kept in code (not Firestore): zero reads, works even if the
 * database is slow, and it never needs to change mid-event.
 */

export const TURING_ROUNDS = [
  {
    id: 'r1',
    prompt: 'A friend asks: "why does the sky turn orange at sunset?"',
    a: {
      by: 'AI',
      text: 'The sky turns orange at sunset because sunlight travels a longer path through the atmosphere, causing shorter wavelengths to be scattered away and longer wavelengths to dominate. This is referred to as Rayleigh scattering. Consequently, the observer perceives a reddish-orange hue.',
    },
    b: {
      by: 'HUMAN',
      text: 'lol because at sunset the light has to cut through way more air to reach you, so all the blue gets bounced away and only the orange/red is left. same reason sunsets look better after rain imo',
    },
    human: 'B',
  },
  {
    id: 'r2',
    prompt: 'Reply to: "my code works but I have no idea why"',
    a: {
      by: 'HUMAN',
      text: "that's the worst feeling. honestly either comment it now while it's fresh or you're going to be staring at that block in 3 months like it's someone else's code",
    },
    b: {
      by: 'AI',
      text: 'It is recommended to document the code while the reasoning is still clear. Adding comments that explain the intent reduces future maintenance cost and prevents regressions when the code is modified later.',
    },
    human: 'A',
  },
  {
    id: 'r3',
    prompt: 'Someone says: "I think I saw a UFO last night"',
    a: {
      by: 'AI',
      text: 'There are many identifiable phenomena that can be mistaken for unidentified flying objects, including satellites, weather balloons, drones, atmospheric refraction, and aircraft landing lights. Recording the time and direction usually allows identification.',
    },
    b: {
      by: 'HUMAN',
      text: 'ok but did it wobble?? every balloon story is the same until you tell me it actually changed direction. where were you standing',
    },
    human: 'B',
  },
  {
    id: 'r4',
    prompt: 'Reply to: "should I drop out and start a startup?"',
    a: {
      by: 'HUMAN',
      text: "build the thing at 2am for three weeks first. if you still want it after that, drop out. if you got bored on day 4, you don't want a startup you want an escape",
    },
    b: {
      by: 'AI',
      text: 'That decision depends on several factors: the strength of your prototype, available runway, willingness to accept risks, and whether your idea solves a validated problem. Consider discussing it with a mentor before making irreversible changes.',
    },
    human: 'A',
  },
  {
    id: 'r5',
    prompt: 'Someone asks: "what is the point of the `volatile` keyword?"',
    a: {
      by: 'AI',
      text: 'The volatile keyword informs the compiler that the value of a variable may change at any time without any action being taken by the code the compiler finds nearby. It prevents certain optimisations such as caching the variable in a register.',
    },
    b: {
      by: 'HUMAN',
      text: "it's basically telling the compiler 'stop being clever, this memory can change behind your back'. doesn't make it thread-safe though, that's the trap everyone falls into",
    },
    human: 'B',
  },
  {
    id: 'r6',
    prompt: 'Reply to: "our demo crashed in front of the judges"',
    a: {
      by: 'HUMAN',
      text: 'pain. was it the network or did the thing actually die? because if it was wifi you can literally just say that next time and run it off a hotspot',
    },
    b: {
      by: 'AI',
      text: 'Demo failures are common and manageable. The most effective mitigation is to prepare an offline fallback, record a backup demonstration video, and rehearse the critical path multiple times in the exact environment where it will be presented.',
    },
    human: 'A',
  },
];

/**
 * Pick `count` distinct rounds, stable per roll number so the same participant
 * gets the same set if they refresh mid-round.
 */
export function roundsForRoll(rollId, count = 3) {
  const list = TURING_ROUNDS.slice();
  // FNV-1a style seed: deterministic, dependency free.
  let seed = 2166136261;
  const key = String(rollId || 'x');
  for (let i = 0; i < key.length; i += 1) {
    seed ^= key.charCodeAt(i);
    seed = Math.imul(seed, 16777619) >>> 0;
  }
  for (let i = list.length - 1; i > 0; i -= 1) {
    seed = (Math.imul(seed, 48271) + 11) >>> 0;
    const j = seed % (i + 1);
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list.slice(0, Math.max(1, Math.min(count, list.length)));
}
