// Curated, hand-verified reference content for Everett, WA (PNW University's
// home city). This is the zero-cost fallback source for the City Life
// assistant when no LLM API key is configured, and doubles as structured
// data for the Cost-of-Living page. Figures are point-in-time estimates
// from public rental/cost-of-living sources; the UI labels them as such
// and encourages students to verify current numbers before signing a lease.
// Update by editing this file — no other code changes needed (NFR6 pattern).

const COST_OF_LIVING = {
  as_of: "2026",
  cost_of_living_index: 118, // US average = 100; sources range ~112-134
  monthly_estimate_single_adult: {
    housing_1br: 1700,
    food: 425,
    transportation: 525,
    utilities: 175,
    healthcare_misc: 300,
  },
  rent_ranges: {
    studio: [1400, 1950],
    one_bedroom: [1540, 1950],
    two_bedroom: [1720, 2340],
  },
  notes:
    "Everett runs roughly 15-30% above the US average, driven mainly by housing. Rent figures are city-wide averages; specific listings vary by neighborhood and season. Verify current rates on a rental site before budgeting.",
};

const NEIGHBORHOODS = [
  { name: "View Ridge-Madison", vibe: "Budget-friendly, residential", approx_1br_rent: 1450 },
  { name: "Rucker-Grand Historic District", vibe: "Historic, walkable, close to downtown", approx_1br_rent: 1495 },
  { name: "Westmont", vibe: "Quiet, residential", approx_1br_rent: 1535 },
  { name: "South Forest Park", vibe: "Near Forest Park, family-friendly", approx_1br_rent: 1754 },
  { name: "Silver Lake", vibe: "Higher-end, near the lake", approx_1br_rent: 2055 },
];

const TRANSIT = [
  {
    agency: "Everett Transit",
    covers: "Local bus routes within Everett city limits",
    good_for: "Getting around campus-adjacent neighborhoods and downtown Everett",
  },
  {
    agency: "Community Transit",
    covers: "Snohomish County bus network, including Swift Blue bus-rapid-transit",
    good_for: "Trips outside Everett proper; Swift Blue connects to Shoreline, where you can transfer to Link light rail toward Seattle",
  },
  {
    agency: "Sound Transit Sounder N Line",
    covers: "Commuter train from Everett Station to Seattle",
    good_for: "Weekday peak-hour commutes to Seattle; runs limited peak-direction trips, not all-day service",
  },
  {
    agency: "Everett Station",
    covers: "Central hub: Sounder train, Amtrak, and intercity buses",
    good_for: "Longer-distance trips beyond the Seattle metro area",
  },
];

const TRANSIT_NOTE =
  "As of 2026, Sound Transit's Link light rail does not yet reach Everett; an extension is in the environmental review phase with a currently projected opening around 2041, so budget for bus/Sounder commuting in the meantime. Community Transit and the City of Everett have also discussed consolidating Everett Transit into Community Transit; check both agencies' current sites before relying on a specific route.";

const DOCS = [
  {
    id: "city-cost",
    title: "Cost of Living in Everett, WA",
    text: `Everett's cost of living runs roughly 15-30% above the US national average, driven mainly by housing. A single adult should budget approximately $1,700/month for a 1-bedroom apartment, $425 for food, $525 for transportation, and $175 for utilities, for a rough total near $2,800-3,200/month before healthcare and discretionary spending. Studio apartments average $1,400-1,950; one-bedrooms $1,540-1,950; two-bedrooms (good for roommates) $1,720-2,340. These are city-wide averages from public rental data; always verify current listings before signing a lease.`,
  },
  {
    id: "city-neighborhoods",
    title: "Everett Neighborhoods for Students",
    text: `More affordable neighborhoods include View Ridge-Madison (~$1,450/mo for a 1BR), Rucker-Grand Historic District (~$1,495, walkable and historic, close to downtown), and Westmont (~$1,535, quiet and residential). Higher-cost areas like Silver Lake (~$2,055) trade price for amenities and lake access. Splitting a 2-bedroom with a roommate (~$1,720-2,340 total) is often more cost-effective per person than a solo studio.`,
  },
  {
    id: "city-transit",
    title: "Getting Around Everett",
    text: `${TRANSIT_NOTE} Everett Transit runs local buses within city limits. Community Transit covers the wider county and runs the Swift Blue bus-rapid-transit line, which connects to Shoreline for a transfer to Link light rail toward Seattle. The Sound Transit Sounder N Line offers weekday peak-hour commuter trains from Everett Station to Seattle. Everett Station is also the hub for Amtrak and intercity buses for longer trips.`,
  },
  {
    id: "city-budget-tips",
    title: "Student Budgeting Tips",
    text: `Since housing is the largest expense in Everett, splitting rent with a roommate typically gives the biggest single savings. A transit pass is usually cheaper than car ownership once you account for parking, insurance, and gas, especially since several bus routes connect directly to Paine Field Airport and Everett Station. Groceries in Everett run close to the national average, so cooking at home rather than eating out is the next-largest lever on a student budget.`,
  },
];

function retrieve(query, topK = 2) {
  const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const scored = DOCS.map((doc) => {
    const text = (doc.title + " " + doc.text).toLowerCase();
    const score = words.reduce((acc, w) => acc + (text.includes(w) ? 1 : 0), 0);
    return { doc, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((s) => s.doc);
}

module.exports = { DOCS, COST_OF_LIVING, NEIGHBORHOODS, TRANSIT, TRANSIT_NOTE, retrieve };
