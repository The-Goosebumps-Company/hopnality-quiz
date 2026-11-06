// Quiz content. Source of truth for copy: context/hopnality-quiz-copy.md (v0.1, not signed off).
// Change copy there first, then mirror it here.

const SHOP = "https://hopnosis.co.za/products/";

window.HOPNALITY = {
  flavours: {
    classic: {
      name: "Classic AF",
      title: "the original",
      words: "Original. Funky. Unbothered.",
      wink: "Never followed a trend. Started a few.",
      about:
        "You were into it before it was a thing, and you're not going to make a big deal about it. Pure hops, no fruit, no filter. You don't need extras to be interesting. You are the extra.",
      image: "assets/can-classic.jpg",
      shop: SHOP + "classic-af-6-pack",
      theme: { bg: "#0d0d0d", ink: "#f4efe4", accent: "#cc8a00" },
    },
    mango: {
      name: "Mango AF",
      title: "the chilled one",
      words: "Sunny. Smooth. Unhurried.",
      wink: "Five minutes away. Since 2019.",
      about:
        "Fruity, chilled and impossible to stress out. You bring the good mood, the cooler box and zero urgency. Plans are more of a suggestion. Somehow everything still works out.",
      image: "assets/can-mango.jpg",
      shop: SHOP + "mango-af-6-pack",
      theme: { bg: "#ffb33f", ink: "#141414", accent: "#141414" },
    },
    lime: {
      name: "Lime AF",
      title: "the responsible one (allegedly)",
      words: "Bright. Zesty. Sharp.",
      wink: "The responsible one. Allegedly.",
      about:
        "You booked the table, made the group chat and remembered the ice. Sharp wit, sharper plans. Everyone thinks you've got it together. You let them.",
      image: "assets/can-lime.jpg",
      shop: SHOP + "lime-af-6-pack",
      theme: { bg: "#97d700", ink: "#141414", accent: "#141414" },
    },
  },

  // Each answer scores one point for its flavour. Answers are shuffled on screen.
  questions: [
    {
      q: "It's Friday, 5pm. You're…",
      a: [
        ["classic", "Already at the spot everyone discovers next year."],
        ["mango", "Horizontal. Somewhere with a view."],
        ["lime", "Sending the group chat a plan. With times."],
      ],
    },
    {
      q: "In the group chat, you're…",
      a: [
        ["classic", "The one with the stories nobody believes."],
        ["mango", "“Five minutes away.”"],
        ["lime", "The one who actually booked the table."],
      ],
    },
    {
      q: "At the braai, you're…",
      a: [
        ["classic", "On the tongs. Nobody else touches the tongs."],
        ["mango", "In the camping chair. Supervising."],
        ["lime", "The one who remembered the firelighters, the ice and the salad."],
      ],
    },
    {
      q: "Your camera roll is mostly…",
      a: [
        ["classic", "Gigs, sunsets and one blurry photo you swear was iconic."],
        ["mango", "The beach. The same beach. Every angle."],
        ["lime", "Screenshots of things you'll definitely get to."],
      ],
    },
    {
      q: "The 3am text. You…",
      a: [
        ["classic", "Send it. Own it."],
        ["mango", "Were asleep by ten. Unbothered."],
        ["lime", "Type it, delete it, feel quietly superior."],
      ],
    },
    {
      q: "Dezemba plans?",
      a: [
        ["classic", "A road trip, a festival and a story for the ages."],
        ["mango", "Coast. Cooler box. Do not disturb."],
        ["lime", "Booked in July. Packing list laminated."],
      ],
    },
    {
      q: "Pick a soundtrack.",
      a: [
        ["classic", "Something with bass you feel in your chest."],
        ["mango", "Amapiano at sunset."],
        ["lime", "A podcast on 1.5x speed."],
      ],
    },
  ],

  // Tie-break. 7 points over 3 flavours means the only possible tie is 3-3-1.
  // Keyed by the two tied flavours, sorted alphabetically. Only the tied two appear.
  showdowns: {
    "lime-mango": {
      q: "Last one. Pick a mood.",
      a: [
        ["lime", "Running the plan."],
        ["mango", "Running late."],
      ],
    },
    "classic-lime": {
      q: "Last one. Pick a role.",
      a: [
        ["lime", "The organiser."],
        ["classic", "The legend."],
      ],
    },
    "classic-mango": {
      q: "Last one. Pick a pace.",
      a: [
        ["mango", "Slow and sunny."],
        ["classic", "Loud and late."],
      ],
    },
  },

  heroLine: "A drink that behaves. Even if you don't.", // if/when wording still open
  signOff: "SIP HAPPENS™",
  handle: "@hopnosis_official", // Instagram, from the 5 Nov creator DMs in the Blueprint
  hashtags: "#hopnosis #SipHappens",
};
