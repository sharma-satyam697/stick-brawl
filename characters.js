// =====================================================================
//  STICK BRAWL: EDIT YOUR 10 FIGHTERS HERE
// =====================================================================
//  Photos: put face photos in the "photos" folder, named 1.jpg ... 10.jpg
//  (.png, .jpeg and .webp also work). Photo 1 goes to fighter 1, and so on.
//  Square photos with the face in the middle work best.
//  A fighter with no photo gets a simple drawn face.
//
//  Each fighter has 3 super powers:
//    power 1 costs 1 bar of the super meter
//    power 2 costs 2 bars
//    power 3 costs the full meter (3 bars) and is the strongest
//
//  "type" decides what a power does. Choose from:
//    projectile  shoots something forward   (optional: count, glyph, spin)
//    freeze      shot that freezes the enemy (optional: glyph)
//    rain        things fall from the sky   (optional: glyph)
//    dash        fast rush punch
//    slam        jump and smash the ground; a shockwave runs along the floor
//    lightning   lightning hits where the enemy stands (dodge it by moving)
//    beam        big laser
//    tornado     tornado that moves forward and lifts the enemy
//    blackhole   pulls the enemy in, then explodes
//    teleport    appears behind the enemy and punches (cannot be blocked)
//    heal        gives back health
//    shield      blocks all damage for a few seconds
//    giant       grows big and hits much harder for a few seconds
//    speed       moves and attacks faster for a few seconds
//
//  "color" is optional for each power. "glyph" is a symbol the power uses,
//  like "♥" or "★".
// =====================================================================

window.ROSTER = [
  { name: "Blaze", color: "#ff6a3d", supers: [
    { name: "Fireball", type: "projectile" },
    { name: "Flame Dash", type: "dash" },
    { name: "Meteor Shower", type: "rain", color: "#ffb03b" } ] },

  { name: "Frost", color: "#6fd6ff", supers: [
    { name: "Ice Shard", type: "freeze", glyph: "❄" },
    { name: "Ice Armor", type: "shield" },
    { name: "Blizzard", type: "rain", glyph: "❄" } ] },

  { name: "Volt", color: "#ffe14d", supers: [
    { name: "Zap Speed", type: "speed" },
    { name: "Thunder Strike", type: "lightning" },
    { name: "Railgun", type: "beam" } ] },

  { name: "Cupid", color: "#ff5c9d", supers: [
    { name: "Love Arrow", type: "projectile", glyph: "♥" },
    { name: "Love Potion", type: "heal", glyph: "♥" },
    { name: "Heart Storm", type: "rain", glyph: "♥" } ] },

  { name: "Tank", color: "#8fe36b", supers: [
    { name: "Shoulder Charge", type: "dash" },
    { name: "Hulk Mode", type: "giant" },
    { name: "Earthquake", type: "slam" } ] },

  { name: "Shadow", color: "#b07cff", supers: [
    { name: "Dark Orbs", type: "projectile", count: 3 },
    { name: "Shadow Step", type: "teleport" },
    { name: "Black Hole", type: "blackhole" } ] },

  { name: "Storm", color: "#5ff0c8", supers: [
    { name: "Wind Blade", type: "projectile", glyph: "✦", spin: true },
    { name: "Tailwind", type: "speed" },
    { name: "Tornado", type: "tornado" } ] },

  { name: "Sugar", color: "#ffa5e8", supers: [
    { name: "Gum Bubble", type: "freeze", glyph: "●" },
    { name: "Choco Lava Cake", type: "heal", glyph: "♥" },
    { name: "Candy Rain", type: "rain", glyph: "✿" } ] },

  { name: "Ninja", color: "#e9e9f2", supers: [
    { name: "Shuriken", type: "projectile", count: 3, glyph: "✦", spin: true },
    { name: "Smoke Bomb", type: "teleport" },
    { name: "Thousand Cuts", type: "dash" } ] },

  { name: "Nova", color: "#ffd27a", supers: [
    { name: "Star Shot", type: "projectile", glyph: "★" },
    { name: "Falling Stars", type: "lightning" },
    { name: "Supernova", type: "blackhole" } ] },
];
