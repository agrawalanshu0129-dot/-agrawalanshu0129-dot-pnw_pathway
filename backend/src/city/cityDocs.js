// Curated, hand-verified reference content for Seattle, WA (PNW University's
// home city). This is the zero-cost fallback source for the City Life
// assistant when no LLM API key is configured, and doubles as structured
// data for the Cost-of-Living page. Figures are point-in-time estimates
// based on general public rental/cost-of-living data; the UI labels them as
// such and encourages students to verify current numbers before signing a
// lease. Update by editing this file — no other code changes needed (NFR6
// pattern).

const COST_OF_LIVING = {
  as_of: "2026",
  cost_of_living_index: 175, // US average = 100; Seattle is consistently one of the most expensive US metros
  monthly_estimate_single_adult: {
    housing_1br: 2000,
    food: 450,
    transportation: 450,
    utilities: 180,
    healthcare_misc: 320,
  },
  rent_ranges: {
    studio: [1500, 2100],
    one_bedroom: [1750, 2450],
    two_bedroom: [2200, 3200],
  },
  notes:
    "Seattle runs roughly 60-80% above the US average, driven overwhelmingly by housing. Washington has no state income tax, which offsets some of this, but sales tax in Seattle is around 10%. Rent figures are city-wide averages; specific listings vary a lot by neighborhood and proximity to a light rail station. Verify current rates on a rental site before budgeting.",
};

const NEIGHBORHOODS = [
  { name: "University District", vibe: "Dense student housing, right next to campus, budget-friendly by Seattle standards", approx_1br_rent: 1650 },
  { name: "Roosevelt", vibe: "Quieter, residential, on the light rail line", approx_1br_rent: 1850 },
  { name: "Wallingford", vibe: "Walkable, family-friendly, close to U-District", approx_1br_rent: 1950 },
  { name: "Ballard", vibe: "Trendy, a bit further out, well-connected by bus", approx_1br_rent: 2050 },
  { name: "Capitol Hill", vibe: "Central, vibrant nightlife, higher cost", approx_1br_rent: 2150 },
];

const TRANSIT = [
  {
    agency: "King County Metro",
    covers: "Local and regional bus network across Seattle and King County",
    good_for: "Getting around neighborhoods not directly on a light rail line, and most cross-town trips",
  },
  {
    agency: "Sound Transit Link light rail",
    covers: "Rail line running north-south through the University District, Capitol Hill, and downtown, extending to Sea-Tac Airport and north toward Lynnwood, plus an eastside branch to Bellevue/Redmond",
    good_for: "Fast, frequent, car-free trips to/from campus, downtown, and the airport",
  },
  {
    agency: "Sound Transit Express buses",
    covers: "Longer regional routes connecting Seattle to suburbs not served by light rail",
    good_for: "Trips further out into the Puget Sound region",
  },
  {
    agency: "Washington State Ferries",
    covers: "Ferry service from downtown Seattle to West Seattle, Bainbridge Island, and the Kitsap Peninsula",
    good_for: "Students living across the sound, or weekend trips",
  },
];

const TRANSIT_NOTE =
  "Seattle's Link light rail network has expanded significantly in recent years, with stations serving the University District, Capitol Hill, and downtown, plus new extensions further north and east -- making car-free living near campus very realistic. The system continues to grow, so check Sound Transit's current system map before assuming a specific station or schedule.";

const DOCS = [
  {
    id: "city-cost",
    title: "Cost of Living in Seattle, WA",
    text: `Seattle's cost of living runs roughly 60-80% above the US national average, driven overwhelmingly by housing. A single adult should budget approximately $2,000/month for a 1-bedroom apartment, $450 for food, $450 for transportation, and $180 for utilities, for a rough total near $3,300-3,700/month before healthcare and discretionary spending. Studio apartments average $1,500-2,100; one-bedrooms $1,750-2,450; two-bedrooms (good for roommates) $2,200-3,200. Washington has no state income tax, which helps offset some of this, though Seattle sales tax runs around 10%. These are city-wide averages from public rental data; always verify current listings before signing a lease.`,
  },
  {
    id: "city-neighborhoods",
    title: "Seattle Neighborhoods for Students",
    text: `The University District (~$1,650/mo for a 1BR) is the most budget-friendly option, right next to campus with dense student housing. Roosevelt (~$1,850) and Wallingford (~$1,950) are quieter, walkable, and close by, with Roosevelt sitting directly on the light rail line. Ballard (~$2,050) and Capitol Hill (~$2,150) trade higher rent for more nightlife and amenities. Splitting a 2-bedroom with a roommate (~$2,200-3,200 total) is often more cost-effective per person than a solo studio.`,
  },
  {
    id: "city-transit",
    title: "Getting Around Seattle",
    text: `${TRANSIT_NOTE} King County Metro runs the main local/regional bus network. Sound Transit's Link light rail connects the University District, Capitol Hill, and downtown, with extensions reaching Sea-Tac Airport, Lynnwood to the north, and Bellevue/Redmond to the east. Sound Transit Express buses cover longer regional routes not served by light rail. Washington State Ferries connect downtown to West Seattle, Bainbridge Island, and the Kitsap Peninsula.`,
  },
  {
    id: "city-budget-tips",
    title: "Student Budgeting Tips",
    text: `Since housing is by far the largest expense in Seattle, splitting rent with a roommate typically gives the biggest single savings. A transit pass is usually far cheaper than car ownership once you account for parking, insurance, and gas -- especially living near a light rail station, since the system reaches downtown, the airport, and both the University District and eastside job centers. Ask your university or Sound Transit about student-discounted transit passes. Groceries in Seattle run above the national average, so cooking at home rather than eating out is the next-largest lever on a student budget.`,
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
