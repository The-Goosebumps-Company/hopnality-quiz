// Quiz content. Source of truth: the client brief "WHAT THE AF ARE YOU?"
// (context/creative-brief-nov-2026.md). Questions, archetypes, result lines and the opening are
// the brief's own copy. Anything marked DRAFT is ours and needs sign-off (see the copy doc).

const SHOP = "https://hopnosis.co.za/products/";

window.HOPNALITY = {
  welcome: {
    title: "What the AF are you?",
    body: "Three flavours. Three personalities. One questionable sense of self-awareness. Six questions. No wrong answers. Some mildly concerning revelations.",
  },

  flavours: {
    classic: {
      name: "Classic AF",
      archetype: "The Smooth Operator",
      line: "Not everyone's cup of tea. Luckily, you're not tea.",
      // DRAFT: the brief asks for a witty 2–3 sentence description per result.
      about:
        "You keep it cool when everyone else loses the plot. Good taste, zero need to announce it. Pure hops, no fruit, no fuss, which suits you fine.",
      image: "assets/can-classic.jpg",
      shop: SHOP + "classic-af-6-pack",
      theme: { bg: "#0d0d0d", ink: "#f4efe4", accent: "#cc8a00" },
    },
    mango: {
      name: "Mango AF",
      archetype: "The Main Character",
      line: "You don't bring the vibe. You are the vibe.",
      about:
        "Magnetic, social and always up for it. A quick drink with you turns into an entire occasion, and nobody's complaining. Ordinary plans don't stand a chance.",
      image: "assets/can-mango.jpg",
      shop: SHOP + "mango-af-6-pack",
      theme: { bg: "#ffb33f", ink: "#141414", accent: "#141414" },
    },
    lime: {
      name: "Lime AF",
      archetype: "The Wild Card",
      line: "Fresh attitude. Questionable intentions.",
      about:
        "Sharp, quick-witted and allergic to the expected. You're the reason the group chat has a separate group chat. Long story. Worth it.",
      image: "assets/can-lime.jpg",
      shop: SHOP + "lime-af-6-pack",
      theme: { bg: "#97d700", ink: "#141414", accent: "#141414" },
    },
  },

  // The brief's six questions. A = Classic, B = Mango, C = Lime; answers are shuffled on screen.
  // Weight: the brief says personality-led answers count more than occasion/channel answers,
  // so Q4 (sipping situation) and Q6 (where to bump into us) count 1, the rest count 2.
  // Total is 10 points, so a three-way tie can't happen; two-way ties go to a showdown.
  questions: [
    {
      q: "Friday. Your personality has officially clocked out. Where are we finding you?",
      weight: 2,
      a: [
        ["classic", "At a braai, holding the tongs. Nobody asked me to take charge."],
        ["mango", "Poolside, music on, surrounded by my favourite bad influences."],
        ["lime", "Somewhere I wasn't planning to go. Long story."],
      ],
    },
    {
      q: "Open your fridge. What are we dealing with?",
      weight: 2,
      a: [
        ["classic", "Everything in its place. Even the chaos is organised."],
        ["mango", "Leftovers, three sauces and enough drinks for unexpected guests."],
        ["lime", "Half a lime, something mysterious and absolutely no plan for dinner."],
      ],
    },
    {
      q: "Your friends have described you as…",
      weight: 2,
      a: [
        ["classic", "The one who keeps it cool when everyone else loses the plot."],
        ["mango", "The one who turns a quick drink into an entire occasion."],
        ["lime", "The reason the group chat has a separate group chat."],
      ],
    },
    {
      q: "Pick your ideal sipping situation.",
      weight: 1,
      a: [
        ["classic", "Sunset, good company, something cold. Nothing complicated."],
        ["mango", "Pool party, festival, rooftop or wherever the gees is."],
        ["lime", "Post-workout, spontaneous road trip or an unexpected adventure."],
      ],
    },
    {
      q: "Someone offers you a drink you've never tried. Your reaction?",
      weight: 2,
      a: [
        ["classic", "What's in it? I have questions. And standards."],
        ["mango", "I'm in. Give me the coldest one."],
        ["lime", "Interesting. What else have you got?"],
      ],
    },
    {
      q: "Where would you most want to bump into hopnøsis?",
      weight: 1,
      a: [
        ["classic", "My favourite restaurant, bar or a proper braai."],
        ["mango", "At a festival, poolside or a weekend market."],
        ["lime", "Gym, padel court or my local convenience store."],
      ],
    },
  ],

  // Tie-break (the brief: "a predetermined tie-break question or rule"). DRAFT copy.
  // Keyed by the two tied flavours, sorted alphabetically. Only the tied two appear.
  showdowns: {
    "lime-mango": {
      q: "Too close to call. Pick a plan.",
      a: [
        ["mango", "Make it an occasion."],
        ["lime", "Make it up as we go."],
      ],
    },
    "classic-lime": {
      q: "Too close to call. Pick a move.",
      a: [
        ["classic", "Stay cool."],
        ["lime", "Go rogue."],
      ],
    },
    "classic-mango": {
      q: "Too close to call. Pick an entrance.",
      a: [
        ["classic", "Quietly. They'll notice."],
        ["mango", "Loudly. They'll remember."],
      ],
    },
  },

  // After the result (the brief's "optional insight capture" and commercial CTA).
  insight: {
    title: "Before you disappear into the wild…",
    ageBands: ["Under 18", "18–24", "25–34", "35–44", "45–54", "55+"],
    cities: ["Johannesburg", "Pretoria", "Cape Town", "Durban", "Gqeberha", "Bloemfontein", "Somewhere else"],
    channels: [
      ["supermarket", "Supermarket"],
      ["gym", "Gym or padel"],
      ["bars", "Restaurants and bars"],
      ["convenience", "Petrol or convenience store"],
      ["events", "Festivals and events"],
      ["online", "Online"],
    ],
  },
  mixed: {
    line: "Think we got you wrong? Try all three and argue with the algorithm.",
    // The brief names a "Mixed AF 4-pack", but the shop has no such product (checked 6 Nov).
    // The nearest is The Middle Ground (6 Can Mixed Pack), R179.99. Swap when a mixed 4-pack exists.
    label: "Try all three: the mixed 6-pack",
    url: SHOP + "the-middle-ground-6-can-mixed-pack",
  },

  heroLine: "A drink that behaves. Even if you don't.",
  signOff: "SIP HAPPENS™",
  handle: "@hopnosis_official", // Instagram, from the 5 Nov creator DMs in the Blueprint
  hashtags: "#hopnosis #SipHappens",
};
