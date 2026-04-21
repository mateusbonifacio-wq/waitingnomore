/**
 * Brain mode question bank: topics + many short multiple-choice items.
 * Loaded before content.js; exposes globalThis.__KEEL_BRAIN_BANK.
 *
 * How picks work (see content.js `pickBrainQuestion`): build the pool from
 * `ALL_QUESTIONS` whose `topic` is allowed (user `enabledTopics` — empty means
 * every topic). Drop anything in the last ~10 shown ids; if the pool is empty,
 * clear half that history and try again; then choose uniformly at random.
 */
(() => {
  const TOPIC_IDS = ["general_knowledge", "pop_culture", "science", "geography", "logic", "fun_random"];

  /** @type {Record<string, { q: string, a: [string,string,string], c: number }[]>} */
  const BY_TOPIC = {
    general_knowledge: [
      { q: "Capital of France?", a: ["Paris", "Lyon", "Nice"], c: 0 },
      { q: "How many days in a leap-year February?", a: ["28", "29", "30"], c: 1 },
      { q: "Largest ocean?", a: ["Atlantic", "Indian", "Pacific"], c: 2 },
      { q: "Which planet is known as the Red Planet?", a: ["Venus", "Mars", "Jupiter"], c: 1 },
      { q: "Frozen water is called?", a: ["Steam", "Ice", "Fog"], c: 1 },
      { q: "A decade is how many years?", a: ["5", "10", "100"], c: 1 },
      { q: "Which gas do plants absorb most?", a: ["Oxygen", "Nitrogen", "Carbon dioxide"], c: 2 },
      { q: "How many sides on a triangle?", a: ["2", "3", "4"], c: 1 },
      { q: "First U.S. president?", a: ["Lincoln", "Washington", "Jefferson"], c: 1 },
      { q: "Speed of sound faster in air or water?", a: ["Air", "Water", "Same"], c: 1 },
      { q: "Which is a mammal?", a: ["Shark", "Salmon", "Dolphin"], c: 2 },
      { q: "Paper is mainly made from?", a: ["Metal", "Wood fiber", "Sand"], c: 1 },
      { q: "Which is smallest?", a: ["Atom", "Cell", "Molecule"], c: 0 },
      { q: "Rainbow has how many classic colors (ROY G. BIV)?", a: ["5", "7", "9"], c: 1 },
      { q: "Which warms the Earth most from the Sun?", a: ["UV only", "Visible + infrared", "X-rays"], c: 1 }
    ],
    pop_culture: [
      { q: "Superman is from planet?", a: ["Mars", "Krypton", "Venus"], c: 1 },
      { q: "Harry Potter’s school?", a: ["Hogwarts", "Rivendell", "Xavier"], c: 0 },
      { q: "Beatles were from?", a: ["USA", "Australia", "UK"], c: 2 },
      { q: "Mario’s brother?", a: ["Wario", "Luigi", "Toad"], c: 1 },
      { q: "Star Wars: who is Luke’s father?", a: ["Obi-Wan", "Han", "Vader"], c: 2 },
      { q: "Which is a streaming service?", a: ["SMTP", "Netflix", "HTTP"], c: 1 },
      { q: "Batman’s city?", a: ["Metropolis", "Gotham", "Star City"], c: 1 },
      { q: "A lightsaber’s blade is made of?", a: ["Steel", "Plasma-like energy", "Wood"], c: 1 },
      { q: "Which band sang Bohemian Rhapsody?", a: ["The Beatles", "Queen", "ABBA"], c: 1 },
      { q: "SpongeBob lives in?", a: ["A pineapple", "A coconut", "A rock"], c: 0 },
      { q: "Which game has creepers?", a: ["Fortnite", "Minecraft", "Chess"], c: 1 },
      { q: "Disney mouse name?", a: ["Minnie", "Mickey", "Both are mice"], c: 1 },
      { q: "Which film has “May the Force be with you”?", a: ["Star Trek", "Star Wars", "Stargate"], c: 1 },
      { q: "Sherlock Holmes’ friend?", a: ["Watson", "Wilson", "Walton"], c: 0 }
    ],
    science: [
      { q: "H₂O is?", a: ["Salt", "Water", "Oxygen gas"], c: 1 },
      { q: "Speed of light in vacuum is?", a: ["300 km/s", "300,000 km/s", "3 m/s"], c: 1 },
      { q: "DNA shape?", a: ["Square", "Double helix", "Cube"], c: 1 },
      { q: "Which is a noble gas?", a: ["Chlorine", "Neon", "Sodium"], c: 1 },
      { q: "Photosynthesis outputs mainly?", a: ["CO₂", "Oxygen", "Gold"], c: 1 },
      { q: "Gravity on Moon vs Earth?", a: ["Stronger", "Weaker", "Same"], c: 1 },
      { q: "pH 7 is?", a: ["Acid", "Neutral", "Base"], c: 1 },
      { q: "Which particle is negative?", a: ["Proton", "Neutron", "Electron"], c: 2 },
      { q: "Kelvin is a unit of?", a: ["Pressure", "Temperature", "Speed"], c: 1 },
      { q: "Which organ pumps blood?", a: ["Liver", "Heart", "Lung"], c: 1 },
      { q: "Rust is mostly?", a: ["Iron oxide", "Gold", "Sugar"], c: 0 },
      { q: "Which wave carries sound in air?", a: ["Light", "Compression waves", "Radio only"], c: 1 },
      { q: "Which planet has rings (famous)?", a: ["Earth", "Saturn", "Mercury"], c: 1 },
      { q: "Newton’s apple story relates to?", a: ["Gravity", "Cooking", "Optics only"], c: 0 }
    ],
    geography: [
      { q: "Longest river (commonly cited)?", a: ["Amazon", "Nile", "Thames"], c: 1 },
      { q: "Australia’s capital?", a: ["Sydney", "Melbourne", "Canberra"], c: 2 },
      { q: "Which continent is the Sahara in?", a: ["Asia", "Africa", "South America"], c: 1 },
      { q: "Mount Everest is in?", a: ["Alps", "Andes", "Himalayas"], c: 2 },
      { q: "Smallest continent?", a: ["Europe", "Australia", "Antarctica"], c: 1 },
      { q: "Which ocean touches Africa’s west coast?", a: ["Arctic", "Indian", "Atlantic"], c: 2 },
      { q: "Canada’s capital?", a: ["Toronto", "Vancouver", "Ottawa"], c: 2 },
      { q: "Which country has the most people?", a: ["USA", "India", "Brazil"], c: 1 },
      { q: "Equator divides Earth into?", a: ["3 parts", "Hemispheres", "Time zones only"], c: 1 },
      { q: "Which desert is in Chile?", a: ["Sahara", "Gobi", "Atacama"], c: 2 },
      { q: "UK is made of?", a: ["One country only", "Several countries", "Two islands only"], c: 1 },
      { q: "Which line runs near 0° longitude?", a: ["Equator", "Prime Meridian", "Tropic of Cancer"], c: 1 },
      { q: "Largest country by area?", a: ["China", "Canada", "Russia"], c: 2 },
      { q: "Mediterranean touches?", a: ["Only Africa", "Europe, Africa, Asia", "Only Europe"], c: 1 }
    ],
    logic: [
      { q: "If all Bloops are Razzies and all Razzies are Lazzies, are all Bloops Lazzies?", a: ["Yes", "No", "Cannot know"], c: 0 },
      { q: "Clock shows 3:15. Angle between hands?", a: ["7.5°", "0°", "15°"], c: 0 },
      { q: "Next: 2, 6, 12, 20, ?", a: ["28", "30", "32"], c: 1 },
      { q: "All roses are flowers. This is a rose. So it is?", a: ["A flower", "Not a flower", "Unknown"], c: 0 },
      { q: "If it rains, ground is wet. Ground is wet. So?", a: ["It rained", "Maybe not rained", "No rain"], c: 1 },
      { q: "Odd one out: 2, 4, 9, 8", a: ["2", "9", "8"], c: 1 },
      { q: "Which is heavier: 1 kg iron or 1 kg cotton?", a: ["Iron", "Cotton", "Same"], c: 2 },
      { q: "Flip a fair coin twice. Two heads probability?", a: ["1/2", "1/4", "1/8"], c: 1 },
      { q: "Which is a prime?", a: ["9", "11", "15"], c: 1 },
      { q: "A says “I always lie.” Consistent?", a: ["Yes", "No paradox", "Always true"], c: 1 },
      { q: "Cube has how many faces?", a: ["4", "6", "8"], c: 1 },
      { q: "Tom is taller than Sue. Sue is taller than Pat. Is Tom taller than Pat?", a: ["Yes", "No", "Cannot tell"], c: 0 },
      { q: "Half of 30 plus 10?", a: ["25", "35", "20"], c: 0 },
      { q: "Which completes: red, orange, yellow, ?", a: ["Purple", "Green", "Pink"], c: 1 }
    ],
    fun_random: [
      { q: "How many holes in a standard round donut?", a: ["0", "1", "2"], c: 1 },
      { q: "Which is silent in “knight”?", a: ["K", "N", "G"], c: 0 },
      { q: "Rainbow unicorns are?", a: ["Scientific fact", "Fiction/meme", "Fish"], c: 1 },
      { q: "Best time for coffee?", a: ["When you need it", "Never", "Only midnight"], c: 0 },
      { q: "Which is heavier: a ton of bricks or a ton of feathers?", a: ["Bricks", "Feathers", "Same"], c: 2 },
      { q: "Is water wet?", a: ["Debate", "Usually yes", "Never"], c: 1 },
      { q: "404 means?", a: ["Found", "Not found", "Teapot"], c: 1 },
      { q: "Which is a fruit?", a: ["Tomato (culinary debate)", "Rock", "Chair"], c: 0 },
      { q: "How many letters in “queue” after Q?", a: ["0", "4", "10"], c: 1 },
      { q: "Schrödinger’s cat is?", a: ["Always alive", "Thought experiment", "A breed"], c: 1 },
      { q: "Which is luckier (superstition)?", a: ["Black cat", "Four-leaf clover", "Broken mirror"], c: 1 },
      { q: "Endless scroll is?", a: ["Always healthy", "Tiring sometimes", "Illegal"], c: 1 },
      { q: "Which is slower?", a: ["Snail mail", "Light in fiber", "Thought"], c: 0 },
      { q: "Keel helps you?", a: ["Drift calmly", "Cook pasta", "Drive"], c: 0 }
    ]
  };

  const ALL_QUESTIONS = [];
  let seq = 0;
  for (const topic of TOPIC_IDS) {
    const rows = BY_TOPIC[topic] || [];
    for (const row of rows) {
      seq += 1;
      ALL_QUESTIONS.push({
        id: `brain_${topic}_${seq}`,
        topic,
        question: row.q,
        answers: row.a,
        correct: row.c
      });
    }
  }

  globalThis.__KEEL_BRAIN_BANK = {
    TOPIC_IDS,
    ALL_QUESTIONS
  };
})();
