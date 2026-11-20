// Meridian Heat — static game data: city layout, missions, dialogue.
// Original content: Port Meridian, Jace Marlowe, Mara Quinn.

export const CITY = {
  // Road grid: roads run at these coordinates; blocks sit between them.
  roads: [-160, -120, -80, -40, 0, 40, 80, 120, 160],
  roadHalf: 5,          // half-width of a road
  bound: 195,           // playable half-extent on land
  waterZ: 168,          // south of this z the marina water starts
  plaza: { x: 0, z: 0, r: 26 },
  startPos: { x: 8, z: 118 },
};

export const SAVE_KEY = 'meridian-heat-save-v3';

// Six story missions. Each step is a waypoint the player must reach
// (drive / walk / fight / escape), with a cash payout on completion.
export const MISSIONS = [
  {
    id: 1, name: 'First Gear', payout: 400,
    brief: 'Mara Quinn needs a driver. Steal the coupe parked by the plaza and bring it to her.',
    steps: [
      { kind: 'steal', label: 'Steal the coupe near Central Plaza', x: 14, z: 52, radius: 6 },
      { kind: 'goto', label: 'Drive the coupe to Mara Quinn at the marina office', x: -58, z: 148, radius: 7, needCar: true },
    ],
  },
  {
    id: 2, name: 'The Pickup', payout: 650,
    brief: 'A courier is waiting at the north docks with a package. Pick it up — quietly.',
    steps: [
      { kind: 'goto', label: 'Reach the courier at North Docks', x: 118, z: -148, radius: 7 },
      { kind: 'goto', label: 'Deliver the package to the pawn shop on 5th', x: -118, z: -38, radius: 7 },
    ],
  },
  {
    id: 3, name: 'Hot Wheels', payout: 900,
    brief: 'The Vipers took Mara’s favourite ride. Take it back from their garage on the east side.',
    steps: [
      { kind: 'steal', label: 'Steal back the red Comet from the Viper garage', x: 148, z: 42, radius: 6 },
      { kind: 'escape', label: 'Lose the Vipers — get the Comet to the lockup', x: -148, z: 118, radius: 8, needCar: true },
    ],
  },
  {
    id: 4, name: 'Dockside Trouble', payout: 1200,
    brief: 'Rival crew is shaking down the dock workers. Clear them out — pistol or fists, your call.',
    steps: [
      { kind: 'fight', label: 'Clear the rival crew at the south pier', x: 62, z: 152, radius: 14, enemies: 4 },
      { kind: 'goto', label: 'Check on the dock foreman', x: 88, z: 138, radius: 6 },
    ],
  },
  {
    id: 5, name: 'The Getaway', payout: 1600,
    brief: 'The job went loud. Grab the getaway car and outrun the harbour police to the safehouse.',
    steps: [
      { kind: 'goto', label: 'Reach the getaway car by the stadium', x: -118, z: 82, radius: 6 },
      { kind: 'escape', label: 'Outrun the police — reach the safehouse with the heat on', x: 118, z: -118, radius: 9, needCar: true, wantStars: 3 },
    ],
  },
  {
    id: 6, name: 'Meridian Heat', payout: 2500,
    brief: 'One last run: storm the Viper warehouse, take down their boss, and the city is yours.',
    steps: [
      { kind: 'fight', label: 'Storm the Viper warehouse yard', x: -148, z: -118, radius: 16, enemies: 5 },
      { kind: 'fight', label: 'Take down Viper boss Rex Dalton', x: -158, z: -138, radius: 12, enemies: 1, boss: true },
      { kind: 'goto', label: 'Meet Mara Quinn at the plaza — the city is yours', x: 0, z: 8, radius: 8 },
    ],
  },
];

export const PARKED_CARS = [
  { x: 14, z: 52, color: 0xffc93c, model: 'coupe', mission: 1 },   // mission 1 target
  { x: -30, z: -70, color: 0x3fa7ff, model: 'sedan' },
  { x: 70, z: -30, color: 0xff5a4e, model: 'sedan' },
  { x: -70, z: 30, color: 0x9b59ff, model: 'sport' },
  { x: 30, z: 110, color: 0x37d67a, model: 'sedan' },
  { x: 148, z: 42, color: 0xe8202a, model: 'sport', mission: 3 }, // mission 3 target
  { x: -118, z: 82, color: 0x222831, model: 'sport', mission: 5 },// mission 5 getaway
  { x: 110, z: 118, color: 0xff8c42, model: 'coupe' },
];

export const PALETTE = {
  asphalt: 0x23262e, sidewalk: 0x8a8f98, grass: 0x2e6b34, sand: 0xcbb27a,
  water: 0x0e4d6e, plaza: 0x6b6257, police: 0x1c2733, policeLight: 0xff2a2a,
};

export const DIALOGUE = {
  start: 'Mara Quinn: "Jace. One last run. The coupe by the plaza — bring it to me."',
  busted: 'The Port Meridian PD caught you. Fine paid, heat cleared.',
  missionDone: (name, pay) => `Mission complete: ${name} — +$${pay}`,
  allDone: 'All six jobs done. Port Meridian is yours, Jace.',
};
