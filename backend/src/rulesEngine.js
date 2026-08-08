function templateApplies(template, student) {
  const populationMatches =
    template.population === "both" || template.population === student.population;
  const fundingMatches =
    !template.funding_types ||
    template.funding_types.length === 0 ||
    template.funding_types.includes(student.funding_type);
  return populationMatches && fundingMatches;
}

function dueDateFor(template, fromDate) {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + template.days_to_complete);
  return d.toISOString().slice(0, 10);
}

function generateChecklist(student, templates, fromDate = new Date()) {
  return templates
    .filter((t) => templateApplies(t, student))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((t) => ({
      template_id: t.id,
      due_date: dueDateFor(t, fromDate),
      status: "not_started",
    }));
}

module.exports = { generateChecklist, templateApplies, dueDateFor };
