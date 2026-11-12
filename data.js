// Quiz content. Questions and archetypes from the client brief "WHAT THE AF ARE YOU?"; public title "What's your hop-nality?" (12 Nov)
// (context/creative-brief-nov-2026.md). Questions, archetypes, result lines and the opening are
// the brief's own copy. Anything marked DRAFT is ours and needs sign-off (see the copy doc).

const SHOP = "https://hopnosis.co.za/products/";
// Result "Shop" buttons go to that flavour's 4-pack, The Quartet (R119.99): the brief's "Try your type".

window.HOPNALITY = {
  welcome: {
    title: "What's your hop-nality?",
    body: "Three flavours. Three personalities. One questionable sense of self-awareness. Seven questions. No wrong answers. Some mildly concerning revelations.",
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
      shop: SHOP + "classic-af-4-pack",
      theme: { bg: "#0d0d0d", ink: "#f4efe4", accent: "#cc8a00" },
    },
    mango: {
      name: "Mango AF",
      archetype: "The Main Character",
      line: "You don't bring the vibe. You are the vibe.",
      about:
        "Magnetic, social and always up for it. A quick drink with you turns into an entire occasion, and nobody's complaining. Ordinary plans don't stand a chance.",
      image: "assets/can-mango.jpg",
      shop: SHOP + "mango-af-4-pack",
      theme: { bg: "#ffb33f", ink: "#141414", accent: "#141414" },
    },
    lime: {
      name: "Lime AF",
      archetype: "The Wild Card",
      line: "Fresh attitude. Questionable intentions.",
      about:
        "Sharp, quick-witted and allergic to the expected. You're the reason the group chat has a separate group chat. Long story. Worth it.",
      image: "assets/can-lime.jpg",
      shop: SHOP + "ime-af-the-quartet", // sic: the shop's Lime Quartet URL is missing its "l"
      theme: { bg: "#97d700", ink: "#141414", accent: "#141414" },
    },
    unicorn: {
      name: "Unicorn AF",
      displayName: "YOU’RE UNICORN AF.",
      eyebrow: "Well, this is awkward…",
      archetype: "THE PERFECT STORM.",
      line: "The confidence of Classic. The charisma of Mango. The cheek of Lime.",
      about:
        "You’re the voice of reason and the reason everyone needs one.\n\nYou’re not one flavour. You’re the whole damn fridge.\n\nCongratulations. You’re a lot. Fortunately, we made a 4-pack.",
      image: "assets/can-unicorn.png",
      shop: SHOP + "the-middle-ground-6-can-mixed-pack",
      theme: { bg: "#0d0d0d", ink: "#f4efe4", accent: "#70e4ea" },
    },
  },

  // The client's six original questions remain verbatim. Her supplied Unicorn candidate question
  // is inserted after original Q3. Scoring is implemented in app.js exactly as the handover says.
  questions: [
    {
      q: "Friday. Your personality has officially clocked out. Where are we finding you?",
      a: [
        ["classic", "At a braai, holding the tongs. Nobody asked me to take charge."],
        ["mango", "Poolside, music on, surrounded by my favourite bad influences."],
        ["lime", "Somewhere I wasn't planning to go. Long story."],
      ],
    },
    {
      q: "Open your fridge. What are we dealing with?",
      a: [
        ["classic", "Everything in its place. Even the chaos is organised."],
        ["mango", "Leftovers, three sauces and enough drinks for unexpected guests."],
        ["lime", "Half a lime, something mysterious and absolutely no plan for dinner."],
      ],
    },
    {
      q: "Your friends have described you as...",
      a: [
        ["classic", "The one who keeps it cool when everyone else loses the plot."],
        ["mango", "The one who turns a quick drink into an entire occasion."],
        ["lime", "The reason the group chat has a separate group chat."],
      ],
    },
    {
      q: "Be honest. How many versions of you are we dealing with?",
      unicornCandidate: true,
      a: [
        ["classic", "One. Consistently cool. I know who I am."],
        ["mango", "The social version. The fun version. Both excellent company."],
        ["lime", "Depends who’s asking. And what they’ve heard."],
        ["unicorn", "Responsible adult by day. Absolute legend by night. Occasionally both before lunch."],
      ],
    },
    {
      q: "Pick your ideal sipping situation.",
      a: [
        ["classic", "Sunset, good company, something cold. Nothing complicated."],
        ["mango", "Pool party, festival, rooftop or wherever the gees is."],
        ["lime", "Post-workout, spontaneous road trip or an unexpected adventure."],
      ],
    },
    {
      q: "Someone offers you a drink you've never tried. Your reaction?",
      a: [
        ["classic", "What's in it? I have questions. And standards."],
        ["mango", "I'm in. Give me the coldest one."],
        ["lime", "Interesting. What else have you got?"],
      ],
    },
    {
      q: "Where would you most want to bump into hopnøsis?",
      analyticsOnly: true,
      a: [
        ["classic", "My favourite restaurant, bar or a proper braai."],
        ["mango", "At a festival, poolside or a weekend market."],
        ["lime", "Gym, padel court or my local convenience store."],
      ],
    },
  ],

  unicornReward: {
    title: "You’ve unlocked Unicorn status.",
    body: "Report to the hopnøsis bar. There’s a free slushie with your name on it.",
    note: "One free slushie. Zero official responsibilities. Unofficial ambassador status granted.",
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
    label: "Shop the mixed 6-pack",
    url: SHOP + "the-middle-ground-6-can-mixed-pack",
  },

  // Event badge on the welcome screen ("The House of Hops", as on Kelly's PowerHER menu).
  // Set on: false after the event and the welcome screen goes back to plain.
  event: { on: false, where: "PowerHER Fit Fest" }, // on = House of Hops neon look + event label (PowerHER, 7 Nov)

  // Optional panels under the result. Off = only "Join the Hopnotised" stays.
  panels: { nail: false, mixed: false, insight: false },

  heroLine: "A drink that behaves. Even if you don't.",
  signOff: "SIP HAPPENS™",
  handle: "@hopnosis_official", // Instagram, from the 5 Nov creator DMs in the Blueprint
  hashtags: "#hopnosis #SipHappens",
};
