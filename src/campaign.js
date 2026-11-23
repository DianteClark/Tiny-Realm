// The Drowned Crown (3.4): an eight chapter story told across named islands on the sea chart.
// Each chapter is a fixed island with its own story beat before and after, ending with the Troll King.

export const CHAPTERS = [
  {
    name: 'Saltholm Landing', region: 'goblin', level: 2, need: 0,
    intro: 'A bottle washes up on your shore. Inside, a scrap of map and a single line: "The crown of the Sea Kings did not drown. It was taken." Goblins on Saltholm were seen with the rest of the map.',
    outro: 'Among the goblin loot: a torn chart, marked with a crown and a trail of islands. Someone has been hunting for this for a long time.',
  },
  {
    name: 'Briar Reach', region: 'gnome', level: 4, need: 2,
    intro: 'The chart leads to Briar Reach, where gnomes have dug tunnels under every tree. Their elders keep a carved stone with a second piece of the trail.',
    outro: 'The stone reads: "Where the bull guards the bones, the way goes down." The gnomes say no one who went looking ever came back.',
  },
  {
    name: 'Fang Bluff', region: 'badlands', level: 6, need: 4, boss: 'minotaur',
    intro: 'Fang Bluff is a maze of red rock. Gnolls say a Minotaur sleeps on a pile of old bones there, and that the bones wear crowns.',
    outro: 'Under the Minotaur\'s bed: the bones of an old Sea King, his crown gone. Scratched into the stone beside him: "The Troll took it to the throne beneath the waves."',
  },
  {
    name: 'Murk Shoal', region: 'reef', level: 8, need: 6,
    intro: 'Only the sharks of Murk Shoal know the way to the drowned throne, and they do not share. Their harpooners have sunk every boat that tried.',
    outro: 'A captured harpoon is carved with a map of currents. One of them runs straight down, into dark water near the Skull Crypts.',
  },
  {
    name: 'The Ashen Crypt', region: 'crypt', level: 10, need: 9,
    intro: 'The current ends at a crypt where the dead keep watch and shamans whisper. They serve someone. They are expecting you.',
    outro: 'A dying shaman laughs: "The King under the sea sends his regards. He has seen your little realm. He wants it."',
  },
  {
    name: 'Cinder Spire', region: 'badlands', level: 12, need: 12, boss: 'moonbear',
    intro: 'The Troll King has an ally: the Moonhide Bear, who guards the spire where the drowned throne\'s key is kept.',
    outro: 'The key is a huge iron ring, warm to the touch. Somewhere to the west, something very large has woken up.',
  },
  {
    name: 'Raven Skerry', region: 'reef', level: 14, need: 15, boss: 'turtle',
    intro: 'The last island before the throne. An ancient turtle sleeps across the only passage, and the King\'s sharks guard its shell.',
    outro: 'The passage is open. Below the waves, torches burn in a hall that should be dark. The King is waiting.',
  },
  {
    name: 'The Drowned Throne', region: 'crypt', level: 17, need: 18, boss: 'trollking', final: true,
    intro: 'The Troll King sits on a throne of wrecks, wearing the crown of the Sea Kings. Every raid you have ever fought, he sent. End it.',
    outro: 'The Troll King falls and the crown rolls to your feet. The sea is quiet for the first time in a hundred years. The realm has a true crown again.',
  },
];

export function chapterState(S) { return S.story || (S.story = { done: 0 }); }
export function nextChapter(S) { const d = chapterState(S).done; return d < CHAPTERS.length ? d : -1; }
export function chapterOpen(S, i) { return i === nextChapter(S) && (S.cleared || 0) >= CHAPTERS[i].need; }
