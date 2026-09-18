/** The four challenges. Copy comes straight from the event brief. */

export const ACTIVITIES = [
  {
    id: 'captcha',
    no: '01',
    name: 'OFFLINE CAPTCHA',
    tagline: 'ARE YOU HUMAN?',
    blurb: 'Prove your mind is not a machine. A timed physical logic challenge judged on the spot.',
    metric: 'SCORE',
    recordHint: 'Completed challenge + time taken + difficulty. Higher score wins.',
  },
  {
    id: 'consoles',
    no: '02',
    name: 'COMPETITIVE CONSOLES!',
    tagline: 'OUTRUN THE MACHINE',
    blurb: 'A console race against the clock. The judge runs the timer; you beat it.',
    metric: 'TIME',
    recordHint: 'Success or failure, then the official race time. Lowest time wins.',
  },
  {
    id: 'turing',
    no: '03',
    name: 'TURING TIME',
    tagline: 'CAN YOU TELL HUMAN FROM AI?',
    blurb: 'Three rounds. Two responses each. Pick the one written by a human.',
    metric: 'ROUNDS',
    recordHint: 'Correct out of three. Two or more passes.',
  },
  {
    id: 'hearing',
    no: '04',
    name: 'HELLO, CAN YOU HEAR ME?',
    tagline: 'THE MACHINE SPEAKS',
    blurb: 'Headphones on. Identify what the machine is saying before it stops talking.',
    metric: 'SCORE',
    recordHint: 'Correct identification + time taken. Higher score wins.',
  },
];

export const ACTIVITY_IDS = ACTIVITIES.map((a) => a.id);

export const ACTIVITY_BY_ID = ACTIVITIES.reduce((acc, a) => {
  acc[a.id] = a;
  return acc;
}, {});

export const JUDGES = ['Sathvik', 'Vishnu', 'Shruti', 'Hasini', 'Koushik', 'Rishi'];

export const MAX_COMPLETIONS = ACTIVITIES.length;
