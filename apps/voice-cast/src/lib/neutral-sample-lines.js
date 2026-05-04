const OPENINGS = [
  'The hallway is quiet this afternoon.',
  'A notebook rests beside the keyboard.',
  'The train arrives a few minutes early.',
  'Sunlight touches the corner of the table.',
  'A glass of water sits near the lamp.',
  'The elevator opens on an empty floor.',
  'Someone left the window slightly open.',
  'The receipt folds neatly into a pocket.',
  'A small fan turns in the background.',
  'The first page lies flat on the desk.',
  'The coffee has cooled enough to drink.',
  'A soft shadow moves across the wall.',
  'The keys are exactly where they were.',
  'A stack of papers leans to one side.',
  'The garden path stays dry after the rain.',
  'A bicycle waits near the front gate.',
  'The screen dims for a moment and returns.',
  'The shop door closes with a light click.',
  'A plain envelope sits at the center of the shelf.',
  'The room smells faintly of soap and wood.',
];

const DETAILS = [
  'Nothing urgent happens in the next minute.',
  'The scene stays the same for a little while.',
  'Everything remains easy to follow.',
  'There is enough time to look around once more.',
  'The pace stays even from start to finish.',
];

const CLOSINGS = [
  'The next step can wait until you are ready.',
  'No one needs to rush the moment.',
  'It feels ordinary in a useful way.',
  'The day continues without interruption.',
  'The details stay clear and simple.',
];

export const NEUTRAL_SAMPLE_LINES = OPENINGS.flatMap((opening, openingIndex) =>
  DETAILS.map((detail, detailIndex) => {
    const line = `${opening} ${detail}`;
    if ((openingIndex + detailIndex) % 3 === 0) {
      return `${line} ${CLOSINGS[(openingIndex + detailIndex) % CLOSINGS.length]}`;
    }
    return line;
  }),
);

export function getNextNeutralSampleIndex(currentIndex) {
  if (!NEUTRAL_SAMPLE_LINES.length) {
    return 0;
  }

  return (currentIndex + 1) % NEUTRAL_SAMPLE_LINES.length;
}
