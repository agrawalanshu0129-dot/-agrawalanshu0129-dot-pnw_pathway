const DOCS = [
  {
    id: "doc-i20",
    title: "I-20 and SEVIS Requirements",
    text: `The I-20 is issued by International Student Services (ISS) after a student submits a passport copy, proof of funding (bank statement, sponsor letter, or assistantship offer depending on funding type), and confirms their program details. Once the I-20 is issued, the student must pay the SEVIS I-901 fee before scheduling a visa interview. The SEVIS fee is separate from tuition and must be paid online at fmjfee.com. Keep the payment receipt; it is required at the visa interview and again at port of entry.`,
  },
  {
    id: "doc-visa",
    title: "Visa Interview Scheduling",
    text: `Students should schedule their F-1 or J-1 visa interview as soon as the I-20 is issued and the SEVIS fee is paid, since embassy wait times vary by country and can exceed 60 days during peak season. Bring the I-20, SEVIS fee receipt, passport, and financial documentation to the interview. If a visa is denied or delayed, contact ISS immediately so your enrollment deadline can be reviewed.`,
  },
  {
    id: "doc-financial",
    title: "Financial Documentation by Funding Type",
    text: `Self-funded and family-funded students must submit a bank statement dated within the last 6 months showing sufficient funds to cover one year of tuition and living expenses. Family-funded students additionally submit a signed affidavit of support from the sponsor. Sponsored students (government or employer sponsorship) submit an official sponsorship letter instead of a bank statement. Graduate assistantship recipients submit their signed offer letter, which ISS accepts as proof of funding for the assistantship-covered amount.`,
  },
  {
    id: "doc-immunization",
    title: "Immunization Requirements",
    text: `Washington state law requires all students to submit immunization records before registering for classes, including MMR (measles, mumps, rubella). Students with a medical or religious exemption should submit the exemption form instead. Immunization holds are placed on registration until records are received and approved by the Registrar's office.`,
  },
  {
    id: "doc-housing",
    title: "Housing and Orientation",
    text: `All incoming students must either apply for on-campus housing or submit an off-campus housing waiver. Orientation registration is separate from housing and is required for all new students; international students should attend the international-specific orientation session, which covers visa status maintenance and campus resources.`,
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

module.exports = { DOCS, retrieve };
