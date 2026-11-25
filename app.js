"use strict";

const storageKey = "propertyos.workspace.v1";
const localDate = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
};
const today = localDate();
const invoiceDate = entry => entry.issueDate || entry.date;
const sample = {
  properties: [
    { id: "maple", name: "Maple House", address: "10 Maple Lane", location: "Ottawa", postal: "K1A 0A1", propertyType: "Townhouse", jurisdiction: "CA-ON", currency: "CAD" },
    { id: "cedar", name: "Cedar Court", address: "20 Cedar Lane", location: "Calgary", postal: "T2P 1J9", propertyType: "Apartment building", jurisdiction: "CA-AB", currency: "CAD" }
  ],
  spaces: [
    { id: "a", property: "maple", name: "Room A", type: "Room" },
    { id: "b", property: "maple", name: "Room B", type: "Room" },
    { id: "c", property: "cedar", name: "Unit 201", type: "Unit" }
  ],
  tenants: [{ id: "m", name: "Morgan Ellis", email: "morgan@example.test" }, { id: "r", name: "Riley Chen", email: "riley@example.test" }],
  leases: [{ id: "l", tenant: "m", space: "a", start: localDate(-50), end: localDate(45), rent: "875" }, { id: "l2", tenant: "r", space: "c", start: localDate(-90), end: "", rent: "1450" }],
  ledger: [{ id: "z", lease: "l", type: "Charge", amount: "875", date: today, note: "Monthly rent" }, { id: "y", lease: "l", type: "Payment", amount: "500", date: today, method: "EFT", note: "Bank transfer" }],
  maintenance: [{ id: "t", space: "a", name: "Kitchen faucet dripping", category: "Plumbing", priority: "Medium", status: "Open" }],
  schedules: []
};

let storageError = false;
let data;
try {
  const stored = localStorage.getItem(storageKey);
  data = stored ? JSON.parse(stored) : structuredClone(sample);
  data.schedules ??= [];
  if (!Object.keys(sample).every(key => Array.isArray(data[key]))) throw new Error("Invalid workspace");
} catch {
  storageError = true;
  data = structuredClone(sample);
}

const billingFrequencies = ["Monthly", "Weekly", "Every two weeks"];
const field = (key, label, type = "text", optional = false) => ({ key, label, type, optional });
const annual = "Annual";
const monthly = "Month-to-month";
const rentalModels = ["Whole unit", "By room (co-living)", "Mixed"];
const singleUnit = "Single unit";
const multiUnit = "Multi-unit";
const unitByRoom = "Unit rented by room";
const rentalSetups = ["Rent Full Unit", "Rent By Room"];
const spaceRentalSetup = space => space.type === "Unit" ? rentalSetups[0] : rentalSetups[1];
const tenantBasics = [field("name", "Full name"), field("email", "Email", "email"), field("phone", "Phone", "tel", true)];
const leaseTerm = lease => lease.term || (lease.end ? annual : monthly);
const views = {
  properties: { title: "Properties", item: "property", fields: [field("name", "Property name"), field("address", "Street address"), field("location", "City"), field("postal", "Postal or ZIP code"), field("jurisdiction", "Jurisdiction code (e.g. CA-ON or US-NY)"), field("currency", "Currency", ["CAD", "USD"]), field("amenities", "Amenities (e.g. parking, laundry, Wi-Fi)", "text", true)] },
  spaces: { title: "Units & rooms", item: "unit or room", summary: "Track whole-unit rentals and rooms leased individually.", fields: [field("name", "Unit or room name"), field("property", "Property", "properties"), field("type", "Space type", ["Unit", "Room"]), field("rentalSetup", "Rental setup", rentalSetups), field("bedrooms", "Bedrooms", "count", true), field("bathrooms", "Bathrooms", "count", true), field("area", "Area (sq ft)", "count", true)] },
  tenants: { title: "Tenants", item: "tenant", summary: "Find contact details and see where each tenant rents.", fields: [...tenantBasics, field("alternateEmail", "Alternate email", "email", true), field("alternatePhone", "Alternate phone", "tel", true), field("emergency", "Emergency contact", "text", true), field("forwardingAddress", "Forwarding address", "text", true)] },
  leases: { title: "Leases", item: "lease", summary: "Track annual terms, month-to-month tenancies, and actual tenancy end dates.", fields: [field("tenant", "Tenant", "tenants"), field("space", "Unit or room", "spaces"), field("term", "Original lease term", [annual, monthly]), field("start", "Start date", "date"), field("end", "Fixed term end", "date", true), field("tenancyEnd", "Confirmed tenancy end (Optional)", "date", true), field("rent", "Monthly rent", "number"), field("dueDay", "Rent due day (1–31)", "day", true)] },
  ledger: { title: "Rent ledger", item: "ledger entry", fields: [field("lease", "Lease", "leases"), field("type", "Entry type", ["Charge", "Payment", "Refund"]), field("amount", "Amount", "number"), field("date", "Entry date", "date"), field("method", "Payment method", ["Cash", "Cheque", "E-transfer", "EFT", "Other"], true), field("reference", "Reference", "text", true), field("note", "Note", "text", true)] },
  schedules: { title: "Recurring invoices", item: "recurring invoice schedule", fields: [field("lease", "Lease", "leases"), field("note", "Invoice description"), field("amount", "Amount per invoice", "number"), field("frequency", "Billing frequency", billingFrequencies), field("start", "First due date", "date"), field("leadDays", "Post days before due date", "lead", true), field("end", "Last billing date", "date", true), field("state", "Schedule status", ["Active", "Paused"])] },
  maintenance: { title: "Maintenance", item: "request", summary: "Log issues and track them through resolution.", fields: [field("name", "Issue"), field("space", "Unit or room", "spaces"), field("category", "Category", ["Plumbing", "Electrical", "HVAC", "General", "Appliance"]), field("description", "Description", "text", true), field("priority", "Priority", ["Low", "Medium", "High", "Emergency"]), field("status", "Status", ["Open", "Assigned", "In progress", "Awaiting parts", "Completed", "Closed"])] }
};

const nav = document.querySelector("#navigation");
const shell = document.querySelector(".shell");
const menuToggle = document.querySelector(".menu-toggle");
const narrowScreen = matchMedia("(max-width: 730px)");
const view = document.querySelector("#view");
const editor = document.querySelector("#editor");
const form = document.querySelector("#record-form");
const status = document.querySelector("#status");
const error = document.querySelector("#form-error");
const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const find = (key, id) => data[key].find(record => record.id === id);
const leaseTenantIds = lease => [lease.tenant, ...(lease.additionalTenants ?? [])];
const leaseTenantNames = lease => leaseTenantIds(lease).map(id => labelFor("tenants", id)).join(", ");
const depositApplied = "Deposit applied";
const invoiceCategories = ["Rent", "Deposit", "Utilities", "Parking", "Storage", "Late fee", "Other"];
const invoiceCategory = entry => entry.category ||
  invoiceCategories.find(category => category.toLowerCase() === entry.note?.trim().toLowerCase()) || "Other";
const invoiceCategoryLabel = entry => invoiceCategory(entry) === "Other" && entry.customCategory ? entry.customCategory : invoiceCategory(entry);
const depositTypes = ["Deposit received", "Deposit returned", depositApplied];
const isDeposit = entry => depositTypes.includes(entry.type);
const depositCents = entry => Math.round(Number(entry.amount) * 100);
const sameDepositAccount = (a, b) => a.lease === b.lease && (a.billedTenant || "") === (b.billedTenant || "");
const propertyFor = spaceId => find("properties", find("spaces", spaceId)?.property);
const money = (value, currency) => new Intl.NumberFormat("en-CA", { style: "currency", currency, currencyDisplay: "code" }).format(value);
const defaultRollover = space => propertyFor(space)?.jurisdiction === "CA-ON";
const rollsOver = lease => Boolean(lease.end && (lease.convertToMonthly ?? defaultRollover(lease.space)));
const occupancyEnd = lease => lease.tenancyEnd || (rollsOver(lease) ? "" : lease.end);
const currentLease = lease => lease.start <= today && (!occupancyEnd(lease) || occupancyEnd(lease) >= today);
function leaseStatus(lease) {
  if (lease.start > today) return "Upcoming";
  if (leaseState(lease) === "Ended") return "Ended";
  if (rollsOver(lease) && lease.end < today) return "Month-to-month (continued)";
  return leaseTerm(lease) === annual ? "Annual term" : monthly;
}
function leaseState(lease) {
  if (lease.tenancyEnd && lease.tenancyEnd <= today) return "Ended";
  if (lease.start > today) return "Scheduled";
  return currentLease(lease) ? "Active" : "Ended";
}
function fixedTermsEnding(leases, days) {
  const through = localDate(days);
  return leases.filter(lease => leaseState(lease) === "Active" && lease.end && lease.end >= today && lease.end <= through &&
    (!lease.tenancyEnd || lease.tenancyEnd >= lease.end));
}
const hasView = key => typeof key === "string" && Object.hasOwn(views, key);
const route = () => {
  const key = location.hash.slice(1).split("?")[0];
  return hasView(key) || key === "compliance" || key === "reports" ? key : "overview";
};
const routeParams = () => new URLSearchParams(location.hash.split("?")[1]);
const propertyScope = () => find("properties", routeParams().get("property"));
const propertyLink = (page, id) => "#" + page + "?property=" + encodeURIComponent(id);
function recordLink(key, id, keepScope = true) {
  const scope = keepScope && route() === key ? propertyScope() : null;
  const parameter = key === "tenants" ? "tenant" : key === "leases" ? "lease" : "record";
  return (scope ? propertyLink(key, scope.id) + "&" : "#" + key + "?") + parameter + "=" + encodeURIComponent(id);
}
const linkedRecord = key => find(key, routeParams().get("record"));
const recordAnchor = (url, label) => '<a href="' + escape(url) + '">' + escape(label) + '</a>';
const propertySections = [["spaces", "Units & rooms"], ["tenants", "Tenants"], ["leases", "Leases"], ["ledger", "Rent ledger"], ["maintenance", "Maintenance"]];
const photoPattern = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

function propertyType(property) {
  if ([singleUnit, multiUnit].includes(property?.propertyType)) return property.propertyType;
  return property?.unitSetup || multiUnit;
}

function rentalModel(property, spaces) {
  if (!spaces.length && propertyType(property) === singleUnit) return rentalModels[0];
  const units = spaces.some(space => space.type === "Unit");
  const rooms = spaces.some(space => space.type === "Room" || space.type === unitByRoom);
  return rooms ? rentalModels[units ? 2 : 1] : units ? rentalModels[0] : "";
}

function rentableSpaces(spaces) {
  return spaces.filter(space => !space.unit).flatMap(space =>
    space.type === unitByRoom ? leaseRoomOptions(space) : [space]);
}

function activeSpace(space) {
  return !space.archived && !find("properties", space.property)?.archived &&
    !(space.unit && find("spaces", space.unit)?.archived);
}

function archiveAction(key, record) {
  return '<button class="secondary" data-archive-key="' + key + '" data-archive-id="' + escape(record.id) + '">' +
    (record.archived ? "Restore" : "Archive") + '</button>';
}

function archivedRecords(title, content) {
  return content ? '<details class="card"><summary>' + title + '</summary>' + content + '</details>' : "";
}

function affectedSpaces(key, id) {
  return new Set(data.spaces.filter(space => key === "properties" ? space.property === id :
    space.id === id || space.unit === id).map(space => space.id));
}

function toggleArchive(key, id) {
  const record = find(key, id);
  if (!record) return;
  const affected = affectedSpaces(key, id);
  if (!record.archived && data.leases.some(lease => affected.has(lease.space) && (currentLease(lease) || lease.start > today))) {
    notify("An active or future lease prevents archiving.");
    return;
  }
  const next = { ...data, [key]: data[key].map(item => item.id === id ? { ...item, archived: !record.archived } : item) };
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    notify("This browser could not save the change.");
    return;
  }
  data = next;
  render();
  notify(record.archived ? "Restored." : "Archived.");
}

function deleteEditedRecord() {
  const { key, id } = editing;
  const record = id && find(key, id);
  if (!record || (key !== "properties" && (key !== "spaces" || record.type === "Room"))) return;
  const affected = affectedSpaces(key, id);
  if (data.leases.some(lease => affected.has(lease.space)) ||
    data.maintenance.some(request => affected.has(request.space)) ||
    (key === "properties" && data.ledger.some(entry => entry.type === "Expense" && entry.property === id))) {
    error.textContent = "This record has history. Use Archive to keep it.";
    return;
  }
  const next = { ...data, spaces: data.spaces.filter(space => !affected.has(space.id)) };
  if (key === "properties") next.properties = data.properties.filter(property => property.id !== id);
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    error.textContent = "This browser could not save the deletion.";
    return;
  }
  data = next;
  editor.close();
  if (key === "properties" && route() !== "properties") location.hash = "properties";
  else if (key === "spaces" && route() === "spaces" && affected.has(routeParams().get("record"))) {
    const property = propertyScope();
    location.hash = property ? propertyLink("spaces", property.id) : "spaces";
  } else render();
  notify(key === "properties" ? "Property deleted." : "Unit deleted.");
}

function propertyCard(property) {
  const spaces = data.spaces.filter(space => space.property === property.id);
  const leases = data.leases.filter(lease => spaces.some(space => space.id === lease.space));
  const leaseIds = new Set(leases.map(lease => lease.id));
  const rentable = rentableSpaces(spaces.filter(activeSpace));
  const occupiedIds = new Set(leases.filter(currentLease).map(lease => lease.space));
  const isOccupied = space => occupiedIds.has(space.id) || occupiedIds.has(space.unit);
  const occupied = rentable.filter(isOccupied).length;
  const units = spaces.filter(space => !space.archived && (space.type === "Unit" || space.type === unitByRoom)).length;
  const rooms = spaces.filter(space => !space.archived && !space.unit).reduce((count, space) =>
    count + (space.type === "Room" ? 1 : space.bedrooms === "" || space.bedrooms == null ?
      spaces.filter(room => room.unit === space.id).length : Number(space.bedrooms)), 0);
  const model = rentalModel(property, spaces.filter(activeSpace));
  const balance = data.ledger.filter(entry => leaseIds.has(entry.lease) && invoiceDate(entry) <= today)
    .reduce((cents, entry) => cents + operatingLedgerCents(entry), 0);
  const occupancy = unitWeightedOccupancy(rentable, isOccupied);
  const address = [property.address, property.location, property.jurisdiction, property.postal].filter(Boolean).join(", ");
  return '<article class="card property-card" data-vacant="' + (rentable.length - occupied) + '" data-balance="' + balance +
    '" data-model="' + escape(model) + '" data-search="' +
    escape([property.name, address, propertyType(property), property.buildingType, property.propertyType, model].join(" ").toLowerCase()) + '">' +
    (photoPattern.test(property.photo) ? '<img class="property-photo" src="' + escape(property.photo) + '" alt="Exterior or interior of ' + escape(property.name) + '">' : "") +
    '<div class="property-body"><div class="property-title"><div><p class="property-type">' + escape([propertyType(property), model].filter(Boolean).join(" · ")) +
    '</p><h2><a class="property-card-link" href="' + escape(propertyLink("spaces", property.id)) + '">' + escape(property.name) +
    '</a></h2><p class="muted">' + escape(address) + '</p></div>' +
    actionMenu("Actions for " + property.name, '<button class="secondary" data-edit="' + escape(property.id) + '">Edit</button>' +
    archiveAction("properties", property)) + '</div>' +
    '<dl class="property-stats"><div><dt>Units / Bedrooms</dt><dd>' + units + ' / ' + rooms + '</dd></div>' +
    '<div><dt>Occupancy</dt><dd>' + occupancy + '</dd></div><div><dt>Ledger balance</dt><dd>' + escape(money(balance / 100, property.currency)) + '</dd></div></dl>' +
    (property.amenities ? '<p class="muted">Amenities: ' + escape(property.amenities) + '</p>' : "") +
    '</div></article>';
}

function propertyWorkspace(property, section) {
  const address = [property.address, property.location, property.jurisdiction, property.postal].filter(Boolean).join(", ");
  return '<div class="property-workspace"><p class="scope-link"><a href="#properties">All properties</a></p>' +
    heading(property.name, address, '<button class="secondary" data-record-key="properties" data-edit="' +
      escape(property.id) + '">Edit property</button>') +
    '<nav class="property-tabs" aria-label="Property sections">' + propertySections.map(([key, label]) =>
      '<a href="' + escape(propertyLink(key, property.id)) + '"' + (key === section || (section === "schedules" && key === "ledger") ?
        ' aria-current="page"' : "") + '>' + escape(label) + '</a>').join("") + '</nav></div>';
}

function portfolio() {
  return heading("Properties", "Manage your properties and see how each one is performing.", '<button data-add="properties">Add property</button>') +
    '<div class="portfolio-filters"><label>Search properties<input type="search" id="property-search" placeholder="Name, address, or building type"></label>' +
    '<label>Rental model<select id="property-model"><option value="">All rental models</option>' +
    rentalModels.map(model => '<option>' + escape(model) + '</option>').join("") + '</select></label>' +
    '<label>Occupancy<select id="property-occupancy"><option value="">Any occupancy</option><option value="vacant">Has vacancies</option></select></label>' +
    '<label>Balance<select id="property-balance"><option value="">Any balance</option><option value="positive">Positive balance</option></select></label></div>' +
    '<p class="muted" id="property-count" role="status"></p><div class="portfolio-grid">' +
    data.properties.filter(property => !property.archived).map(propertyCard).join("") + '</div>' +
    archivedRecords("Archived properties", data.properties.filter(property => property.archived).map(property =>
      '<div class="archived-record">' + escape(property.name) + actionMenu("Actions for " + property.name, archiveAction("properties", property)) + '</div>').join(""));
}

function filterPortfolio() {
  const search = view.querySelector("#property-search").value.trim().toLowerCase();
  const model = view.querySelector("#property-model").value;
  const vacancy = view.querySelector("#property-occupancy").value;
  const balance = view.querySelector("#property-balance").value;
  let count = 0;
  for (const card of view.querySelectorAll(".property-card")) {
    card.hidden = !card.dataset.search.includes(search) || (model && model !== card.dataset.model) ||
      (vacancy && Number(card.dataset.vacant) <= 0) || (balance && Number(card.dataset.balance) <= 0);
    if (!card.hidden) count++;
  }
  view.querySelector("#property-count").textContent = count ? count + (count === 1 ? " property" : " properties") : "No matching properties.";
}

function ledgerCents(entry) {
  if (entry.voidedOn) return 0;
  if (entry.type === depositApplied) return -depositCents(entry);
  if (isDeposit(entry)) return 0;
  return (entry.type === "Payment" ? -1 : 1) * Math.round(Number(entry.amount) * 100);
}

function isDepositInvoice(entry) {
  return entry?.invoice && invoiceCategory(entry) === "Deposit";
}

function operatingLedgerCents(entry) {
  return isDepositInvoice(entry) || (entry.invoiceId && isDepositInvoice(find("ledger", entry.invoiceId))) ?
    0 : ledgerCents(entry);
}

function invoicePayments(invoiceId, through, excludeId) {
  return data.ledger.filter(entry => (entry.type === "Payment" || entry.type === depositApplied) && entry.invoiceId === invoiceId &&
    entry.id !== excludeId && (!through || entry.date <= through));
}

function paymentTotal(entries) {
  return entries.reduce((sum, entry) => sum - ledgerCents(entry), 0);
}

function invoiceBalance(invoice) {
  if (invoice.voidedOn) return { paid: 0, refunded: 0, remaining: 0, status: "Void", overdue: false };
  const total = ledgerCents(invoice);
  const paid = paymentTotal(invoicePayments(invoice.id, today));
  const refunded = data.ledger.filter(entry => entry.type === "Refund" && entry.invoiceId === invoice.id && entry.date <= today)
    .reduce((sum, entry) => sum + ledgerCents(entry), 0);
  return { paid, refunded, remaining: total - paid, status: paid >= total ? (refunded >= paid ? "Refunded" : refunded ? "Partially refunded" : "Paid") :
    paid > 0 ? "Partially paid" : "Open", overdue: total > paid && invoice.date < today };
}
const invoiceStatusText = balance => balance.overdue ?
  (balance.status === "Partially paid" ? "Partially paid · Overdue" : "Overdue") : balance.status;

function voidInvoice(invoice) {
  if (invoice.voidedOn || invoicePayments(invoice.id).length) return;
  if (!confirm("Void " + (invoice.reference || "this invoice") + "? Its balance will be cleared and the invoice will stay in transaction history.")) return;
  const next = { ...data, ledger: data.ledger.map(entry =>
    entry.id === invoice.id ? { ...entry, voidedOn: today } : entry) };
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    notify("This browser could not save the voided invoice.");
    return;
  }
  data = next;
  render();
  notify("Invoice voided.");
}

function labelFor(key, id) {
  const record = find(key, id);
  if (!record) return "—";
  if (key === "leases") return leaseTenantNames(record) + " · " + labelFor("spaces", record.space) + " · " + record.start;
  if (key === "spaces") return [labelFor("properties", record.property), find("spaces", record.unit)?.name, record.name].filter(Boolean).join(" · ");
  return record.name;
}

let actionMenuCount = 0;
function actionMenu(label, actions) {
  const id = "actions-" + ++actionMenuCount;
  return '<button type="button" class="secondary action-trigger" popovertarget="' + id +
    '" aria-label="' + escape(label) + '">⋯</button><div class="action-popover" id="' + id + '" popover>' + actions + '</div>';
}

function heading(title, summary, actions = "") {
  return '<div class="heading"><div><h1>' + escape(title) + '</h1><p>' + escape(summary) + '</p></div>' +
    (actions && !actions.startsWith("<a ") ? actionMenu("Actions for " + title, actions) : actions) + '</div>';
}

function unitWeightedOccupancy(spaces, isOccupied) {
  const units = new Map();
  for (const space of spaces) {
    const id = space.unit || space.id;
    const unit = units.get(id) ?? { occupied: 0, total: 0 };
    unit.total++;
    if (isOccupied(space)) unit.occupied++;
    units.set(id, unit);
  }
  if (!units.size) return "—";
  const sum = [...units.values()].reduce((total, unit) => total + unit.occupied / unit.total, 0);
  return Math.round(1000 * sum / units.size) / 10 + "%";
}

function dashboard() {
  const active = data.leases.filter(currentLease);
  const spaces = rentableSpaces(data.spaces.filter(activeSpace));
  const occupied = new Set(active.map(lease => lease.space));
  const occupancy = unitWeightedOccupancy(spaces, space => occupied.has(space.id) || occupied.has(space.unit));
  const open = data.maintenance.filter(ticket => !["Resolved", "Completed", "Closed"].includes(ticket.status));
  const balances = {};
  for (const entry of data.ledger.filter(entry => entry.invoice)) {
    const currency = propertyFor(find("leases", entry.lease)?.space)?.currency;
    if (!currency) continue;
    balances[currency] = (balances[currency] ?? 0) + invoiceBalance(entry).remaining;
  }
  const net = Object.entries(balances).map(([currency, cents]) => money(cents / 100, currency)).join(" · ") || "—";
  const metrics = [["Properties", data.properties.filter(property => !property.archived).length, "properties"], ["Occupancy", occupancy, "spaces"],
    ["Outstanding invoices", net, "ledger"], ["Open requests", open.length, "maintenance"]];
  const upcoming = fixedTermsEnding(active, 60).sort((a, b) => a.end.localeCompare(b.end));
  return heading("Portfolio overview", "See occupancy, balances, and work that needs attention.",
    '<button data-add="properties">Add property</button><button data-add="ledger" data-entry="Expense">Record expense</button>') +
    '<div class="metrics">' + metrics.map(([name, value, page]) => '<a class="card metric overview-metric" href="#' + page +
      '"><span>' + escape(name) + '</span><strong>' + escape(value) + '</strong></a>').join("") + '</div>' +
    '<div class="overview-sections"><div class="grid">' + occupancyCard("Units", "Unit", active) + occupancyCard("Rooms", "Room", active) + '</div>' +
    '<section class="card"><div class="overview-header"><h2>Income and expenses</h2><a href="#ledger">Financials</a></div>' +
    '<div class="portfolio-filters"><label>Period<select id="payment-period"><option value="3">3 months</option><option value="6" selected>6 months</option><option value="12">12 months</option></select></label>' +
    '<label>Currency<select id="payment-currency">' + [...new Set(data.properties.map(property => property.currency))].sort()
      .map(currency => '<option>' + escape(currency) + '</option>').join("") + '</select></label></div><div id="payment-trend" aria-live="polite"></div></section>' +
    '<div class="grid">' +
    listCard("Open maintenance", open.slice(0, 5).map(ticket => [ticket.name, ticket.priority, recordLink("maintenance", ticket.id)]), "No open requests.", "maintenance") +
    leaseAgenda(upcoming) + '</div></div>';
}

function occupancyCard(title, type, active) {
  const spaces = rentableSpaces(data.spaces.filter(activeSpace)).filter(space => space.type === type || (type === "Unit" && space.type === unitByRoom));
  const occupied = new Set(active.map(lease => lease.space));
  const filled = spaces.filter(space => occupied.has(space.id) || occupied.has(space.unit)).length;
  const percent = spaces.length ? Math.round(100 * filled / spaces.length) : 0;
  return '<section class="card"><div class="overview-header"><h2>' + title + '</h2><a href="#spaces">Units &amp; rooms</a></div>' +
    (spaces.length ? '<p class="muted">' + filled + ' occupied · ' + (spaces.length - filled) + ' vacant</p>' +
      '<meter aria-label="' + title + ' occupancy" min="0" max="' + spaces.length + '" value="' + filled + '">' + percent + '%</meter>' +
      '<strong>' + percent + '% occupied</strong>' : '<p class="muted">No ' + title.toLowerCase() + ' recorded.</p>') + '</section>';
}

function leaseAgenda(upcoming) {
  const through = localDate(60);
  const events = [
    ...upcoming.filter(lease => lease.end !== lease.tenancyEnd)
      .map(lease => ({ lease, date: lease.end, title: "Fixed term ends" })),
    ...data.leases.filter(lease => lease.start > today && lease.start <= through)
      .map(lease => ({ lease, date: lease.start, title: "Lease starts" })),
    ...data.leases.filter(lease => lease.tenancyEnd >= today && lease.tenancyEnd <= through)
      .map(lease => ({ lease, date: lease.tenancyEnd, title: "Confirmed tenancy ends" }))
  ].sort((a, b) => a.date.localeCompare(b.date));
  return '<section class="card"><div class="overview-header"><h2>Next 60 days</h2><a href="#leases">Leases</a></div>' +
    (events.length ? '<ul class="rows">' + events.map(({ lease, date, title }) =>
      '<li><div>' + tenantLeaseLink(lease) + '<small>' + title + '</small></div><time datetime="' + escape(date) + '">' +
      escape(date) + '</time></li>').join("") + '</ul>' : '<p class="muted">No upcoming lease events.</p>') + '</section>';
}

function renderPaymentTrend() {
  const currency = view.querySelector("#payment-currency").value;
  const months = Number(view.querySelector("#payment-period").value);
  const trend = view.querySelector("#payment-trend");
  if (!currency) {
    trend.innerHTML = '<p class="muted">Add a property to track payments.</p>';
    return;
  }
  const [year, month] = today.split("-").map(Number);
  const totals = new Map();
  for (let offset = months - 1; offset >= 0; offset--) {
    const date = new Date(year, month - 1 - offset, 1);
    const key = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
    totals.set(key, { label: date.toLocaleDateString("en-CA", { month: "short", year: "numeric" }), income: 0, expenses: 0 });
  }
  for (const entry of data.ledger) {
    const bucket = totals.get(entry.date.slice(0, 7));
    if (!bucket || entry.date > today || ledgerProperty(entry)?.currency !== currency) continue;
    if (entry.type === "Expense") bucket.expenses += ledgerCents(entry);
    if (["Payment", depositApplied, "Refund"].includes(entry.type)) bucket.income -= operatingLedgerCents(entry);
  }
  const rows = [...totals.values()];
  const income = rows.reduce((sum, row) => sum + row.income, 0);
  const expenses = rows.reduce((sum, row) => sum + row.expenses, 0);
  const maximum = Math.max(1, ...rows.map(row => Math.max(Math.abs(row.income), row.expenses)));
  const amount = cents => escape(money(cents / 100, currency));
  const series = (label, cents, style) => '<div class="accounting-series"><span>' + label + '</span>' +
    '<span class="payment-track ' + style + '" aria-hidden="true"><span style="width:' +
    (100 * Math.abs(cents) / maximum) + '%"></span></span><strong>' + amount(cents) + '</strong></div>';
  trend.innerHTML = '<dl class="property-stats accounting-totals"><div><dt>Income after refunds</dt><dd>' + amount(income) +
    '</dd></div><div><dt>Expenses</dt><dd>' + amount(expenses) + '</dd></div><div><dt>Income less expenses</dt><dd>' +
    amount(income - expenses) + '</dd></div></dl><ul class="accounting-months">' + rows.map(row =>
      '<li><strong>' + escape(row.label) + '</strong><div>' + series("Income", row.income, "income-track") +
      series("Expenses", row.expenses, "expense-track") + '</div></li>').join("") + '</ul>';
}

function ledgerProperty(entry) {
  return entry.type === "Expense" ? find("properties", entry.property) : propertyFor(find("leases", entry.lease)?.space);
}

function listCard(title, rows, empty, key) {
  return '<section class="card"><h2><a href="#' + key + '">' + title + '</a></h2>' +
    (rows.length ? '<ul class="rows">' + rows.map(([name, detail, url]) => '<li><span>' + (url ? recordAnchor(url, name) : escape(name)) +
      '</span><span>' + escape(detail) + '</span></li>').join("") + '</ul>' : '<p class="muted">' + empty + '</p>') + '</section>';
}

function displayValue(key, record, descriptor) {
  if (key === "spaces" && descriptor.key === "name" && record.unit) {
    const unit = find("spaces", record.unit);
    if (unit) return unit.name + " · " + record.name;
  }
  if (key === "spaces" && descriptor.key === "type" && record.type === unitByRoom) return "Unit";
  if (key === "spaces" && descriptor.key === "rentalSetup") return spaceRentalSetup(record);
  if (key === "ledger" && descriptor.key === "type" && record.invoice) return "Invoice";
  if (key === "leases" && descriptor.key === "term") return leaseTerm(record);
  if (key === "schedules" && descriptor.key === "frequency") return scheduleFrequency(record);
  const value = key === "schedules" && descriptor.key === "amount" ?
    effectiveRent(record, scheduleDueDate(record, scheduleEntries(record)) || today, "amount") : record[descriptor.key];
  if (typeof descriptor.type === "string" && hasView(descriptor.type)) return labelFor(descriptor.type, value);
  if (descriptor.type === "number") {
    const space = key === "leases" ? record.space : find("leases", record.lease)?.space;
    const currency = key === "ledger" ? ledgerProperty(record)?.currency : propertyFor(space)?.currency;
    return currency ? money(Number(value), currency) : value;
  }
  return value || "—";
}

function leasesPage() {
  const scope = propertyScope();
  const linkedLease = find("leases", routeParams().get("lease"));
  const properties = scope ? [scope] : data.properties;
  const leases = linkedLease ? [linkedLease] : scope ? data.leases.filter(lease => propertyFor(lease.space)?.id === scope.id) : data.leases;
  const metrics = [
    ["Active leases", leases.filter(lease => leaseState(lease) === "Active").length],
    ["Fixed terms ending in 30 days", fixedTermsEnding(leases, 30).length],
    ["Scheduled leases", leases.filter(lease => leaseState(lease) === "Scheduled").length]
  ];
  return heading("Leases", views.leases.summary, '<button data-add="leases">Add lease</button>') +
    (linkedLease ? '<p class="scope-link"><a href="#leases">View all leases</a></p>' : "") +
    (linkedLease ? "" : '<div class="metrics lease-metrics">' + metrics.map(([label, count]) =>
      '<div class="card metric"><span>' + label + '</span><strong>' + count + '</strong></div>').join("") + '</div>' +
    '<div class="portfolio-filters"><label>Search leases<input type="search" id="lease-search" placeholder="Tenant, property, unit, or room"></label>' +
    '<label>Lease status<select id="lease-filter"><option value="">All statuses</option><option>Active</option><option>Scheduled</option><option>Ended</option></select></label>' +
    (scope ? "" : '<label>Property<select id="lease-property"><option value="">All properties</option>' +
      properties.map(property => '<option value="' + escape(property.id) + '">' + escape(property.name) + '</option>').join("") + '</select></label>') +
    '</div>') + '<p class="muted lease-count" role="status" id="lease-count"></p><div id="lease-groups"></div>';
}

function leaseRow(lease) {
  const state = leaseState(lease);
  const term = leaseStatus(lease);
  const nextRent = lease.rentChanges?.find(change => change.date > today);
  const tenant = leaseTenantNames(lease);
  const currency = propertyFor(lease.space)?.currency;
  const duration = lease.start + " to " + (lease.end || monthly);
  const url = recordLink("leases", lease.id);
  const space = find("spaces", lease.space);
  const unit = find("spaces", space?.unit);
  const spaceDetails = [unit, space].filter(Boolean).map(item =>
    recordAnchor(recordLink("spaces", item.id, false), item.name)).join(" · ");
  return '<tr data-row-link="' + escape(url) + '"><td><span class="lease-state ' + state.toLowerCase() + '">' + state + '</span></td>' +
    '<td>' + (spaceDetails || "—") + '</td><td>' +
    leaseTenantIds(lease).map(id => recordAnchor(recordLink("tenants", id), labelFor("tenants", id))).join(", ") + '</td><td>' +
    recordAnchor(url, duration) + (state === "Active" && term === "Month-to-month (continued)" ? '<small>' + term + '</small>' : "") +
    (lease.tenancyEnd ? '<small>Confirmed end ' + escape(lease.tenancyEnd) + '</small>' : "") +
    (lease.tenancyEnd && lease.endReason ? '<small>' + escape(lease.endReason) + '</small>' : "") +
    '</td><td>' + escape(currency ? money(Number(effectiveRent(lease, today, "rent")), currency) : effectiveRent(lease, today, "rent")) +
    (nextRent ? '<small>' + escape(nextRent.date + " · " + (currency ? money(Number(nextRent.amount), currency) : nextRent.amount)) + '</small>' : "") +
    (lease.dueDay ? '<small>Due day ' + escape(lease.dueDay) + '</small>' : "") +
    '</td><td class="invoice-action-cell">' + actionMenu("Actions for lease for " + tenant, '<button class="secondary" data-edit="' + escape(lease.id) +
    '" aria-label="Edit lease for ' + escape(tenant) + '">Edit</button>' +
    (["Active", "Scheduled"].includes(state) ? '<button class="secondary" data-change-rent="' + escape(lease.id) + '">Change rent</button>' : "") +
    (lease.tenancyEnd ? '<button class="secondary" data-reactivate-lease="' + escape(lease.id) + '">Reinstate lease</button>' :
      state === "Active" ? '<button class="secondary" data-end-lease="' + escape(lease.id) + '">Terminate lease</button>' : "")) +
    '</td></tr>';
}

function openEndLease(id) {
  const lease = find("leases", id);
  if (!lease || storageError || lease.tenancyEnd || leaseState(lease) !== "Active") return;
  editing = { key: "endLease", id };
  document.querySelector("#editor-title").textContent = "Terminate lease";
  form.querySelector("#fields").innerHTML = '<p>' + escape(labelFor("leases", id)) + '</p>' +
    inputFor(field("tenancyEnd", "Last day of tenancy", "date"), today) +
    inputFor(field("endReason", "Reason for ending the lease"), "") +
    inputFor(field("depositAction", "Deposit", ["Return deposit", "Apply deposit"], true), "")
      .replace("Select deposit", "No deposit action");
  error.textContent = "";
  editor.showModal();
}

function saveLeaseEnd(id, fields) {
  const lease = find("leases", id);
  if (!lease || lease.tenancyEnd || leaseState(lease) !== "Active") return;
  const tenancyEnd = fields.get("tenancyEnd");
  if (!tenancyEnd) {
    error.textContent = "Enter the last day of tenancy.";
    return;
  }
  const endReason = fields.get("endReason").trim();
  if (!endReason) {
    error.textContent = "Enter a reason for ending the lease.";
    return;
  }
  const updated = { ...lease, term: leaseTerm(lease), tenancyEnd, endReason };
  error.textContent = validate("leases", updated, id);
  if (error.textContent) return;
  const next = { ...data, leases: data.leases.map(item => item.id === id ? updated : item) };
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    error.textContent = "This browser could not save the lease end.";
    return;
  }
  data = next;
  editor.close();
  render();
  notify("Lease end saved.");
  const action = fields.get("depositAction");
  if (action) openEditor("ledger", undefined, action === "Apply deposit" ? depositApplied : "Deposit returned",
    undefined, updated, { terminationDate: tenancyEnd });
}

function reactivateLease(id) {
  const lease = find("leases", id);
  if (!lease?.tenancyEnd || storageError) return;
  const updated = { ...lease, term: leaseTerm(lease), tenancyEnd: "", endReason: "" };
  const message = validate("leases", updated, id);
  if (message || leaseState(updated) === "Ended") {
    notify(message || "Extend the fixed term or enable month-to-month continuation before reinstating this lease.");
    return;
  }
  if (!confirm("Reinstate this lease and clear its confirmed termination?")) return;
  const next = { ...data, leases: data.leases.map(item => item.id === id ? updated : item) };
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    notify("This browser could not reinstate the lease.");
    return;
  }
  data = next;
  render();
  notify("Lease reinstated.");
}

function filterLeases() {
  const search = view.querySelector("#lease-search")?.value.trim().toLowerCase() ?? "";
  const status = view.querySelector("#lease-filter")?.value;
  const property = propertyScope()?.id || view.querySelector("#lease-property")?.value;
  const linkedLease = find("leases", routeParams().get("lease"));
  const groups = new Map();
  const matches = data.leases.filter(lease => {
    const building = propertyFor(lease.space);
    const searchable = labelFor("leases", lease.id).toLowerCase();
    return (!linkedLease || linkedLease.id === lease.id) && (!property || building?.id === property) &&
      (!status || leaseState(lease) === status) && searchable.includes(search);
  });
  for (const lease of matches.sort((first, second) => second.start.localeCompare(first.start))) {
    const id = propertyFor(lease.space)?.id ?? "";
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(lease);
  }
  view.querySelector("#lease-count").textContent = matches.length ? matches.length + (matches.length === 1 ? " lease" : " leases") : "No matching leases.";
  view.querySelector("#lease-groups").innerHTML = [...groups].map(([id, leases]) => {
    const name = escape(find("properties", id)?.name ?? "Unassigned property");
    return '<details class="lease-group" open><summary><strong>' + name + '</strong><span>' + leases.length + '</span></summary>' +
      '<div class="card table" tabindex="0" role="region" aria-label="Leases for ' + name + '"><table><thead><tr>' +
      ["Status", "Unit or room", "Tenant", "Duration", "Monthly rent", "Actions"]
        .map(label => '<th scope="col">' + label + '</th>').join("") +
      '</tr></thead><tbody>' + leases.map(leaseRow).join("") + '</tbody></table></div></details>';
  }).join("");
}

function tenantLeaseLink(lease) {
  return '<a href="#leases?lease=' + escape(encodeURIComponent(lease.id)) + '">' +
    escape(labelFor("spaces", lease.space)) + '</a>';
}

function tenantLeases(tenant, scope) {
  return data.leases.filter(lease => leaseTenantIds(lease).includes(tenant.id) &&
    (!scope || propertyFor(lease.space)?.id === scope.id)).sort((a, b) => b.start.localeCompare(a.start));
}

function tenantsPage() {
  const tenant = find("tenants", routeParams().get("tenant"));
  const scope = propertyScope();
  if (tenant) {
    const leases = tenantLeases(tenant, scope);
    const contact = views.tenants.fields.filter(field => field.key !== "name" && tenant[field.key]);
    return '<p class="scope-link">' + recordAnchor(scope ? propertyLink("tenants", scope.id) : "#tenants", "Back to tenants") + '</p>' +
      heading(tenant.name, "Tenant profile", '<div class="billing-actions"><button class="secondary" data-edit="' +
        escape(tenant.id) + '">Edit tenant</button><button data-add="leases">Add lease</button></div>') +
      '<div class="grid"><section class="card"><h2>Contact details</h2><dl class="tenant-contact">' +
      contact.map(field => '<div><dt>' + escape(field.label) + '</dt><dd>' + escape(tenant[field.key]) + '</dd></div>').join("") +
      '</dl></section><section class="card"><h2>Lease history</h2>' +
      (leases.length ? '<ul class="rows">' + leases.map(lease => '<li><div>' + tenantLeaseLink(lease) +
        '<small>' + escape(lease.start + " to " + (lease.tenancyEnd || (currentLease(lease) && rollsOver(lease) && lease.end < today ? monthly : lease.end || monthly))) +
        '</small></div><span>' + leaseState(lease) + '</span></li>').join("") + '</ul>' : '<p class="muted">No lease on file.</p>') +
      '</section></div>' + tenantBilling(tenant, leases);
  }
  return heading("Tenants", views.tenants.summary, scope ? '<a href="#tenants">All tenants</a>' : '<button data-add="tenants">Add tenant</button>') +
    '<div class="portfolio-filters"><label>Search tenants<input id="tenant-search" type="search" placeholder="Name, contact, property, unit, or room"></label>' +
    (scope ? "" : '<label>Property<select id="tenant-property"><option value="">All properties</option>' +
    data.properties.map(property => '<option value="' + escape(property.id) + '">' + escape(property.name) + '</option>').join("") +
    '</select></label>') + '<label>Lease status<select id="tenant-status"><option value="">All statuses</option><option>Active</option>' +
    '<option>Scheduled</option><option>Ended</option><option>No lease</option></select></label></div>' +
    '<p class="muted lease-count" id="tenant-count" role="status"></p><div id="tenant-results"></div>';
}

function tenantBillingEntries(tenant, leases) {
  const leaseIds = new Set(leases.map(lease => lease.id));
  const depositsById = new Map(depositActivity(data.ledger).map(entry => [entry.id, entry]));
  const entries = data.ledger.filter(entry => leaseIds.has(entry.lease) &&
    (!entry.billedTenant || entry.billedTenant === tenant.id));
  return {
    deposits: entries.filter(entry => depositsById.has(entry.id)).map(entry => depositsById.get(entry.id)),
    transactions: entries.map(entry => depositsById.get(entry.id) ?? entry)
  };
}

function tenantBilling(tenant, leases) {
  const leaseIds = new Set(leases.map(lease => lease.id));
  const related = record => leaseIds.has(record.lease) && (!record.billedTenant || record.billedTenant === tenant.id);
  const schedules = data.schedules.filter(schedule => related(schedule) && schedule.state === "Active" &&
    scheduleDueDate(schedule, scheduleEntries(schedule)));
  const { deposits, transactions } = tenantBillingEntries(tenant, leases);
  const history = transactions.filter(entry => matchesTransactionType(entry, ""));
  const action = (kind, title, key = "ledger") =>
    '<button class="secondary" data-add="' + key + '" data-entry="' + kind + '">' + title + '</button>';
  const section = (title, action, empty, content) =>
    '<section class="profile-billing-section"><div class="overview-header"><h2>' + title + '</h2>' +
    (action ? actionMenu("Actions for " + title, action) : "") +
    '</div>' + (content || '<p class="card muted">' + empty + '</p>') + '</section>';
  return '<div class="overview-sections profile-billing">' +
    section("Active recurring invoices", '<div class="billing-actions">' + action("Invoice", "Create invoice") +
      action("", "Create recurring invoice", "schedules") + '</div>',
      "No active recurring invoices.", schedules.length && recordTable("schedules", schedules)) +
    section("Deposits", '<div class="billing-actions">' + action("Deposit received", "Record deposit") +
      action(depositApplied, "Apply deposit") + action("Deposit returned", "Return deposit") + '</div>',
      "No deposit records.", deposits.length && depositSummary(deposits)) +
    section("Transaction history", "", "", '<div class="portfolio-filters">' + transactionTypeField("tenant-history") + transactionDateFields("tenant-history") +
      '</div><p id="tenant-history-message" class="muted" role="status"></p><div id="tenant-history-results">' +
      (history.length ? transactionTable(history) : '<p class="card muted">No transactions recorded.</p>') + '</div>') +
    '</div>';
}

function depositSummary(entries) {
  const accounts = [];
  for (const entry of entries) {
    let account = accounts.find(item => sameDepositAccount(item, entry));
    if (!account) {
      account = { lease: entry.lease, billedTenant: entry.billedTenant, received: 0, returned: 0, applied: 0 };
      accounts.push(account);
    }
    account[entry.type === depositTypes[0] ? "received" : entry.type === depositApplied ? "applied" : "returned"] += depositCents(entry);
  }
  return '<div class="deposit-summary">' + accounts.map(account => {
    const lease = find("leases", account.lease);
    const currency = propertyFor(lease.space)?.currency;
    const amount = cents => escape(currency ? money(cents / 100, currency) : (cents / 100).toFixed(2));
    const balance = account.received - account.returned - account.applied;
    return '<section class="card"><h3>' + tenantLeaseLink(lease) + (account.billedTenant ? "" : " · Lease-wide") +
      '</h3><dl class="property-stats"><div><dt>Received</dt><dd>' + amount(account.received) +
      '</dd></div><div><dt>Returned</dt><dd>' + amount(account.returned) +
      '</dd></div><div><dt>Applied</dt><dd>' + amount(account.applied) +
      '</dd></div><div><dt>' + (balance < 0 ? "Overdrawn" : "Remaining deposit") +
      '</dt><dd>' + amount(Math.abs(balance)) + '</dd></div></dl>' +
      (balance < 0 ? '<p class="deposit-warning">Returns and applications exceed the deposits received.</p>' : "") + '</section>';
  }).join("") + '</div>';
}

function depositActivity(entries) {
  const depositInvoices = new Map(entries.filter(isDepositInvoice).map(invoice => [invoice.id, invoice]));
  return entries.flatMap(entry => {
    if (isDeposit(entry)) return [entry];
    const invoice = depositInvoices.get(entry.invoiceId);
    if (entry.type !== "Payment" || !invoice) return [];
    const lease = find("leases", invoice.lease);
    const tenants = lease ? leaseTenantIds(lease) : [];
    return [{
      ...entry, type: "Deposit received",
      billedTenant: entry.billedTenant || invoice.billedTenant || (tenants.length === 1 ? tenants[0] : "")
    }];
  });
}

function depositsByDate(entries, account, source) {
  const byDate = new Map();
  for (const entry of depositActivity(entries)) {
    if (!sameDepositAccount(entry, account)) continue;
    if (source && (entry.depositInvoiceId || entry.invoiceId) !== source) continue;
    const signed = entry.type === depositTypes[0] ? depositCents(entry) : -depositCents(entry);
    byDate.set(entry.date, (byDate.get(entry.date) ?? 0) + signed);
  }
  return byDate;
}

function worsensDepositBalance(next, account, source) {
  const before = depositsByDate(data.ledger, account, source);
  const after = depositsByDate(next, account, source);
  let previousBalance = 0;
  let balance = 0;
  for (const date of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    previousBalance += before.get(date) ?? 0;
    balance += after.get(date) ?? 0;
    if (balance < Math.min(0, previousBalance)) return true;
  }
  return false;
}

function filterTenants() {
  const search = view.querySelector("#tenant-search").value.trim().toLowerCase();
  const scope = propertyScope();
  const property = scope?.id || view.querySelector("#tenant-property")?.value;
  const status = view.querySelector("#tenant-status").value;
  const rows = [];
  const tenants = [...data.tenants].sort((a, b) => a.name.localeCompare(b.name));
  for (const tenant of tenants) {
    const leases = data.leases.filter(lease => leaseTenantIds(lease).includes(tenant.id));
    const contactMatches = [tenant.name, tenant.email, tenant.phone, tenant.alternateEmail, tenant.alternatePhone]
      .some(value => value?.toLowerCase().includes(search));
    const matches = leases.filter(lease => (!property || propertyFor(lease.space)?.id === property) &&
      (!status || leaseState(lease) === status) && (contactMatches || labelFor("spaces", lease.space).toLowerCase().includes(search)));
    if (!matches.length && (leases.length || property || (status && status !== "No lease") || !contactMatches)) continue;
    const recent = matches.sort((a, b) => b.start.localeCompare(a.start));
    const lease = recent.find(currentLease) ?? recent.find(item => leaseState(item) === "Scheduled") ?? recent[0];
    const url = recordLink("tenants", tenant.id);
    rows.push('<tr data-row-link="' + escape(url) + '"><td>' + recordAnchor(url, tenant.name) + '</td>' +
      '<td>' + escape(tenant.email || "—") + (tenant.phone ? '<small>' + escape(tenant.phone) + '</small>' : "") + '</td>' +
      '<td>' + (lease ? tenantLeaseLink(lease) : "—") + '</td><td>' + (lease ? leaseState(lease) : "No lease") + '</td></tr>');
  }
  view.querySelector("#tenant-count").textContent = rows.length ? rows.length + (rows.length === 1 ? " tenant" : " tenants") : "No matching tenants.";
  view.querySelector("#tenant-results").innerHTML = rows.length ?
    '<div class="card table tenant-table" tabindex="0" role="region" aria-label="Tenant directory"><table><thead><tr>' +
    ["Tenant", "Contact", "Property and rental space", "Lease status"].map(label => '<th scope="col">' + label + '</th>').join("") +
    '</tr></thead><tbody>' + rows.join("") + '</tbody></table></div>' : "";
}

const transactionDatePresets = ["All dates", "Current month", "Last 30 days", "Previous month", "Last 3 months",
  "Previous quarter", "Last 12 months", "Current year", "Custom date range"];

function transactionTypeField(prefix) {
  return '<label>Entry type<select id="' + prefix + '-type"><option value="">All entries</option>' +
    ["Invoice", "Charge", "Payment", "Refund", ...(prefix === "ledger" ? ["Expense"] : []), ...depositTypes].map(type => '<option>' + type + '</option>').join("") + '</select></label>';
}

function matchesTransactionType(entry, type) {
  if (type) return type === (entry.invoice ? "Invoice" : entry.type);
  return !entry.invoiceId || !["Payment", "Deposit received", depositApplied].includes(entry.type);
}

function transactionDateFields(prefix) {
  return '<label>Date range<select id="' + prefix + '-date-range" data-transaction-date="' + prefix + '">' +
    transactionDatePresets.map(label => '<option>' + label + '</option>').join("") + '</select></label>' +
    '<label hidden>From date<input type="date" id="' + prefix + '-from" data-transaction-date="' + prefix + '"></label>' +
    '<label hidden>To date<input type="date" id="' + prefix + '-to" data-transaction-date="' + prefix + '"></label>';
}

function selectedTransactionDates(prefix) {
  const read = name => view.querySelector("#" + prefix + "-" + name).value;
  const preset = read("date-range");
  return preset === "Custom date range" ? [read("from"), read("to")] : transactionDateRange(preset);
}

function filterTenantHistory() {
  const tenant = find("tenants", routeParams().get("tenant"));
  const { transactions } = tenantBillingEntries(tenant, tenantLeases(tenant, propertyScope()));
  const [from, to] = selectedTransactionDates("tenant-history");
  const type = view.querySelector("#tenant-history-type").value;
  const invalid = from && to && from > to;
  const entries = transactions.filter(entry => matchesTransactionType(entry, type) &&
    (!from || entry.date >= from) && (!to || entry.date <= to));
  view.querySelector("#tenant-history-message").textContent = invalid ? "The from date must be on or before the to date." :
    entries.length ? "" : transactions.length ? "No matching transactions." : "No transactions recorded.";
  view.querySelector("#tenant-history-results").innerHTML = entries.length ? transactionTable(entries) : "";
}

function transactionDateRange(preset) {
  const [year, month] = today.split("-").map(Number);
  const date = (offset, day) => new Date(year, month - 1 + offset, day).toLocaleDateString("sv-SE");
  const quarterStart = -((month - 1) % 3);
  switch (preset) {
    case "Current month": return [date(0, 1), date(1, 0)];
    case "Last 30 days": return [localDate(-29), today];
    case "Previous month": return [date(-1, 1), date(0, 0)];
    case "Last 3 months": return [date(-2, 1), today];
    case "Previous quarter": return [date(quarterStart - 3, 1), date(quarterStart, 0)];
    case "Last 12 months": return [date(-11, 1), today];
    case "Current year": return [year + "-01-01", year + "-12-31"];
    default: return ["", ""];
  }
}

function financialsPage() {
  const scope = propertyScope();
  const ledgerUrl = scope ? propertyLink("ledger", scope.id) : "#ledger";
  return heading(scope ? "Rent ledger" : "Financials", "",
    '<div class="billing-actions"><button class="secondary" data-add="ledger">Add ledger entry</button><button class="secondary" data-add="ledger" data-entry="Refund">Record refund</button>' +
    '<button data-add="ledger" data-entry="Invoice">Create invoice</button><button data-add="ledger" data-entry="Expense">Record expense</button></div>') +
    '<nav class="property-tabs" aria-label="Financial views"><a href="' + escape(ledgerUrl) + '"' +
    ' aria-current="page">Transactions</a>' +
    recordAnchor(scope ? propertyLink("schedules", scope.id) : "#schedules", "Recurring invoices") + '</nav>' +
    '<div class="transaction-statuses" role="group" aria-label="Invoice status">' +
    ["All", "Open", "Partially paid", "Overdue", "Paid", "Partially refunded", "Refunded", "Void"].map(status =>
      '<button type="button" class="secondary" data-ledger-status="' + status + '" aria-pressed="' + (status === "All") + '">' + status + '</button>').join("") + '</div>' +
    '<div class="portfolio-filters"><label>Search transactions<input type="search" id="ledger-search" placeholder="Tenant, rental space, category, or reference"></label>' +
    transactionTypeField("ledger") +
    transactionDateFields("ledger") +
    (scope ? "" : '<label>Property<select id="ledger-property"><option value="">All properties</option>' +
      data.properties.map(property => '<option value="' + escape(property.id) + '">' + escape(property.name) + '</option>').join("") + '</select></label>') +
    '</div><div class="metrics lease-metrics ledger-metrics" id="ledger-totals"></div><p class="muted lease-count" id="ledger-count" role="status"></p><div id="ledger-results"></div>';
}

function transactionTable(entries) {
  const deposits = depositActivity(data.ledger);
  let month = "";
  return '<div class="card table transaction-table" tabindex="0" role="region" aria-label="Transactions"><table><thead><tr>' +
    ["Status", "Due / entry date", "Category", "Rental space", "Contact", "Total", "Balance", "Actions"]
      .map(label => '<th scope="col">' + label + '</th>').join("") +
    '</tr></thead><tbody>' + [...entries].sort((a, b) => b.date.localeCompare(a.date)).map(invoice => {
      const lease = find("leases", invoice.lease);
      const currency = ledgerProperty(invoice)?.currency;
      const balance = invoice.invoice ? invoiceBalance(invoice) : null;
      const display = cents => escape(currency ? money(cents / 100, currency) : (cents / 100).toFixed(2));
      const url = recordLink("ledger", invoice.id);
      const dateMonth = invoice.date.slice(0, 7);
      const monthHeader = month === dateMonth ? "" : '<tr class="transaction-month"><th colspan="8" scope="row">' +
        escape(new Date(dateMonth + "-02T12:00:00").toLocaleDateString("en-CA", { month: "long", year: "numeric" })) + '</th></tr>';
      month = dateMonth;
      const category = invoice.invoice ? invoiceCategoryLabel(invoice) : isDeposit(invoice) ? "Deposit" : invoice.category || invoice.type;
      const label = invoice.invoice ? invoice.reference || "Invoice" : invoice.type;
      const actions = invoice.invoice ? actionMenu("Actions for " + label, invoiceActions(invoice, deposits)) :
        actionMenu("Actions for " + label, nonInvoiceActions(invoice));
      const statusClass = balance?.overdue ? "overdue" : balance?.status === "Paid" ? "paid" : "pending";
      return monthHeader + '<tr data-row-link="' + escape(url) + '"><td>' +
        (balance ? '<span class="transaction-status ' + statusClass + '">' + invoiceStatusText(balance) + '</span>' : "Recorded") +
        '</td><td class="transaction-date">' + escape(invoice.date) + '</td><td>' + escape(category) +
        '<small>' + recordAnchor(url, label) + (invoice.note ? ' · ' + escape(invoice.note) : "") + '</small>' +
        (!invoice.invoice && (invoice.reference || invoice.invoiceId || invoice.depositInvoiceId) ?
          '<small>' + recordCell("ledger", invoice, { key: "reference" }) + '</small>' : "") + '</td><td>' +
        escape(invoice.type === "Expense" ? labelFor("properties", invoice.property) : labelFor("spaces", lease?.space)) + '</td><td>' +
        escape(invoice.billedTenant ? labelFor("tenants", invoice.billedTenant) : lease ? leaseTenantNames(lease) : "—") +
        '</td><td class="transaction-money">' + display(invoice.type === "Expense" || invoice.type === "Refund" || invoice.type === "Deposit returned" ?
          -depositCents(invoice) : depositCents(invoice)) + '</td><td class="transaction-money">' +
        (balance ? '<strong>' + display(balance.remaining) + '</strong>' : "—") +
        '</td><td class="invoice-action-cell">' + actions + '</td></tr>';
    }).join("") + '</tbody></table></div>';
}

function nonInvoiceActions(entry) {
  const id = escape(entry.id);
  return '<button type="button" class="secondary" data-record-key="ledger" data-edit="' + id + '">Edit</button>' +
    (entry.type === "Charge" ? ' <button type="button" class="secondary" data-record-key="ledger" data-edit="' + id +
      '" data-entry="Invoice">Convert to invoice</button>' : "");
}

function invoiceActions(invoice, deposits) {
  const id = escape(invoice.id);
  const payments = paymentTotal(invoicePayments(invoice.id));
  const balance = invoiceBalance(invoice);
  const outstanding = !invoice.voidedOn && payments < ledgerCents(invoice);
  const deposit = isDepositInvoice(invoice);
  const lease = find("leases", invoice.lease);
  const tenants = invoice.billedTenant ? [invoice.billedTenant] : lease ? leaseTenantIds(lease) : [];
  const canApply = outstanding && !deposit && tenants.some(billedTenant =>
    deposits.filter(entry => entry.date <= today && sameDepositAccount(entry, { lease: invoice.lease, billedTenant }))
      .reduce((balance, entry) => balance + (entry.type === "Deposit received" ? depositCents(entry) : -depositCents(entry)), 0) > 0);
  const action = (key, label) => '<button type="button" class="secondary" data-invoice-action="' + key + '" data-invoice-id="' + id + '">' + label + '</button>';
  const canReturn = deposit && balance.paid >= ledgerCents(invoice) && tenants.some(billedTenant =>
    [...depositsByDate(data.ledger, { lease: invoice.lease, billedTenant }, invoice.id)]
      .reduce((sum, [date, cents]) => sum + (date <= today ? cents : 0), 0) > 0);
  return (invoice.voidedOn ? "" : '<button type="button" class="secondary" data-record-key="ledger" data-edit="' + id + '">Edit</button>') +
    (outstanding ? '<button type="button" class="secondary" data-add="ledger" data-entry="Payment" data-invoice-id="' + id + '">Add payment</button>' : "") +
    (canApply ? '<button type="button" class="secondary" data-invoice-action="apply" data-invoice-id="' + id + '">Apply deposit</button>' : "") +
    '<button type="button" class="secondary" data-invoice-action="clone" data-invoice-id="' + id + '">Clone invoice</button>' +
    (!invoice.voidedOn && !invoice.schedule && !deposit ? action("recurring", "Make recurring") : "") +
    (outstanding && !payments ? action("void", "Void invoice") : "") +
    (!deposit && !invoice.voidedOn && !balance.remaining && balance.paid > balance.refunded ? action("refund", "Record refund") : "") +
    (canReturn ? action("return", "Return deposit") : "");
}

function recordDetails(key, record) {
  const scope = propertyScope();
  const { title, fields } = views[key];
  const name = key === "ledger" ? (record.invoice ? record.reference || "Invoice" : record.type) : record.name || record.note || title;
  let back = scope ? propertyLink(key, scope.id) : "#" + key;
  if (key === "spaces" && record.unit) back = recordLink("spaces", record.unit);
  const detailFields = key === "ledger" && record.type === "Expense" ?
    fields.map(descriptor => descriptor.key === "lease" ? field("property", "Property", "properties") : descriptor) : fields;
  const details = detailFields.map(descriptor => '<div><dt>' + escape(record.invoice && descriptor.key === "date" ? "Due date" : descriptor.label) + '</dt><dd>' +
    recordCell(key, record, descriptor, false) + '</dd></div>').join("");
  const edit = '<div class="billing-actions">' + (key === "spaces" && record.type === "Room" ?
    roomEditButton(record) : '<button data-record-key="' + key + '" data-edit="' + escape(record.id) + '">Edit record</button>') +
    (key === "spaces" && record.type !== "Room" ? '<button class="secondary" data-edit-unit-media="' +
      escape(record.id) + '">Edit description &amp; photos</button>' : "") + '</div>';
  const related = key === "spaces" ? '<section class="card"><h2>Leases</h2>' +
    spaceLeases(record, record.type !== "Room") + '</section>' +
    listCard("Maintenance", data.maintenance.filter(item => item.space === record.id)
      .map(item => [item.name, item.status, recordLink("maintenance", item.id)]), "No records yet.", "maintenance") : "";
  return '<p class="scope-link">' + recordAnchor(back, "Back to " + title) + '</p>' +
    heading(name, title, key === "ledger" && record.invoice ? invoiceActions(record, depositActivity(data.ledger)) : edit) +
    '<div class="overview-sections">' + (key === "ledger" && record.invoice ? invoicePaymentSummary(record) : "") +
    '<section class="card"><h2>Details</h2><dl class="tenant-contact">' + details +
    (record.invoice ? '<div><dt>Invoice date</dt><dd>' + escape(invoiceDate(record)) +
      '</dd></div><div><dt>Category</dt><dd>' + escape(invoiceCategoryLabel(record)) + '</dd></div>' : "") +
    (record.voidedOn ? '<div><dt>Voided on</dt><dd>' + escape(record.voidedOn) + '</dd></div>' : "") +
    (record.billedTenant ? '<div><dt>Billed to</dt><dd>' + recordAnchor(recordLink("tenants", record.billedTenant), labelFor("tenants", record.billedTenant)) + '</dd></div>' : "") +
    '</dl>' + (key === "spaces" ? roomContent(record) : "") + '</section>' +
    (key === "spaces" && record.type === unitByRoom ? unitRooms(record) : "") + related + '</div>';
}

function roomEditButton(room) {
  return '<button class="secondary" data-edit-room="' + escape(room.id) + '" data-parent-unit="' +
    escape(room.unit) + '">Edit room</button>';
}

function roomContent(room) {
  return (room.description ? '<p>' + escape(room.description) + '</p>' : "") +
    '<div class="room-photos">' + (room.photos || []).filter(photo => photoPattern.test(photo)).map(photo =>
      '<img src="' + escape(photo) + '" alt="' + escape(room.name) + '" loading="lazy">').join("") + '</div>';
}

function unitRooms(unit) {
  const rooms = leaseRoomOptions(unit);
  return '<section class="card"><h2>Rooms</h2>' + (rooms.length ? '<div class="room-list">' +
    rooms.map(room => '<article><div class="overview-header"><h3>' +
      (find("spaces", room.id) ? recordAnchor(recordLink("spaces", room.id), room.name) : escape(room.name)) + '</h3>' +
      actionMenu("Actions for " + room.name, roomEditButton(room)) + '</div>' + roomContent(room) + spaceLeases(room) + '</article>').join("") + '</div>' :
    '<p>Set the unit’s bedroom count to see its rooms.</p>') + '</section>';
}

function spaceLeases(space, includeRooms = false) {
  const leases = data.leases.filter(lease => lease.space === space.id ||
    (includeRooms && find("spaces", lease.space)?.unit === space.id)).sort((a, b) => b.start.localeCompare(a.start));
  return leases.length ? '<ul class="rows">' + leases.map(lease => {
    const room = lease.space === space.id ? null : find("spaces", lease.space);
    const state = leaseState(lease);
    const url = propertyLink("leases", space.property) + "&lease=" + encodeURIComponent(lease.id);
    return '<li><span>' + (room ? recordAnchor(recordLink("spaces", room.id), room.name) + ' · ' : "") +
      recordAnchor(url, leaseTenantNames(lease) + " · " + lease.start) +
      '</span><span class="lease-state ' + state.toLowerCase() + '">' + state + '</span></li>';
  }).join("") + '</ul>' : '<p class="muted">No leases yet.</p>';
}
function invoicePaymentSummary(invoice) {
  const balance = invoiceBalance(invoice);
  const { paid, remaining } = balance;
  const currency = propertyFor(find("leases", invoice.lease)?.space)?.currency;
  const amount = cents => currency ? money(cents / 100, currency) : (cents / 100).toFixed(2);
  const payments = [...invoicePayments(invoice.id), ...data.ledger.filter(entry =>
    entry.type === "Refund" && entry.invoiceId === invoice.id)].sort((a, b) => b.date.localeCompare(a.date));
  return '<section class="card"><h2>Invoice balance</h2><dl class="property-stats"><div><dt>Status</dt><dd>' + invoiceStatusText(balance) +
    '</dd></div><div><dt>Paid</dt><dd>' + escape(amount(paid)) + '</dd></div>' +
    (balance.refunded ? '<div><dt>Refunded</dt><dd>' + escape(amount(balance.refunded)) + '</dd></div>' : "") +
    '<div><dt>Remaining</dt><dd>' +
    escape(amount(remaining)) + '</dd></div></dl><meter aria-label="Invoice payment progress" min="0" max="' +
    ledgerCents(invoice) + '" value="' + paid + '"></meter><h3>Payment history</h3>' +
    (payments.length ? '<div class="table" tabindex="0" role="region" aria-label="Payment history"><table><thead><tr>' +
      '<th scope="col">Payment date</th><th scope="col">Method</th><th scope="col">Amount applied</th></tr></thead><tbody>' +
      payments.map(payment => '<tr><td>' + recordAnchor(recordLink("ledger", payment.id), payment.date) +
        '</td><td>' + escape(payment.type === depositApplied ? "Deposit applied" : payment.type === "Refund" ?
          "Refund · " + payment.method : payment.method || "—") + '</td><td>' + escape(amount(-ledgerCents(payment))) +
        '</td></tr>').join("") + '</tbody></table></div>' : '<p class="muted">No payments applied to this invoice.</p>') + '</section>';
}

function recordCell(key, record, descriptor, linkName = true) {
  if (key === "ledger" && descriptor.key === "category") {
    const invoice = record.invoice ? record : find("ledger", record.invoiceId);
    return escape(invoice?.invoice ? invoiceCategoryLabel(invoice) : record.category || (isDeposit(record) ? "Deposit" : "—"));
  }
  const value = displayValue(key, record, descriptor);
  if (key === "ledger" && linkName && record.invoice && descriptor.key === "date") return escape(invoiceDate(record));
  if (descriptor.type === "properties" && find("properties", record.property)) return recordAnchor(propertyLink("spaces", record.property), value);
  if (descriptor.type === "spaces" && find("spaces", record.space)) return recordAnchor(recordLink("spaces", record.space, false), value);
  if (descriptor.type === "leases" && find("leases", record.lease)) return recordAnchor(recordLink("leases", record.lease), value);
  if (linkName && ["name", "type", "note"].includes(descriptor.key) &&
    (descriptor.key === "name" || (key === "ledger" && descriptor.key === "type") || (key === "schedules" && descriptor.key === "note"))) {
    return recordAnchor(recordLink(key, record.id), value) +
      (key === "ledger" && record.invoice ? '<small>' + invoiceStatusText(invoiceBalance(record)) + '</small>' : "");
  }
  if (key === "ledger" && descriptor.key === "reference" && (record.invoiceId || record.depositInvoiceId)) {
    const references = record.reference ? [escape(record.reference)] : [];
    if (record.depositInvoiceId) {
      const source = find("ledger", record.depositInvoiceId);
      references.push(recordAnchor(recordLink("ledger", record.depositInvoiceId), source?.reference || "Deposit invoice"));
    }
    if (record.invoiceId) {
      const invoice = find("ledger", record.invoiceId);
      references.push((record.depositInvoiceId ? "Applied to " : "") +
        recordAnchor(recordLink("ledger", record.invoiceId), invoice?.reference || "Invoice"));
    }
    return references.join("<br>");
  }
  return escape(value);
}

function filterFinancials() {
  const read = name => view.querySelector("#ledger-" + name)?.value ?? "";
  const property = propertyScope()?.id || read("property");
  const search = read("search").trim().toLowerCase();
  const type = read("type");
  const status = view.querySelector('[data-ledger-status][aria-pressed="true"]')?.dataset.ledgerStatus ?? "All";
  const [from, to] = selectedTransactionDates("ledger");
  const totals = new Map();
  const entries = [];
  const heldEntries = new Map(depositActivity(data.ledger).map(entry => [entry.id, entry]));
  for (const original of data.ledger) {
    const entry = heldEntries.get(original.id) ?? original;
    if (!matchesTransactionType(entry, type)) continue;
    const date = entry.date;
    const building = ledgerProperty(entry);
    const category = entry.invoice ? invoiceCategoryLabel(entry) :
      entry.invoiceId ? invoiceCategoryLabel(find("ledger", entry.invoiceId) ?? {}) : isDeposit(entry) ? "Deposit" : "";
    const searchable = [labelFor("leases", entry.lease), building?.name, labelFor("tenants", entry.billedTenant), entry.note, entry.reference, category,
      find("ledger", entry.depositInvoiceId)?.reference, find("ledger", entry.invoiceId)?.reference].join(" ").toLowerCase();
    if ((property && building?.id !== property) ||
      (from && date < from) || (to && date > to) || !searchable.includes(search)) continue;
    if (status !== "All") {
      if (!entry.invoice) continue;
      const balance = invoiceBalance(entry);
      if (status === "Overdue" ? !balance.overdue : balance.status !== status) continue;
    }
    entries.push(entry);
    const currency = building?.currency;
    if (!currency || !entry.invoice) continue;
    if (!totals.has(currency)) totals.set(currency, { payments: 0, remaining: 0, overdue: 0 });
    const amounts = totals.get(currency);
    const balance = invoiceBalance(entry);
    if (!isDepositInvoice(entry)) amounts.payments += balance.paid - balance.refunded;
    amounts.remaining += balance.remaining;
    amounts.overdue += balance.overdue ? balance.remaining : 0;
  }
  const metrics = [["Outstanding", "remaining"], ["Net revenue", "payments"], ["Overdue", "overdue"]];
  view.querySelector("#ledger-totals").innerHTML = metrics.map(([label, key]) =>
    '<div class="card metric"><span>' + label + '</span><strong>' + (Array.from(totals, ([currency, amounts]) =>
      escape(money(amounts[key] / 100, currency))).join("<br>") || "—") + '</strong></div>').join("");
  view.querySelector("#ledger-count").textContent = from && to && from > to ? "The from date must be on or before the to date." :
    entries.length ? entries.length + (entries.length === 1 ? " entry" : " entries") : "No matching entries.";
  view.querySelector("#ledger-results").innerHTML = entries.length ? transactionTable(entries) : "";
}

const scheduleFrequency = schedule => schedule.frequency || billingFrequencies[0];
const billingIntervalDays = schedule => ({ Weekly: 7, "Every two weeks": 14 })[scheduleFrequency(schedule)] || 0;

function sameBillingCycle(a, b) {
  if (scheduleFrequency(a) !== scheduleFrequency(b)) return false;
  const days = billingIntervalDays(a);
  if (days) return (Date.parse(a.start) - Date.parse(b.start)) % (days * 86400000) === 0;
  return (a.billingDay ?? Number(a.start.slice(-2))) === (b.billingDay ?? Number(b.start.slice(-2)));
}

function scheduleDate(schedule, offset) {
  const days = billingIntervalDays(schedule);
  if (days) return postingDate(schedule.start, -days * offset);
  const [year, month, day] = schedule.start.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(Math.min(schedule.billingDay ?? day, lastDay)).padStart(2, "0")].join("-");
}

function scheduleEntries(schedule) {
  return data.ledger.filter(entry => entry.schedule === schedule.id).length;
}

function scheduleDueDate(schedule, offset) {
  const lease = find("leases", schedule.lease);
  const date = scheduleDate(schedule, offset);
  const end = lease && occupancyEnd(lease);
  return lease && date >= lease.start && (!end || date <= end) && (!schedule.end || date <= schedule.end) ? date : "";
}

function postingDate(due, leadDays) {
  const date = new Date(due + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() - Number(leadDays || 0));
  return date.toISOString().slice(0, 10);
}

function invoiceEntry(lease, date, amount, note, billedTenant, schedule, issueDate = date, category, customCategory) {
  const id = crypto.randomUUID();
  return { id, lease, date, issueDate, amount, note, category, customCategory, type: "Charge", invoice: true, billedTenant, schedule, reference: "INV-" + id.slice(0, 12).toUpperCase() };
}

function schedulesPage() {
  const scope = propertyScope();
  return heading("Recurring invoices",
    "Saving posts ready invoices for that schedule. Use Post ready invoices to run billing for all active schedules.",
    '<div class="billing-actions"><button class="secondary" data-run-billing>Post ready invoices</button>' +
    '<button class="secondary" data-post-ahead>Post ahead</button><button data-add="schedules">Add recurring invoice</button></div>') +
    '<p class="scope-link"><a href="' + escape(scope ? propertyLink("ledger", scope.id) : "#ledger") + '">Back to Financials</a></p>' +
    '<div class="portfolio-filters" id="schedule-filters">' +
    (scope ? "" : '<label>Property<select id="schedule-property"></select></label>') +
    '<label>Unit<select id="schedule-unit"></select></label>' +
    '<label>Room<select id="schedule-room"></select></label>' +
    '<label>Billed to<select id="schedule-tenant"></select></label></div>' +
    '<p class="muted lease-count" id="schedule-count" role="status"></p><div id="schedule-results"></div>';
}

function filterSchedules() {
  const read = field => view.querySelector("#schedule-" + field);
  const scope = propertyScope();
  const rows = data.schedules.map(schedule => {
    const space = find("spaces", find("leases", schedule.lease)?.space);
    return { schedule, property: space?.property,
      unit: space?.unit || (space?.type !== "Room" ? space?.id : undefined),
      room: space?.type === "Room" ? space.id : undefined };
  }).filter(row => !scope || row.property === scope.id);

  const options = (field, rows, fieldName, allLabel, labelForValue, extras = []) => {
    const select = read(field);
    if (!select) return "";
    const previous = select.value;
    const choices = [...new Set(rows.map(fieldName).filter(Boolean))]
      .map(id => [id, labelForValue(id)]).sort((a, b) => a[1].localeCompare(b[1]));
    choices.push(...extras);
    select.innerHTML = '<option value="">' + allLabel + '</option>' + choices.map(([id, label]) =>
      '<option value="' + escape(id) + '">' + escape(label) + '</option>').join("");
    select.value = choices.some(([id]) => id === previous) ? previous : "";
    return select.value;
  };

  const property = options("property", rows, row => row.property, "All properties", id => labelFor("properties", id));
  const propertyRows = rows.filter(row => !property || row.property === property);
  const unit = options("unit", propertyRows, row => row.unit, "All units", id => property || scope ?
    find("spaces", id)?.name || "—" : labelFor("spaces", id));
  const unitRows = propertyRows.filter(row => !unit || row.unit === unit);
  const room = options("room", unitRows, row => row.room, "All rooms", id => unit ?
    find("spaces", id)?.name || "—" : labelFor("spaces", id));
  const leaseWide = "lease-wide";
  const tenant = options("tenant", rows, row => row.schedule.billedTenant, "All billed tenants", id => labelFor("tenants", id),
    rows.some(row => !row.schedule.billedTenant) ? [[leaseWide, "Lease-wide"]] : []);
  const matches = unitRows.filter(row => (!room || row.room === room) &&
    (!tenant || (row.schedule.billedTenant || leaseWide) === tenant)).map(row => row.schedule);
  read("count").textContent = matches.length === 1 ? "1 recurring invoice schedule" :
    matches.length ? matches.length + " recurring invoice schedules" :
    rows.length ? "No recurring invoice schedules match these filters." : "No recurring invoices yet.";
  read("results").innerHTML = matches.length ? recordTable("schedules", matches) : "";
}

function rentSchedules(leaseId) {
  return data.schedules.filter(schedule => schedule.lease === leaseId &&
    schedule.state === "Active" && invoiceCategory(schedule) === "Rent");
}

function effectiveRent(record, date, baseField) {
  return record.rentChanges?.findLast(change => change.date <= date)?.amount ?? record[baseField];
}

const rentGuidance = {
  "CA-ON": "https://www.ontario.ca/page/residential-rent-increases",
  "CA-BC": "https://www.gov.bc.ca/landlordtenant/increase",
  "CA-MB": "https://manitoba.ca/cca/rtb/landlord/rentincrease.html",
  "CA-NS": "https://www.novascotia.ca/residential-tenancies-program-legislative-changes",
  "CA-NB": "https://www.gnb.ca/en/topic/family-home-community/renting/increase.html",
  "CA-PE": "https://peirentaloffice.ca/rent-increases/",
  "CA-QC": "https://www.tal.gouv.qc.ca/en/calculation-for-rent-increase",
  "CA-AB": "https://www.alberta.ca/common-problems-landlords-and-tenants",
  "CA-SK": "https://www.saskatchewan.ca/residents/housing-and-renting/renting-and-leasing/rent-increases",
  "CA-NL": "https://www.gov.nl.ca/gs/human-rights-in-residential-tenancies/residential-tenancies-act/"
};

function openRentChange(id) {
  const lease = find("leases", id);
  if (!lease || storageError || leaseState(lease) === "Ended") return;
  const guidance = rentGuidance[propertyFor(lease.space)?.jurisdiction];
  editing = { key: "rentChange", id };
  document.querySelector("#editor-title").textContent = "Change rent";
  form.querySelector("#fields").innerHTML = '<p>' + escape(labelFor("leases", id)) + '</p>' +
    inputFor(field("effectiveDate", "Effective date", "date"), lease.start > today ? lease.start : today) +
    inputFor(field("direction", "Change", ["Increase", "Decrease"]), "Increase") +
    inputFor(field("unit", "Change by", ["Amount", "Percentage"]), "Percentage") +
    inputFor(field("adjustment", "Amount or percentage", "number"), "") +
    '<p class="muted">Check the rules that apply to this tenancy and confirm that notice and timing requirements are met.' +
    (guidance ? ' <a href="' + guidance + '" target="_blank" rel="noopener noreferrer">Official guidance</a>' : "") + '</p>' +
    '<p class="muted">The new rent applies to recurring rent invoices due on or after the effective date.</p>';
  error.textContent = "";
  editor.showModal();
}

function saveRentChange(id, fields) {
  const lease = find("leases", id);
  if (!lease || leaseState(lease) === "Ended") return;
  const date = fields.get("effectiveDate");
  const end = occupancyEnd(lease);
  const history = lease.rentChanges ?? [];
  if (!date || date < lease.start || (end && date > end) || (history.length && date <= history.at(-1).date)) {
    error.textContent = "Choose a date within the tenancy and after any saved rent change.";
    return;
  }
  const current = Math.round(Number(effectiveRent(lease, date, "rent")) * 100);
  const change = Number(fields.get("adjustment"));
  const delta = Math.round(fields.get("unit") === "Percentage" ? current * change / 100 : change * 100);
  const total = current + (fields.get("direction") === "Decrease" ? -delta : delta);
  if (!Number.isSafeInteger(total) || delta <= 0 || total <= 0) {
    error.textContent = "Enter a positive change that leaves the monthly rent above zero.";
    return;
  }
  const schedules = rentSchedules(id).filter(schedule => !schedule.end || schedule.end >= date);
  const first = schedules[0];
  const sameBilling = schedules.every(schedule => sameBillingCycle(schedule, first) && (schedule.end || "") === (first.end || ""));
  if (!sameBilling) {
    error.textContent = "Align the recurring rent schedules’ billing cycles and end dates before changing split rent.";
    return;
  }
  const shares = schedules.map(schedule => Math.round(Number(effectiveRent(schedule, date, "amount")) * 100));
  const sum = shares.reduce((subtotal, share) => subtotal + share, 0);
  const billingTotal = first && billingIntervalDays(first) ? Math.round(sum * total / current) : total;
  const versions = new Map();
  let cumulative = 0;
  let allocated = 0;
  schedules.forEach((schedule, index) => {
    cumulative += shares[index];
    const next = Math.round(billingTotal * cumulative / sum);
    versions.set(schedule.id, { date, amount: ((next - allocated) / 100).toFixed(2) });
    allocated = next;
  });
  if ([...versions.values()].some(version => !(Number(version.amount) > 0))) {
    error.textContent = "The new rent must leave a positive amount for each recurring rent payer.";
    return;
  }
  const affected = data.ledger.filter(invoice => invoice.invoice && !invoice.voidedOn && invoice.date >= date &&
    versions.has(invoice.schedule) && Number(invoice.amount) !== Number(versions.get(invoice.schedule).amount));
  if (affected.some(invoice => invoicePayments(invoice.id).length)) {
    error.textContent = "A recurring rent invoice on or after this date already has payments. Choose a later effective date.";
    return;
  }
  const adjusted = new Set(affected.map(invoice => invoice.id));
  const next = { ...data,
    leases: data.leases.map(item => item.id === id ? { ...item,
      rentChanges: [...history, { date, amount: (total / 100).toFixed(2) }] } : item),
    schedules: data.schedules.map(schedule => versions.has(schedule.id) ? { ...schedule,
      rentChanges: [...(schedule.rentChanges ?? []), versions.get(schedule.id)] } : schedule),
    ledger: data.ledger.map(invoice => adjusted.has(invoice.id) ? { ...invoice, amount: versions.get(invoice.schedule).amount } : invoice)
  };
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    error.textContent = "This browser could not save the rent change.";
    return;
  }
  data = next;
  editor.close();
  render();
  notify(schedules.length ? "Rent change and recurring billing saved." : "Rent change saved. This lease has no applicable active recurring rent schedule.");
}

function matchingRentSchedules(schedule) {
  const due = scheduleDueDate(schedule, scheduleEntries(schedule));
  const group = rentSchedules(schedule.lease);
  return due && group.every(item => scheduleDueDate(item, scheduleEntries(item)) === due &&
    sameBillingCycle(item, schedule) && Number(item.leadDays || 0) === Number(schedule.leadDays || 0) &&
    (item.end || "") === (schedule.end || "")) ? group : [];
}

function openPayerEditor(id) {
  const schedule = find("schedules", id);
  if (!schedule || storageError) return;
  const group = matchingRentSchedules(schedule);
  if (group.length < 2) return;
  const lease = find("leases", schedule.lease);
  const due = scheduleDueDate(schedule, scheduleEntries(schedule));
  const amount = money(Number(effectiveRent(lease, due, "rent")), propertyFor(lease.space).currency);
  editing = { key: "rentPayer", id };
  document.querySelector("#editor-title").textContent = "Choose one rent payer";
  document.querySelector("#fields").innerHTML = '<p>Bill the full monthly rent of <strong>' + escape(amount) +
    '</strong> to one tenant starting ' + escape(scheduleDueDate(schedule, scheduleEntries(schedule))) +
    '. The split rent schedules will be paused.</p><label>Billed to<select name="payer" required>' +
    '<option value="">Select a tenant</option>' + leaseTenantIds(lease).map(tenant => '<option value="' +
      escape(tenant) + '">' + escape(labelFor("tenants", tenant)) + '</option>').join("") + '</select></label>';
  error.textContent = "";
  editor.showModal();
}

function saveRentPayer(id, payer) {
  const schedule = find("schedules", id);
  const lease = find("leases", schedule.lease);
  const group = matchingRentSchedules(schedule);
  if (group.length < 2 || !leaseTenantIds(lease).includes(payer)) {
    error.textContent = "Select a tenant from this lease.";
    return;
  }
  const ids = new Set(group.map(item => item.id));
  const replacement = { ...schedule, id: crypto.randomUUID(), billedTenant: payer, amount: lease.rent, rentChanges: lease.rentChanges,
    start: scheduleDueDate(schedule, scheduleEntries(schedule)), billingDay: schedule.billingDay ?? Number(schedule.start.slice(-2)) };
  const next = { ...data, schedules: [...data.schedules.map(item => ids.has(item.id) ? { ...item, state: "Paused" } : item), replacement] };
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    error.textContent = "This browser could not save the billing change.";
    return;
  }
  data = next;
  editor.close();
  render();
  notify("Future rent will be billed to " + labelFor("tenants", payer) + ".");
}

function readyInvoices(schedule, { through = localDate(), dueThrough, nextOnly = false } = {}) {
  const invoices = [];
  if (schedule.state !== "Active") return invoices;
  let index = scheduleEntries(schedule);
  let due = scheduleDueDate(schedule, index);
  while (due && (nextOnly || (dueThrough ? due <= dueThrough : postingDate(due, schedule.leadDays) <= through))) {
    invoices.push(invoiceEntry(schedule.lease, due, effectiveRent(schedule, due, "amount"), schedule.note, schedule.billedTenant, schedule.id,
      postingDate(due, schedule.leadDays), invoiceCategory(schedule), schedule.customCategory));
    if (nextOnly) break;
    due = scheduleDueDate(schedule, ++index);
  }
  return invoices;
}

function postDueInvoices({ scheduleId, dueThrough } = {}) {
  const scope = propertyScope();
  const through = localDate();
  const invoices = [];
  for (const schedule of data.schedules) {
    if ((scheduleId && schedule.id !== scheduleId) ||
      (scope && propertyFor(find("leases", schedule.lease)?.space)?.id !== scope.id)) continue;
    invoices.push(...readyInvoices(schedule, { through, dueThrough, nextOnly: Boolean(scheduleId) }));
  }
  if (!invoices.length) {
    if (dueThrough && editor.open) error.textContent = "No unposted invoices are due by this date.";
    else notify("No invoices are ready to post.");
    return;
  }
  const next = { ...data, ledger: [...data.ledger, ...invoices] };
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    if (editor.open) error.textContent = "This browser could not save the invoices.";
    else notify("This browser could not save the invoices.");
    return;
  }
  data = next;
  if (editor.open) editor.close();
  render();
  notify(invoices.length + (invoices.length === 1 ? " invoice posted." : " invoices posted."));
}

function openPostAhead() {
  if (storageError) return;
  editing = { key: "postAhead" };
  document.querySelector("#editor-title").textContent = "Post invoices ahead";
  document.querySelector("#fields").innerHTML =
    '<p>Post unposted invoices from active schedules through the due date you choose. Each invoice keeps its scheduled invoice date and due date.</p>' +
    inputFor(field("dueThrough", "Post through due date", "date"), "");
  error.textContent = "";
  editor.showModal();
}

function records(key) {
  const { title, item, summary, fields } = views[key];
  const scope = ["spaces", "ledger", "maintenance"].includes(key) ? propertyScope() : null;
  let entries = scope ? data[key].filter(record => {
    if (key === "spaces") return record.property === scope.id;
    const space = key === "ledger" ? find("leases", record.lease)?.space : record.space;
    return propertyFor(space)?.id === scope.id;
  }) : data[key];
  const archived = key === "spaces" ? entries.filter(record => record.archived) : [];
  const legacyRooms = key === "spaces" ? entries.filter(record => record.type === "Room" && !record.unit && activeSpace(record)) : [];
  const showLegacy = key === "spaces" && routeParams().has("legacyRooms");
  if (key === "spaces") entries = showLegacy ? legacyRooms : entries.filter(record => record.type !== "Room" && activeSpace(record));
  const add = key === "spaces" && scope && (scope.archived || propertyType(scope) === singleUnit) ? "" :
    '<button data-add="' + key + '">Add ' + (key === "spaces" ? "unit" : item) + '</button>';
  const base = scope ? propertyLink(key, scope.id) : "#" + key;
  const intro = showLegacy ? heading("Unassigned rooms", "", recordAnchor(base, "Back to Units")) :
    key === "spaces" ? heading("Units", "Open a unit to see its details.", add) : heading(title, summary, add);
  return intro + (entries.length ? recordTable(key, entries, key === "spaces" && !showLegacy) : '<p class="card">No records yet.</p>') +
    (!showLegacy && legacyRooms.length ? '<p>' + recordAnchor(base + (scope ? "&" : "?") + "legacyRooms", "View unassigned rooms") + '</p>' : "") +
    archivedRecords("Archived units", archived.map(unit =>
      '<div class="archived-record">' + escape(labelFor("spaces", unit.id)) + actionMenu("Actions for " + unit.name, archiveAction("spaces", unit)) + '</div>').join(""));
}

function recordTable(key, entries, unitsOnly = false) {
  const deposits = key === "ledger" && entries.some(record => record.invoice) ? depositActivity(data.ledger) : [];
  const { title } = views[key];
  const fields = key === "ledger" ? views.ledger.fields.flatMap(descriptor =>
    descriptor.key === "type" ? [descriptor, field("category", "Category")] : [descriptor]) :
    unitsOnly ? setupUnitFields.reduce((fields, field) =>
    field.key === "name" ? [...fields, field, views.spaces.fields[1]] : [...fields, field], []) : views[key].fields;
  return '<div class="card table" tabindex="0" role="region" aria-label="' + escape(title) + '"><table><thead><tr>' +
    fields.map(descriptor => '<th scope="col">' + escape(descriptor.label) + '</th>').join("") +
    (["ledger", "schedules"].includes(key) ? '<th scope="col">Billed to</th>' : "") +
    (key === "schedules" ? '<th scope="col">Category</th><th scope="col">Next invoice date</th><th scope="col">Next due date</th>' : "") + '<th scope="col">Actions</th></tr></thead><tbody>' +
    entries.map(record => '<tr data-row-link="' + escape(recordLink(key, record.id)) + '">' +
      fields.map(descriptor => '<td>' + recordCell(key, record, descriptor) + '</td>').join("") +
      (["ledger", "schedules"].includes(key) ? '<td>' + escape(record.billedTenant ? labelFor("tenants", record.billedTenant) : record.invoice || key === "schedules" ? "Lease" : "—") + '</td>' : "") +
      (key === "schedules" ? '<td>' + escape(invoiceCategoryLabel(record)) + '</td>' + scheduleDates(record) : "") +
      '<td class="invoice-action-cell">' + actionMenu("Actions for " + (record.reference || record.name || record.note || views[key].item),
      key === "ledger" && record.invoice ? invoiceActions(record, deposits) :
      '<button class="secondary" data-record-key="' + key + '" data-edit="' + escape(record.id) + '">Edit</button>' +
      (key === "spaces" && record.type !== "Room" ? archiveAction(key, record) : "") +
      (key === "ledger" && record.type === "Charge" && !record.invoice ?
        '<button class="secondary" data-record-key="ledger" data-edit="' + escape(record.id) + '" data-entry="Invoice">Convert to invoice</button>' : "") +
      (key === "schedules" && record.state === "Active" && invoiceCategory(record) === "Rent" &&
        matchingRentSchedules(record).length > 1 ? '<button class="secondary" data-rent-payer="' + escape(record.id) + '">Choose one payer</button>' : "") +
      (key === "schedules" ? scheduleInvoiceActions(record) : "")) + '</td></tr>').join("") + '</tbody></table></div>';
}

function scheduleDates(schedule) {
  const due = schedule.state === "Active" && scheduleDueDate(schedule, scheduleEntries(schedule));
  return '<td>' + (due ? escape(postingDate(due, schedule.leadDays)) : "—") + '</td><td>' + escape(due || "—") + '</td>';
}

function scheduleInvoiceActions(schedule) {
  const due = schedule.state === "Active" && scheduleDueDate(schedule, scheduleEntries(schedule));
  const latest = data.ledger.findLast(entry => entry.schedule === schedule.id);
  return (due ? '<button class="secondary" data-post-schedule="' + escape(schedule.id) + '">Post next invoice</button>' : "") +
    (latest ? recordAnchor(recordLink("ledger", latest.id, false), "Latest invoice") : "");
}

function compliance() {
  const ontario = data.properties.filter(property => property.jurisdiction === "CA-ON");
  return heading("Compliance", "Review which properties belong to the Ontario module.") +
    listCard("Ontario LTB workspace", ontario.map(property => [property.name, property.location, propertyLink("spaces", property.id)]), "No Ontario properties in this workspace.", "properties") +
    '<p class="muted">Ontario forms, deadline calculations, and filing workflows are planned.</p>';
}

function reportsPage() {
  const vacant = routeParams().get("mode") === "vacant";
  const active = data.leases.filter(currentLease);
  const activeSpaces = new Set(active.map(lease => lease.space));
  const rentals = vacant ? rentableSpaces(data.spaces.filter(activeSpace))
    .filter(space => !activeSpaces.has(space.id) && !activeSpaces.has(space.unit)) : active;
  const navigation = '<nav class="property-tabs" aria-label="Reports"><a href="#reports"' +
    (vacant ? "" : ' aria-current="page"') + '>Rent roll</a><a href="#reports?mode=vacant"' +
    (vacant ? ' aria-current="page"' : "") + '>Vacant rentals</a></nav>';
  const headings = vacant ? ["Property", "Rental space", "Rental type", "Next scheduled lease"] :
    ["Property", "Rental space", "Tenants", "Lease term", "Monthly rent"];
  const rows = rentals.map(item => {
    const space = vacant ? item : find("spaces", item.space);
    const property = space && find("properties", space.property);
    if (!space || !property) return "";
    const unit = find("spaces", space.unit);
    const prefix = recordAnchor(propertyLink("spaces", property.id), property.name) + '</td><td>' +
      recordAnchor(recordLink("spaces", find("spaces", space.id) ? space.id : unit?.id, false),
        [unit?.name, space.name].filter(Boolean).join(" · "));
    if (vacant) {
      const next = data.leases.filter(lease => (lease.space === space.id || lease.space === space.unit) && lease.start > today)
        .sort((a, b) => a.start.localeCompare(b.start))[0];
      return '<tr><td>' + prefix + '</td><td>' + escape(space.type) + '</td><td>' +
        (next ? recordAnchor(recordLink("leases", next.id, false), next.start) : "—") + '</td></tr>';
    }
    return '<tr><td>' + prefix + '</td><td>' + leaseTenantIds(item).map(id =>
      recordAnchor(recordLink("tenants", id, false), labelFor("tenants", id))).join(", ") + '</td><td>' +
      recordAnchor(recordLink("leases", item.id, false), leaseStatus(item)) + '</td><td>' +
      escape(money(Number(effectiveRent(item, today, "rent")), property.currency)) + '</td></tr>';
  }).join("");
  return heading("Reports", "Portfolio status as of " + today) + navigation +
    (rows ? '<div class="card table" tabindex="0" role="region" aria-label="' + (vacant ? "Vacant rentals" : "Rent roll") +
      '"><table><thead><tr>' + headings.map(label => '<th scope="col">' + label + '</th>').join("") +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' :
      '<p class="card">' + (vacant ? "No vacant units or rooms." : "No active leases.") + '</p>');
}

function render() {
  const key = route();
  const scope = (propertySections.some(([id]) => id === key) || key === "schedules") ? propertyScope() : null;
  const titles = { overview: { title: "Overview" }, ...views, ledger: { title: "Financials" }, compliance: { title: "Compliance" }, reports: { title: "Reports" } };
  const active = scope ? "properties" : key === "schedules" ? "ledger" : key;
  const navLink = id => '<a href="#' + id + '"' + (active === id ? ' aria-current="page"' : "") + '>' + escape(titles[id].title) + '</a>';
  nav.innerHTML = navLink("overview") + [
    ["Portfolio", ["properties", "spaces", "tenants", "leases"]],
    ["Finances", ["ledger", "reports"]],
    ["Operations", ["maintenance", "compliance"]]
  ].map(([name, links]) => '<div class="nav-group" role="group" aria-label="' + name +
    '"><span class="nav-label" aria-hidden="true">' + name + '</span>' + links.map(navLink).join("") + '</div>').join("");
  const detail = ["spaces", "maintenance", "ledger", "schedules"].includes(key) ? linkedRecord(key) : null;
  const detailProperty = detail && (key === "spaces" ? detail.property :
    propertyFor(key === "maintenance" ? detail.space : find("leases", detail.lease)?.space)?.id);
  const visibleDetail = detail && (!scope || detailProperty === scope.id);
  const page = visibleDetail ? recordDetails(key, detail) : key === "overview" ? dashboard() : key === "properties" ? portfolio() : key === "leases" ? leasesPage() :
    key === "tenants" ? tenantsPage() : key === "ledger" ? financialsPage() : key === "schedules" ? schedulesPage() :
    key === "compliance" ? compliance() : key === "reports" ? reportsPage() : records(key);
  view.innerHTML = scope ? propertyWorkspace(scope, key) + '<section class="property-section">' +
    page.replace("<h1>", "<h2>").replace("</h1>", "</h2>") + '</section>' : page;
  if (key === "properties") filterPortfolio();
  if (key === "overview") renderPaymentTrend();
  if (key === "leases") filterLeases();
  if (key === "tenants" && view.querySelector("#tenant-search")) filterTenants();
  if (key === "ledger" && !visibleDetail) filterFinancials();
  if (key === "schedules" && !visibleDetail) filterSchedules();
  if (storageError) view.insertAdjacentHTML("afterbegin", '<p class="card" role="alert">Saved workspace data could not be loaded. Editing is disabled to protect it.</p>');
}

function setMenuOpen(open, restoreFocus = false) {
  shell.classList.toggle("menu-open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
  if (open) nav.querySelector('[aria-current="page"]')?.focus();
  if (restoreFocus) menuToggle.focus();
}

menuToggle.addEventListener("click", () => setMenuOpen(!shell.classList.contains("menu-open"), shell.classList.contains("menu-open")));
document.querySelector(".menu-backdrop").addEventListener("click", () => setMenuOpen(false, true));
shell.addEventListener("click", event => {
  if (shell.classList.contains("menu-open") && event.target.closest("#workspace-sidebar a")) setMenuOpen(false, true);
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && shell.classList.contains("menu-open")) setMenuOpen(false, true);
});
narrowScreen.addEventListener("change", () => setMenuOpen(false));

function inputFor(descriptor, value, records) {
  const { key, label, type, optional } = descriptor;
  const required = optional ? "" : " required";
  const name = ' name="' + key + '"';
  const options = Array.isArray(type) ? type.map(option => [option, option]) :
    hasView(type) ? (records ?? data[type]).map(record => [record.id, labelFor(type, record.id)]) : null;
  let control;
  if (options) {
    const placeholder = type === rentalSetups ? "" : '<option value="">Select ' + escape(label.toLowerCase()) + '</option>';
    control = '<select' + name + required + '>' + placeholder +
      options.map(([id, text]) => '<option value="' + escape(id) + '"' + (id === value ? " selected" : "") + '>' + escape(text) + '</option>').join("") + '</select>';
  } else {
    const limits = type === "lead" ? ' min="0" max="365" step="1"' : type === "day" ? ' min="1" max="31" step="1"' : type === "count" ? ' min="0" max="1000000" step="1"' : type === "number" ? ' min="0.01" max="999999999.99" step="0.01"' : type === "text" ? ' maxlength="200"' : "";
    control = '<input' + name + ' type="' + (["day", "count", "lead"].includes(type) ? "number" : type) + '" value="' + escape(value) + '"' + required + limits + '>';
  }
  return '<label>' + escape(label) + control + '</label>';
}

let editing;
const setupUnitFields = views.spaces.fields
  .filter(field => field.key !== "property" && field.key !== "type")
  .map(field => field.key === "name" ? { ...field, label: "Unit name" } : field);

function storeSpaceType(space) {
  if (space.type === "Unit" && space.rentalSetup === rentalSetups[1]) space.type = unitByRoom;
  delete space.rentalSetup;
}

function leaseRoomOptions(unit, selected) {
  const saved = data.spaces.filter(room => room.unit === unit.id);
  const count = unit.bedrooms === "" || unit.bedrooms == null ? saved.length : Number(unit.bedrooms);
  const byNumber = new Map(saved.filter(room => room.roomNumber).map(room => [room.roomNumber, room]));
  const legacy = saved.filter(room => !room.roomNumber);
  const rooms = Array.from({ length: count }, (_, index) => {
    const roomNumber = index + 1;
    return byNumber.get(roomNumber) || legacy.shift() || {
      id: unit.id + ":room:" + roomNumber, name: "Room " + roomNumber,
      type: "Room", unit: unit.id, property: unit.property, roomNumber
    };
  });
  const current = saved.find(room => room.id === selected);
  if (current && !rooms.includes(current)) rooms.push(current);
  return rooms;
}

function openSpaceMediaEditor(id, unitId, isUnit = false) {
  if (storageError) return;
  const unit = find("spaces", unitId);
  const room = unit ? leaseRoomOptions(unit, id).find(room => room.id === id) : find("spaces", id);
  if (!room || (room.type !== "Room") !== isUnit) return;
  const label = isUnit ? "unit" : "room";
  editing = { key: "spaceMedia", room, label };
  document.querySelector("#editor-title").textContent = isUnit ? "Edit unit description & photos" : "Edit room";
  const photos = (room.photos || []).filter(photo => photoPattern.test(photo));
  document.querySelector("#fields").innerHTML =
    (isUnit ? "" : inputFor(field("roomName", "Room name"), room.name)) +
    '<label>Description<textarea name="roomDescription" rows="4" maxlength="2000">' +
    escape(room.description) + '</textarea></label>' +
    photos.map((photo, index) => '<div class="room-photos"><img src="' + escape(photo) + '" alt="Photo ' + (index + 1) +
      '"><label class="checkbox"><input type="checkbox" name="removeRoomPhoto" value="' + index + '">Remove photo ' + (index + 1) +
      '</label></div>').join("") +
    '<label>Add ' + label + ' photos (up to 400 KB each)<input name="roomPhotos" type="file" multiple accept="image/jpeg,image/png,image/webp"></label>';
  error.textContent = "";
  editor.showModal();
}

async function saveSpaceMedia(formData, submit) {
  const current = editing;
  const room = current.room;
  const name = formData.has("roomName") ? formData.get("roomName").trim() : room.name;
  const files = formData.getAll("roomPhotos").filter(file => file.name);
  if (!name) {
    error.textContent = "Enter a room name.";
    return;
  }
  if (files.some(file => file.size > 400 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
    error.textContent = "Choose JPEG, PNG, or WebP photos up to 400 KB each.";
    return;
  }
  submit.disabled = true;
  try {
    const removed = new Set(formData.getAll("removeRoomPhoto").map(Number));
    const photos = (room.photos || []).filter(photo => photoPattern.test(photo)).filter((_, index) => !removed.has(index));
    photos.push(...await Promise.all(files.map(readPhoto)));
    if (editing !== current || !editor.open) return;
    const record = { ...room, name, description: formData.get("roomDescription").trim(), photos };
    const spaces = find("spaces", room.id) ? data.spaces.map(item => item.id === room.id ? record : item) : [...data.spaces, record];
    const next = { ...data, spaces };
    localStorage.setItem(storageKey, JSON.stringify(next));
    data = next;
    editor.close();
    render();
    notify(current.label === "unit" ? "Unit details saved." : "Room saved.");
  } catch {
    if (editing === current && editor.open) error.textContent = "The browser could not save these details. Try fewer or smaller photos.";
  } finally {
    submit.disabled = false;
  }
}

function overlappingTenancy(space, start, end, leaseId) {
  return data.leases.some(lease => lease.id !== leaseId &&
    (lease.space === space.id || lease.space === space.unit || find("spaces", lease.space)?.unit === space.id) &&
    (!occupancyEnd(lease) || occupancyEnd(lease) >= start) && (!end || end >= lease.start));
}

function updateLeaseSpace(selected) {
  const { leaseProperty, leaseUnit, leaseRoom, space } = form.elements;
  const dates = Object.fromEntries(["start", "end", "term", "tenancyEnd"].map(name => [name, form.elements[name].value]));
  const start = dates.start || today;
  const setOptions = (select, placeholder, records, value) => {
    select.replaceChildren(new Option(placeholder, ""), ...records.map(record => new Option(record.name, record.id)));
    select.value = records.some(record => record.id === value) ? value : "";
  };
  const vacant = candidate => {
    const convertToMonthly = editing.rolloverSelected ? form.elements.convertToMonthly.checked :
      find("properties", candidate.property)?.jurisdiction === "CA-ON";
    const end = dates.start ? occupancyEnd({ ...dates, convertToMonthly }) : today;
    return !overlappingTenancy(candidate, start, end, editing.id);
  };
  const editingSpace = find("spaces", find("leases", editing.id)?.space);
  const editingUnit = editingSpace?.unit || editingSpace?.id;
  const vacantRooms = unit => leaseRoomOptions(unit, editingSpace?.id)
    .filter(room => (activeSpace(room) || room.id === editingSpace?.id) && vacant(room));
  if (!editing.id) {
    const properties = editing.leaseProperties.filter(property => data.spaces.some(unit =>
      unit.property === property.id && !unit.unit && activeSpace(unit) &&
      (unit.type === unitByRoom ? vacantRooms(unit).length > 0 : vacant(unit))));
    setOptions(leaseProperty, properties.length ? "Select property" : "No properties with vacancies",
      properties, leaseProperty.value);
  }
  const propertySpaces = data.spaces.filter(item => item.property === leaseProperty.value &&
    (activeSpace(item) || item.id === editingSpace?.id || item.id === editingUnit));
  const previous = find("spaces", selected);
  const unitId = previous ? previous.unit || previous.id : leaseUnit.value;
  const availableRooms = new Map();
  const units = propertySpaces.filter(item => !item.unit).filter(unit => {
    if (unit.type !== unitByRoom) return vacant(unit) || unit.id === editingUnit;
    availableRooms.set(unit.id, vacantRooms(unit));
    return availableRooms.get(unit.id).length > 0 || unit.id === editingUnit;
  });
  setOptions(leaseUnit, !leaseProperty.value ? "Select property first" : units.length ? "Select unit" : "No vacant units or rooms", units, unitId);
  const unit = units.find(item => item.id === leaseUnit.value);
  const rooms = availableRooms.get(unit?.id) || [];
  const legacy = unit && unit.id === editingSpace?.id;
  const chooseRoom = unit?.type === unitByRoom && !legacy;
  const roomId = previous?.unit ? selected : leaseRoom.value;
  setOptions(leaseRoom, rooms.length ? "Select vacant room" : "No vacant rooms for these dates", rooms, roomId);
  leaseRoom.closest("label").hidden = leaseRoom.disabled = !chooseRoom;
  space.value = (chooseRoom ? leaseRoom.value : unit?.id) || "";
  if (!editing.rolloverSelected) form.elements.convertToMonthly.checked =
    find("properties", leaseProperty.value)?.jurisdiction === "CA-ON";
}

function openPropertySetup(record, id) {
  const setup = id ? propertyType(record) : singleUnit;
  const units = id ? data.spaces.filter(space => space.property === id && space.type !== "Room") : [];
  const space = units[0];
  const choice = (value, description) => '<label class="setup-choice"><input type="radio" name="propertyType" value="' +
    value + '"' + (setup === value ? " checked" : "") + '><span><strong>' + value + '</strong><small>' +
    description + '</small></span></label>';
  form.elements.jurisdiction.closest("label").insertAdjacentHTML("beforebegin",
    '<fieldset class="property-setup"><legend>Property type</legend><div class="setup-choices">' +
    choice(singleUnit, "One house or unit at the address, rented whole or by room.") +
    choice(multiUnit, "Add multiple units at the address. Each can be rented whole or by room.") + '</div></fieldset>' +
    inputFor(field("singleRentalSetup", "Rental setup", rentalSetups), space ? spaceRentalSetup(space) : rentalSetups[0]) +
    inputFor(field("singleBedrooms", "Bedrooms", "count", true), space?.bedrooms ?? ""));
  form.querySelector("#fields").insertAdjacentHTML("beforeend",
    '<fieldset class="property-setup" id="setup-units"><legend>Units</legend>' +
    '<div class="setup-rows"></div><button type="button" class="secondary" data-add-setup-unit>Add unit</button></fieldset>');
  units.filter(unit => !unit.archived).forEach(addSetupUnit);
  updatePropertySetup();
}

function updatePropertySetup() {
  const single = form.elements.propertyType.value === singleUnit;
  const units = form.querySelector("#setup-units");
  units.hidden = units.disabled = single;
  const rentalSetup = form.elements.singleRentalSetup;
  rentalSetup.closest("label").hidden = rentalSetup.disabled = !single;
  const bedrooms = form.elements.singleBedrooms;
  bedrooms.closest("label").hidden = bedrooms.disabled = !single;
}

function addSetupUnit(unit) {
  const rows = form.querySelector(".setup-rows");
  const prefix = "unit_" + crypto.randomUUID() + "_";
  const defaults = { ...unit, rentalSetup: unit ? spaceRentalSetup(unit) : rentalSetups[0] };
  rows.insertAdjacentHTML("beforeend", '<fieldset class="setup-unit" data-unit-prefix="' + prefix +
    '" data-unit-id="' + escape(unit?.id) + '"><legend>' + escape(unit?.name || "New unit") + '</legend><div class="setup-unit-fields">' + setupUnitFields.map(descriptor =>
      inputFor({ ...descriptor, key: prefix + descriptor.key }, defaults[descriptor.key] ?? "")).join("") +
    '</div>' + (unit ? "" : '<button type="button" class="secondary" data-remove-setup-unit>Remove unit</button>') + '</fieldset>');
  const row = rows.lastElementChild;
  if (!unit) form.elements.namedItem(prefix + "name").focus();
}

let statusTimer;
function notify(message) {
  status.textContent = message;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { status.textContent = ""; }, 3500);
}
function openEditor(key, id, entryKind, invoiceId, depositLease, defaults = {}) {
  if (storageError) return;
  const config = views[key];
  const record = id ? find(key, id) : defaults;
  if (!record || record.voidedOn) return;
  const expense = key === "ledger" && (entryKind === "Expense" || record.type === "Expense");
  if (expense && !data.properties.length) {
    notify("Add a property first.");
    return;
  }
  if (key === "properties" && record.archived) {
    notify("Restore the property before editing it.");
    return;
  }
  const profile = route() === "tenants" && (["ledger", "schedules"].includes(key) || (key === "leases" && !id)) ?
    find("tenants", routeParams().get("tenant")) : null;
  const deposit = key === "ledger" && (isDeposit({ type: entryKind }) ? entryKind : isDeposit(record) ? record.type : "");
  const scope = !id && (key === route() || (key === "leases" && profile)) ? propertyScope() : null;
  const scopedSpaces = scope && data.spaces.filter(space => space.property === scope.id && activeSpace(space));
  const rentalProperties = key === "spaces" ? data.properties.filter(property =>
    (!property.archived && propertyType(property) === multiUnit) || property.id === record.property) : null;
  if (rentalProperties && (!rentalProperties.length || (scope && propertyType(scope) === singleUnit))) {
    notify("Add a Multi-unit property first.");
    return;
  }
  const scopedLeases = depositLease ? [depositLease] : profile && key !== "leases" ? data.leases.filter(lease => leaseTenantIds(lease).includes(profile.id) &&
    (!propertyScope() || propertyFor(lease.space)?.id === propertyScope().id)) :
    scope && data.leases.filter(lease => propertyFor(lease.space)?.id === scope.id);
  if ((key === "leases" || key === "maintenance") && scopedSpaces && !scopedSpaces.length) {
    notify("Add a unit or room to this property first.");
    return;
  }
  if ((key === "ledger" || key === "schedules") && scopedLeases && !scopedLeases.length) {
    notify(profile ? "Add a lease for this tenant first." : "Add a lease to this property first.");
    return;
  }
  const missing = config.fields.find(descriptor =>
    !(expense && descriptor.key === "lease") &&
    !(key === "leases" && !id && descriptor.key === "tenant") &&
    hasView(descriptor.type) && !data[descriptor.type].length);
  if (missing) {
    notify("Add a " + views[missing.type].item + " first.");
    return;
  }
  const invoice = key === "ledger" && (entryKind === "Invoice" || record.invoice);
  const refund = entryKind === "Refund" || record.type === "Refund";
  const paymentInvoice = find("ledger", invoiceId || (refund ? record.invoiceId : undefined));
  if (paymentInvoice?.voidedOn) return;
  editing = { key, id, invoice, deposit, expense, profile, paymentInvoice, refund, depositLease, defaultInvoiceId: defaults.invoiceId,
    terminationDate: defaults.terminationDate, rolloverSelected: typeof record.convertToMonthly === "boolean" };
  if (key === "leases") editing.endDateEdited = Boolean(record.end);
  document.querySelector("#editor-title").textContent = invoice ? (id ? (record.invoice ? "Edit invoice" : "Convert to invoice") : "Create invoice") :
    deposit ? (id ? "Edit deposit" : deposit === depositApplied ? "Apply deposit" : deposit === "Deposit returned" ? "Return deposit" : "Record deposit") :
    key === "schedules" && profile && !id ? "Create recurring invoice" :
    expense ? (id ? "Edit expense" : "Record expense") :
    entryKind === "Refund" ? "Record refund" : entryKind === "Payment" ? "Add payment" : (id ? "Edit " : "Add ") + config.item;
  const paymentContext = paymentInvoice ? '<p>' + escape(paymentInvoice.reference || "Invoice") + ' · ' +
    escape(paymentInvoice.note) + '</p>' : "";
  document.querySelector("#fields").innerHTML = paymentContext + config.fields.map(descriptor => {
    if (expense && descriptor.key === "lease") return inputFor(field("property", "Property", "properties"), record.property || propertyScope()?.id || "");
    if (expense && descriptor.key === "type") return "";
    if (key === "spaces" && !id && descriptor.key === "type") return '<input type="hidden" name="type" value="Unit">';
    if (key === "spaces" && !id && descriptor.key === "name") descriptor = { ...descriptor, label: "Unit name" };
    let value = record[descriptor.key];
    if (key === "schedules" && descriptor.key === "frequency") value = scheduleFrequency(record);
    if (expense && descriptor.key === "date" && !id) value = today;
    if (expense && descriptor.key === "note") descriptor = { ...descriptor, label: "Expense description", optional: false };
    if (key === "leases" && profile && descriptor.key === "tenant") value = profile.id;
    if (paymentInvoice) {
      if (!["amount", "date", "method"].includes(descriptor.key) && !(refund && descriptor.key === "note")) return "";
      if (descriptor.key === "amount") descriptor = { ...descriptor, label: refund ? "Refund amount" : "Amount paid" };
      if (descriptor.key === "date") {
        descriptor = { ...descriptor, label: refund ? "Refund date" : "Payment date" };
        if (!id) value = today;
      }
      if (descriptor.key === "method") descriptor = { ...descriptor, optional: false };
    }
    if (deposit && descriptor.key === "type") return "";
    if (deposit === depositApplied && descriptor.key === "method") return "";
    if ([depositApplied, "Deposit returned"].includes(deposit) && descriptor.key === "reference") {
      descriptor = { ...descriptor, label: "Additional reference" };
    }
    if (deposit && !id && descriptor.key === "date") {
      value = editing.terminationDate || today;
      if (editing.terminationDate) descriptor = { ...descriptor, label: "Termination date" };
    }
    if (invoice) {
      if (["type", "method", "reference"].includes(descriptor.key)) return "";
      if (descriptor.key === "date") descriptor = { ...descriptor, label: "Invoice due date" };
      if (descriptor.key === "note") descriptor = { ...descriptor, label: "Invoice description", optional: false };
    }
    if (entryKind === "Refund" && descriptor.key === "type") value = "Refund";
    if (entryKind === "Payment" && descriptor.key === "type") value = "Payment";
    if (entryKind === "Payment" && descriptor.key === "date") value = today;
    if (key === "schedules" && descriptor.key === "leadDays") value = record.leadDays ?? "0";
    if (key === "schedules" && descriptor.key === "state" && !id) value = "Active";
    if (key === "leases" && descriptor.key === "term" && id) value = leaseTerm(record);
    if (scope && key === "spaces" && descriptor.key === "property") value = scope.id;
    if (key === "spaces" && descriptor.key === "type") value = record.type === "Room" ? "Room" : "Unit";
    if (key === "spaces" && descriptor.key === "rentalSetup") {
      value = id ? spaceRentalSetup(record) : rentalSetups[0];
    }
    let options;
    if (rentalProperties && descriptor.key === "property") options = rentalProperties;
    if (scope && descriptor.type === "spaces") options = scopedSpaces;
    if ((scope || profile || depositLease) && descriptor.type === "leases") options = scopedLeases;
    if ((profile || depositLease) && descriptor.key === "lease" && !id && scopedLeases.length === 1) value = scopedLeases[0].id;
    return inputFor(descriptor, value ?? "", options);
  }).join("");
  if (editing.terminationDate) form.elements.date.readOnly = true;
  if (invoice) {
    form.elements.namedItem("date").closest("label").insertAdjacentHTML("beforebegin",
      inputFor(field("issueDate", "Invoice date", "date"), id ? invoiceDate(record) : today));
  }
  if (invoice || key === "schedules") {
    form.elements.note.closest("label").insertAdjacentHTML("beforebegin",
      inputFor(field("invoiceCategory", "Category", invoiceCategories), id || defaults.category ? invoiceCategory(record) : "") +
      inputFor(field("customCategory", "Custom category"), record.customCategory ?? ""));
    updateCustomCategory();
  }
  if (key === "ledger" && !invoice && !deposit && !expense && !paymentInvoice) {
    form.elements.namedItem("type").closest("label").insertAdjacentHTML("afterend",
      '<label>Apply to invoice (optional)<select name="invoiceId"></select></label>');
    updateInvoiceOptions(record.invoiceId || invoiceId);
  }
  if (invoice || deposit || key === "schedules") {
    form.elements.namedItem("lease").closest("label").insertAdjacentHTML("afterend",
      '<label>Billed to<select name="billedTenant"></select></label>');
    updateBillingTenant(record.billedTenant);
  }
  if (deposit === depositApplied) {
    form.elements.billedTenant.closest("label").insertAdjacentHTML("afterend", '<label>Invoice to apply to<select name="invoiceId" required></select></label>');
    updateInvoiceOptions(record.invoiceId);
  }
  if ([depositApplied, "Deposit returned"].includes(deposit)) {
    form.elements.billedTenant.closest("label").insertAdjacentHTML("afterend",
      '<label>Deposit invoice reference<select name="depositInvoiceId"></select></label>');
    updateDepositInvoiceOptions(record.depositInvoiceId);
    prefillDepositReturn();
  }
  if (key === "properties") {
    openPropertySetup(record, id);
    const photo = photoPattern.test(record.photo) ? '<label class="checkbox"><input type="checkbox" name="removePhoto"> Remove current photo</label>' : "";
    document.querySelector("#fields").insertAdjacentHTML("beforeend",
      '<label>Property photo (optional, up to 400 KB)<input type="file" name="photo" accept="image/jpeg,image/png,image/webp"></label>' + photo);
  }
  if (key === "leases") {
    const previousSpace = find("spaces", record.space);
    const properties = scope ? [scope] : data.properties.filter(property => property.id === previousSpace?.property ||
      data.spaces.some(space => space.property === property.id && activeSpace(space)));
    editing.leaseProperties = properties;
    form.elements.space.closest("label").outerHTML = '<input type="hidden" name="space">';
    form.querySelector("#fields").insertAdjacentHTML("afterbegin",
      inputFor(field("leaseProperty", "Property", "properties"), previousSpace?.property || scope?.id || "", properties) +
      '<label>Unit<select name="leaseUnit" required></select></label>' +
      '<label>Room<select name="leaseRoom" required></select></label>');
    const fixedEnd = form.elements.namedItem("end").closest("label");
    fixedEnd.insertAdjacentHTML("afterend", '<label class="checkbox"><input type="checkbox" name="convertToMonthly"> Continue month-to-month after the fixed term</label>');
    form.elements.namedItem("convertToMonthly").checked = record.convertToMonthly ?? defaultRollover(record.space);
    updateLeaseDates();
    if (!id) {
      const tenant = form.elements.namedItem("tenant").closest("label");
      tenant.insertAdjacentHTML("beforebegin", '<label class="checkbox"><input type="checkbox" name="createTenant"> Create new tenant</label>');
      tenant.insertAdjacentHTML("afterend", '<fieldset id="new-tenant"><legend>New tenant details</legend>' +
        tenantBasics.map(descriptor => inputFor({ ...descriptor, key: "newTenant_" + descriptor.key }, "")).join("") +
        '</fieldset>');
      form.elements.namedItem("createTenant").checked = !data.tenants.length;
      updateTenantFields();
      document.querySelector("#fields").insertAdjacentHTML("beforeend",
        '<fieldset id="lease-billing"><legend>Billing (optional)</legend>' +
        inputFor(field("leaseBilling", "Create on save", ["One-time invoice", "Recurring invoice schedule"], true), "") +
        '<div id="lease-billing-frequency" hidden>' +
        inputFor(field("leaseFrequency", "Billing frequency", billingFrequencies, true), billingFrequencies[0]) + '</div>' +
        '<label hidden>Amount per invoice<input type="number" name="leaseInvoiceAmount" min="0.01" step="0.01" disabled></label>' +
        '<label hidden>First invoice due date<input type="date" name="firstInvoiceDate" disabled></label>' +
        '<label hidden>Invoice date<input type="date" name="leaseIssueDate" value="' + today + '" disabled></label>' +
        '<label hidden>Post days before due date<input type="number" name="leaseLeadDays" min="0" max="365" step="1" value="0" disabled></label>' +
        '<div id="lease-allocations"></div>' +
        '<label class="checkbox"><input type="checkbox" name="createDepositInvoice"> Create deposit invoice</label>' +
        '<label hidden>Deposit amount<input type="number" name="leaseDepositAmount" min="0.01" step="0.01" disabled></label>' +
        '<label hidden>Deposit due date<input type="date" name="leaseDepositDue" disabled></label>' +
        '<label hidden>Deposit billed to<select name="leaseDepositTenant" disabled></select></label></fieldset>');
    }
    const tenantFields = form.querySelector("#new-tenant") || form.elements.tenant.closest("label");
    tenantFields.insertAdjacentHTML("afterend",
      '<fieldset class="lease-tenants"><legend>Additional tenants</legend>' +
      (data.tenants.length ? data.tenants.map(tenant => '<label class="checkbox"><input type="checkbox" name="additionalTenants" value="' +
        escape(tenant.id) + '"' + (record.additionalTenants?.includes(tenant.id) ? " checked" : "") + '> ' + escape(tenant.name) + '</label>').join("") :
        '<p class="muted">Add another tenant in the tenant directory to include them on this lease.</p>') + '</fieldset>' +
      '<div id="lease-tenant-warning" class="tenant-warning" role="status"></div>');
    updateAdditionalTenants();
    updateTenantLeaseWarning();
    updateLeaseSpace(record.space);
  }
  if (id && (key === "properties" || (key === "spaces" && record.type !== "Room"))) {
    const item = key === "properties" ? "property" : "unit";
    form.querySelector("#fields").insertAdjacentHTML("beforeend",
      '<div><button type="button" class="secondary" data-show-delete>Permanently delete</button>' +
      '<fieldset class="setup-unit" data-delete-confirmation hidden><legend>Confirm deletion</legend>' +
      '<p>Permanently delete <strong>' + escape(record.name) + '</strong> and its ' +
      (item === "property" ? "units and rooms" : "rooms") + '? This cannot be undone. Unsaved edits will be discarded.</p>' +
      '<div class="billing-actions"><button type="button" class="secondary" data-cancel-delete>Cancel deletion</button>' +
      '<button type="button" class="delete-button" data-confirm-delete>Yes, delete</button></div></fieldset></div>');
  }
  error.textContent = "";
  editor.showModal();
}

function updateCustomCategory() {
  const custom = form.elements.customCategory;
  custom.required = form.elements.invoiceCategory.value === "Other";
  custom.closest("label").hidden = custom.disabled = !custom.required;
}

function updateInvoiceOptions(selected) {
  const select = form.elements.namedItem("invoiceId");
  if (!select) return;
  const lease = form.elements.namedItem("lease").value;
  const applying = editing.deposit === depositApplied;
  const tenantId = form.elements.billedTenant?.value;
  select.disabled = !applying && (form.elements.namedItem("type").value !== "Payment" || !lease);
  select.closest("label").hidden = select.disabled;
  const invoices = data.ledger.filter(entry => entry.invoice && !entry.voidedOn && entry.lease === lease &&
    (!applying || (!isDepositInvoice(entry) && (!entry.billedTenant || entry.billedTenant === tenantId))) &&
    (entry.id === selected || paymentTotal(invoicePayments(entry.id)) < ledgerCents(entry)));
  select.innerHTML = '<option value="">' + (applying ? "Select an outstanding invoice" : "Unallocated payment") + '</option>' + invoices.map(invoice => {
    const available = ledgerCents(invoice) - paymentTotal(invoicePayments(invoice.id, undefined, editing.id));
    const tenant = invoice.billedTenant ? labelFor("tenants", invoice.billedTenant) : "Lease-wide";
    return '<option value="' + escape(invoice.id) + '">' + escape((invoice.reference || "Invoice") + " · " + invoice.note +
      " · " + tenant + " · " + (available / 100).toFixed(2) + " available") + '</option>';
  }).join("");
  select.value = invoices.some(invoice => invoice.id === selected) ? selected : "";
}

function updateDepositInvoiceOptions(selected) {
  const select = form.elements.namedItem("depositInvoiceId");
  if (!select) return;
  const account = { lease: form.elements.lease.value, billedTenant: form.elements.billedTenant.value };
  const entries = depositActivity(data.ledger).filter(entry => sameDepositAccount(entry, account));
  const receipts = entries.filter(entry => entry.type === "Deposit received");
  const sources = [...new Set(receipts.map(entry => entry.invoiceId).filter(Boolean))];
  const hasManualReceipt = receipts.some(entry => !entry.invoiceId);
  select.required = sources.length > 0 && !hasManualReceipt;
  select.innerHTML = '<option value="">' + (hasManualReceipt ? "Deposit recorded separately" : "Select a deposit invoice") +
    '</option>' + sources.map(id => {
      const invoice = find("ledger", id);
      return '<option value="' + escape(id) + '">' + escape(invoice.reference || "Deposit invoice") + '</option>';
    }).join("");
  select.value = sources.includes(selected) ? selected : select.required && sources.length === 1 ? sources[0] : "";
  select.closest("label").hidden = sources.length === 0;
}

function prefillDepositReturn() {
  if (editing.deposit !== "Deposit returned" || editing.id) return;
  const { lease, billedTenant, depositInvoiceId, date, amount } = form.elements;
  amount.value = "";
  if (!lease.value || !date.value || (billedTenant.required && !billedTenant.value) ||
    (depositInvoiceId.required && !depositInvoiceId.value)) return;

  const account = { lease: lease.value, billedTenant: billedTenant.value };
  const available = source => {
    const daily = depositsByDate(data.ledger, account, source);
    let balance = 0;
    let remaining = Infinity;
    for (const day of [...new Set([...daily.keys(), date.value])].sort()) {
      balance += daily.get(day) ?? 0;
      if (day >= date.value) remaining = Math.min(remaining, balance);
    }
    return remaining;
  };
  const source = depositInvoiceId.value;
  const remaining = source ? Math.min(available(), available(source)) : available();
  if (remaining > 0) amount.value = (remaining / 100).toFixed(2);
}

function updateBillingTenant(selected) {
  const select = form.elements.namedItem("billedTenant");
  if (!select) return;
  const lease = find("leases", form.elements.namedItem("lease").value);
  const ids = lease ? leaseTenantIds(lease) : [];
  select.required = ids.length > 1;
  select.innerHTML = '<option value="">' + (ids.length > 1 ? "Select a tenant" : "Select a lease first") + '</option>' +
    ids.map(id => '<option value="' + escape(id) + '">' + escape(labelFor("tenants", id)) + '</option>').join("");
  const preferred = selected ?? editing.profile?.id;
  select.value = ids.includes(preferred) ? preferred : ids.length === 1 ? ids[0] : "";
}

function updateAdditionalTenants() {
  const primary = form.elements.tenant.disabled ? "" : form.elements.tenant.value;
  const group = form.querySelector(".lease-tenants");
  const choices = [...group.querySelectorAll('input[name="additionalTenants"]')];
  for (const choice of choices) {
    choice.disabled = choice.value === primary;
    choice.closest("label").hidden = choice.disabled;
    if (choice.disabled) choice.checked = false;
  }
  group.hidden = !choices.some(choice => !choice.disabled);
}

function updateTenantLeaseWarning() {
  const fields = new FormData(form);
  const selected = [fields.get("tenant"), ...fields.getAll("additionalTenants")];
  const occupiedTenants = new Set(data.leases.filter(lease => lease.id !== editing.id && currentLease(lease))
    .flatMap(leaseTenantIds));
  const names = data.tenants.filter(tenant => selected.includes(tenant.id) && occupiedTenants.has(tenant.id))
    .map(tenant => tenant.name);
  form.querySelector("#lease-tenant-warning").textContent = names.length ?
    names.join(", ") + (names.length === 1 ? " already has an active lease." : " already have active leases.") +
    " You can still save this lease." : "";
}

function updateLeaseAllocations() {
  const container = form.querySelector("#lease-allocations");
  if (!container) return;
  const fields = new FormData(form);
  const primary = fields.has("createTenant") ? "new" : fields.get("tenant");
  const tenants = [...new Set([primary, ...fields.getAll("additionalTenants")].filter(Boolean))];
  const previous = new Map([...container.querySelectorAll("input")].map(input => [input.name, input.value]));
  container.innerHTML = fields.get("leaseBilling") && tenants.length > 1 ?
    '<p class="muted">Enter each share. Leave a share blank for a tenant who won’t be billed.</p>' +
    tenants.map(id => inputFor(field("share_" + id, id === "new" ? "New tenant share" : labelFor("tenants", id) + " share", "number", true),
      previous.get("share_" + id) ?? "")).join("") : "";
  const createDeposit = fields.has("createDepositInvoice");
  const payer = form.elements.leaseDepositTenant;
  const selected = payer.value;
  payer.disabled = !createDeposit || tenants.length < 2;
  payer.required = !payer.disabled;
  payer.closest("label").hidden = payer.disabled;
  payer.innerHTML = '<option value="">Select a tenant</option>' + tenants.map(id =>
    '<option value="' + escape(id) + '">' + escape(id === "new" ? "New tenant" : labelFor("tenants", id)) + '</option>').join("");
  if (tenants.includes(selected)) payer.value = selected;
}

function updateLeaseDates() {
  const term = form.elements.namedItem("term");
  const end = form.elements.namedItem("end");
  end.disabled = term.value !== annual;
  end.required = term.value === annual;
  end.closest("label").hidden = end.disabled;
  if (!end.disabled && !editing.endDateEdited) {
    const start = form.elements.start.value;
    const lastDay = new Date(start + "T00:00:00Z");
    if (start && Number.isFinite(lastDay.getTime())) {
      lastDay.setUTCFullYear(lastDay.getUTCFullYear() + 1);
      lastDay.setUTCDate(lastDay.getUTCDate() - 1);
      end.value = lastDay.toISOString().split("T")[0];
    } else end.value = "";
  }
  const conversion = form.elements.namedItem("convertToMonthly");
  conversion.disabled = end.disabled;
  conversion.closest("label").hidden = end.disabled;
}

function updateTenantFields() {
  const create = form.elements.namedItem("createTenant").checked;
  const select = form.elements.namedItem("tenant");
  select.disabled = create;
  select.closest("label").hidden = create;
  const fields = form.querySelector("#new-tenant");
  fields.hidden = !create;
  fields.disabled = !create;
}

function validate(key, values, id, pendingRoom) {
  const expense = key === "ledger" && values.type === "Expense";
  if (views[key].fields.some(field => !field.optional && !values[field.key] && !(expense && field.key === "lease"))) return "Complete all required fields.";
  if (expense && (!find("properties", values.property) || !values.note || values.date > today)) {
    return "Choose a property, enter a description, and use an expense date no later than today.";
  }
  if (key === "properties") {
    values.jurisdiction = values.jurisdiction.toUpperCase();
    if (!/^(CA|US)-[A-Z]{2}$/.test(values.jurisdiction)) return "Enter a jurisdiction code such as CA-ON or US-NY.";
    const previous = find(key, id);
    const hasLeases = data.leases.some(lease => propertyFor(lease.space)?.id === id);
    if (previous && previous.currency !== values.currency && (hasLeases ||
      data.ledger.some(entry => entry.type === "Expense" && entry.property === id))) return "Currency cannot change while this property has leases or expenses.";
  }
  if (key === "spaces") {
    if (values.type === "Room" && values.rentalSetup === rentalSetups[0]) return "Choose Rent By Room for an individual room.";
    const previous = find(key, id);
    if (previous?.unit && (values.property !== previous.property || values.type !== "Room")) return "A room must stay with its original unit.";
    if (previous && data.spaces.some(room => room.unit === id) &&
      (values.property !== previous.property || values.type !== "Unit" ||
        (previous.type === unitByRoom && values.rentalSetup !== rentalSetups[1]))) {
      return "Keep this unit’s property and rental setup while it has room records.";
    }
    if (previous && previous.property !== values.property && data.leases.some(lease => lease.space === id)) return "Units and rooms with leases must stay with their original property.";
    if (previous && previous.property !== values.property && propertyType(find("properties", previous.property)) === singleUnit) {
      return "Switch the original property to Multi-unit before moving its rental space.";
    }
    const property = find("properties", values.property);
    if (property && propertyType(property) === singleUnit &&
      (previous?.property !== values.property || (values.type !== "Unit" && !previous.unit))) {
      return "Switch to Multi-unit to add separate unit or room records.";
    }
  }
  if (key === "ledger" && values.type === "Payment" && !values.method) return "Choose a payment method.";
  if (key === "ledger") {
    const previous = find(key, id);
    if (values.invoiceId) {
      const invoice = find("ledger", values.invoiceId);
      if (!invoice?.invoice || invoice.voidedOn || invoice.lease !== values.lease || !["Payment", depositApplied, "Refund"].includes(values.type)) return "Choose an invoice from this lease.";
      if (values.type === "Refund") {
        if (isDepositInvoice(invoice) || values.date < invoiceDate(invoice) || values.date > today ||
          paymentTotal(invoicePayments(invoice.id, values.date)) < ledgerCents(invoice)) {
          return "Choose a refund date on or after the invoice was paid in full and no later than today.";
        }
      }
      if (values.type === depositApplied && (isDepositInvoice(invoice) || values.date < invoiceDate(invoice) ||
        (invoice.billedTenant && invoice.billedTenant !== values.billedTenant))) {
        return "Choose a non-deposit invoice for this tenant and an application date on or after the invoice date.";
      }
      if (values.type !== "Refund" && -ledgerCents(values) + paymentTotal(invoicePayments(invoice.id, undefined, id)) > ledgerCents(invoice)) {
        return "The payment exceeds the amount remaining on this invoice.";
      }
    }
    if (previous?.invoice) {
      const allocated = invoicePayments(id);
      if (data.ledger.some(entry => entry.type === "Refund" && entry.invoiceId === id) &&
        (values.category !== invoiceCategory(previous) || values.amount !== previous.amount || invoiceDate(values) !== invoiceDate(previous))) {
        return "The category, amount, and invoice date are fixed once a refund has been recorded.";
      }
      if (values.category === "Deposit" && allocated.some(entry => entry.type === depositApplied)) {
        return "An invoice settled using a deposit cannot be categorized as a Deposit invoice.";
      }
      if (allocated.length && (previous.lease !== values.lease || previous.billedTenant !== values.billedTenant ||
        ledgerCents(values) < paymentTotal(allocated))) {
        return "This invoice has allocated payments. Keep the lease and billed tenant, and enter an amount at least equal to the payments.";
      }
    }
    if (values.type === depositApplied && !values.invoiceId) return "Choose an invoice for the deposit.";
    if (previous?.schedule && (previous.lease !== values.lease || previous.date !== values.date)) {
      return "The lease and due date are fixed for a posted recurring invoice.";
    }
  }
  if (key === "schedules") {
    const lease = find("leases", values.lease);
    const ends = lease && occupancyEnd(lease);
    if (!lease || values.start < lease.start || (ends && values.start > ends)) return "Choose a first due date within the tenancy.";
    if (values.end && values.end < values.start) return "The last billing date must be on or after the first due date.";
    const previous = find(key, id);
    if (previous && scheduleEntries(previous) && (previous.lease !== values.lease || previous.start !== values.start ||
      scheduleFrequency(previous) !== values.frequency || (previous.billedTenant && previous.billedTenant !== values.billedTenant))) {
      return "The lease, billed tenant, first due date, and billing frequency are fixed once invoices have been posted.";
    }
  }
  if (key === "leases") {
    const space = find("spaces", values.space) || pendingRoom;
    if (!space || (space.type === unitByRoom && find("leases", id)?.space !== space.id)) {
      return "Select a vacant room. Check the unit’s bedroom count and the lease dates.";
    }
    const oldLease = find("leases", id);
    if (!activeSpace(space) && (oldLease?.space !== space.id ||
      oldLease.start !== values.start || occupancyEnd(oldLease) !== occupancyEnd(values))) {
      return "Restore the property or unit before changing its lease dates or assigning a new lease.";
    }
    if (values.term === annual && !values.end) return "Enter the annual lease’s fixed term end date.";
    if (values.end && values.end < values.start) return "The end date must be on or after the start date.";
    if (values.tenancyEnd && values.tenancyEnd < values.start) return "The confirmed tenancy end must be on or after the start date.";
    const end = occupancyEnd(values);
    const overlaps = overlappingTenancy(space, values.start, end, id);
    if (overlaps) return "This unit or room already has a tenancy during those dates. Record its confirmed end before adding a replacement.";
    const previous = find(key, id);
    const billingRecords = [...data.ledger, ...data.schedules].filter(record => record.lease === id);
    if (previous && (previous.space !== values.space || previous.tenant !== values.tenant ||
      billingRecords.some(record => record.billedTenant && !leaseTenantIds(values).includes(record.billedTenant))) && billingRecords.length) {
      return "The tenant and rental space are fixed once a lease has ledger entries or a billing schedule.";
    }
  }
  return "";
}

view.addEventListener("click", event => {
  const row = event.target.closest("[data-row-link]");
  if (row && !event.target.closest("a, button, input, select, label, .action-popover") && !window.getSelection()?.toString()) {
    location.hash = row.dataset.rowLink.slice(1);
  }
  const button = event.target.closest("button");
  if (button?.dataset.ledgerStatus) {
    for (const option of view.querySelectorAll("[data-ledger-status]")) option.setAttribute("aria-pressed", option === button);
    view.querySelector("#ledger-type").value = button.dataset.ledgerStatus === "All" ? "" : "Invoice";
    filterFinancials();
  }
  if (button?.matches(".action-trigger")) {
    const menu = document.getElementById(button.getAttribute("popovertarget"));
    const rect = button.getBoundingClientRect();
    const below = innerHeight - rect.bottom;
    const above = rect.top;
    const openUp = below < 240 && above > below;
    menu.style.right = Math.max(8, Math.min(innerWidth - rect.right, innerWidth - 206)) + "px";
    menu.style.top = openUp ? "auto" : rect.bottom + 4 + "px";
    menu.style.bottom = openUp ? innerHeight - rect.top + 4 + "px" : "auto";
    menu.style.maxHeight = Math.max(0, (openUp ? above : below) - 12) + "px";
  }
  const menu = event.target.closest(".action-popover");
  if (menu && event.target.closest("button, a")) menu.hidePopover();
  if (button?.dataset.invoiceAction) {
    const invoice = find("ledger", button.dataset.invoiceId);
    const { lease, billedTenant, note, amount, customCategory } = invoice;
    const defaults = { lease, billedTenant, note, amount, category: invoiceCategory(invoice), customCategory };
    if (button.dataset.invoiceAction === "void") {
      voidInvoice(invoice);
    } else if (button.dataset.invoiceAction === "refund") {
      openEditor("ledger", undefined, "Refund", invoice.id);
    } else if (button.dataset.invoiceAction === "return") {
      openEditor("ledger", undefined, "Deposit returned", undefined, find("leases", lease), { billedTenant, depositInvoiceId: invoice.id });
    } else if (button.dataset.invoiceAction === "apply") {
      openEditor("ledger", undefined, depositApplied, undefined, find("leases", lease), { billedTenant, invoiceId: invoice.id });
    } else if (button.dataset.invoiceAction === "clone") {
      openEditor("ledger", undefined, "Invoice", undefined, undefined, { ...defaults, date: invoice.date < today ? today : invoice.date });
    } else {
      openEditor("schedules", undefined, undefined, undefined, undefined, defaults);
    }
  }
  if (button?.dataset.endLease) openEndLease(button.dataset.endLease);
  if (button?.dataset.changeRent) openRentChange(button.dataset.changeRent);
  if (button?.dataset.reactivateLease) reactivateLease(button.dataset.reactivateLease);
  if (button?.dataset.editRoom) openSpaceMediaEditor(button.dataset.editRoom, button.dataset.parentUnit);
  if (button?.dataset.editUnitMedia) openSpaceMediaEditor(button.dataset.editUnitMedia, undefined, true);
  if (button?.dataset.archiveKey) toggleArchive(button.dataset.archiveKey, button.dataset.archiveId);
  if (button?.hasAttribute("data-run-billing")) postDueInvoices();
  if (button?.hasAttribute("data-post-ahead")) openPostAhead();
  if (button?.dataset.postSchedule) postDueInvoices({ scheduleId: button.dataset.postSchedule });
  if (button?.dataset.rentPayer) openPayerEditor(button.dataset.rentPayer);
  if (button?.dataset.add) openEditor(button.dataset.add, undefined, button.dataset.entry, button.dataset.invoiceId);
  if (button?.dataset.edit) openEditor(button.dataset.recordKey || route(), button.dataset.edit, button.dataset.entry);
});
view.addEventListener("input", event => {
  if (event.target.matches("#property-search, #property-model, #property-occupancy, #property-balance")) filterPortfolio();
  if (event.target.matches("#lease-search, #lease-filter, #lease-property")) filterLeases();
  if (event.target.matches("#tenant-search, #tenant-property, #tenant-status")) filterTenants();
  if (event.target.matches("#payment-period, #payment-currency")) renderPaymentTrend();
  if (event.target.matches("#ledger-type")) {
    for (const option of view.querySelectorAll("[data-ledger-status]")) {
      option.setAttribute("aria-pressed", option.dataset.ledgerStatus === "All");
    }
  }
  const dateFilter = event.target.dataset.transactionDate;
  if (dateFilter) {
    if (event.target.id === dateFilter + "-date-range") {
      const custom = event.target.value === "Custom date range";
      for (const field of view.querySelectorAll('input[data-transaction-date="' + dateFilter + '"]')) field.closest("label").hidden = !custom;
    }
    if (dateFilter === "tenant-history") filterTenantHistory();
    else filterFinancials();
  }
  if (event.target.matches("#ledger-search, #ledger-type, #ledger-property")) filterFinancials();
  if (event.target.matches("#tenant-history-type")) filterTenantHistory();
  if (event.target.matches("#schedule-filters select")) filterSchedules();
});
editor.querySelectorAll('button[type="button"]').forEach(button => button.addEventListener("click", () => editor.close()));
form.addEventListener("click", event => {
  if (event.target.closest("[data-show-delete], [data-cancel-delete]")) {
    const confirmation = form.querySelector("[data-delete-confirmation]");
    const show = form.querySelector("[data-show-delete]");
    show.hidden = confirmation.hidden;
    confirmation.hidden = !confirmation.hidden;
    (confirmation.hidden ? show : confirmation.querySelector("[data-cancel-delete]")).focus();
    error.textContent = "";
  }
  if (event.target.closest("[data-confirm-delete]") && !form.querySelector("[data-delete-confirmation]").hidden &&
    !form.querySelector('[type="submit"]').disabled) deleteEditedRecord();
  if (event.target.closest("[data-add-setup-unit]")) addSetupUnit();
  const remove = event.target.closest("[data-remove-setup-unit]");
  if (remove) {
    remove.closest("[data-unit-prefix]").remove();
    form.querySelector("[data-add-setup-unit]").focus();
  }
});

form.addEventListener("change", event => {
  if (event.target.name === "invoiceCategory") updateCustomCategory();
  const control = event.target;
  if (control.name === "leaseProperty" || control.name === "leaseUnit") {
    form.elements.leaseRoom.value = "";
    updateLeaseSpace();
  }
  if (control.name === "leaseRoom") updateLeaseSpace(control.value);
  const spaceType = event.target;
  if (editing.key === "spaces" && spaceType.name === "type" && spaceType.value === "Room") {
    form.elements.rentalSetup.value = rentalSetups[1];
  }
  if (event.target.name === "propertyType") updatePropertySetup();
  if (event.target.name === "lease") updateBillingTenant();
  if (["type", "lease", "billedTenant"].includes(event.target.name)) {
    updateInvoiceOptions(form.elements.invoiceId?.value || editing.defaultInvoiceId);
    updateDepositInvoiceOptions(form.elements.depositInvoiceId?.value);
  }
  if (["lease", "billedTenant", "depositInvoiceId", "date"].includes(event.target.name)) prefillDepositReturn();
  if (event.target.name === "leaseBilling") {
    const first = form.elements.namedItem("firstInvoiceDate");
    first.disabled = !event.target.value;
    first.required = !first.disabled;
    first.closest("label").hidden = first.disabled;
    const issue = form.elements.namedItem("leaseIssueDate");
    issue.disabled = event.target.value !== "One-time invoice";
    issue.required = !issue.disabled;
    issue.closest("label").hidden = issue.disabled;
    const lead = form.elements.namedItem("leaseLeadDays");
    lead.disabled = event.target.value !== "Recurring invoice schedule";
    lead.closest("label").hidden = lead.disabled;
  }
  if (["leaseBilling", "leaseFrequency"].includes(control.name)) {
    const recurring = form.elements.leaseBilling.value === "Recurring invoice schedule";
    const frequency = form.elements.leaseFrequency;
    frequency.closest("#lease-billing-frequency").hidden = frequency.disabled = !recurring;
    frequency.required = recurring;
    const amount = form.elements.leaseInvoiceAmount;
    amount.closest("label").hidden = amount.disabled = !recurring || frequency.value === billingFrequencies[0];
    amount.required = !amount.disabled;
  }
  if (event.target.name === "createTenant") updateTenantFields();
  if (editing.key === "leases" && ["tenant", "createTenant"].includes(event.target.name)) updateAdditionalTenants();
  if (editing.key === "leases" && ["tenant", "createTenant", "additionalTenants"].includes(event.target.name)) updateTenantLeaseWarning();
  if (event.target.name === "createDepositInvoice") {
    const enabled = event.target.checked;
    for (const field of [form.elements.leaseDepositAmount, form.elements.leaseDepositDue]) {
      field.disabled = !enabled;
      field.required = enabled;
      field.closest("label").hidden = !enabled;
    }
    if (enabled && !form.elements.leaseDepositDue.value) form.elements.leaseDepositDue.value = form.elements.start.value;
  }
  if (event.target.name === "start" && form.elements.createDepositInvoice?.checked && !form.elements.leaseDepositDue.value) {
    form.elements.leaseDepositDue.value = event.target.value;
  }
  if (["leaseBilling", "tenant", "createTenant", "additionalTenants", "createDepositInvoice"].includes(event.target.name)) updateLeaseAllocations();
  if (editing.key === "leases" && control.name === "end") editing.endDateEdited = Boolean(control.value);
  if (editing.key === "leases" && ["term", "start"].includes(control.name)) updateLeaseDates();
  if (event.target.name === "convertToMonthly") editing.rolloverSelected = true;
  if (editing.key === "leases" && ["start", "end", "tenancyEnd", "term", "convertToMonthly"].includes(control.name)) {
    updateLeaseSpace(form.elements.space.value);
  }
  if (editing.key === "leases" && event.target.name === "space" && !editing.rolloverSelected) {
    form.elements.namedItem("convertToMonthly").checked = defaultRollover(event.target.value);
  }
});
function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const submit = form.querySelector('[type="submit"]');
  if (submit.disabled) return;
  const currentEditor = editing;
  const { key, id } = editing;
  const formData = new FormData(form);
  if (key === "endLease") return saveLeaseEnd(id, formData);
  if (key === "rentChange") return saveRentChange(id, formData);
  if (key === "spaceMedia") return saveSpaceMedia(formData, submit);
  if (key === "rentPayer") return saveRentPayer(id, formData.get("payer"));
  if (key === "postAhead") return postDueInvoices({ dueThrough: formData.get("dueThrough") });
  const values = Object.fromEntries(views[key].fields.filter(field => formData.has(field.key))
    .map(field => [field.key, formData.get(field.key).trim()]));
  if (editing.expense) {
    values.type = "Expense";
    values.property = formData.get("property");
  }
  if (editing.invoice || key === "schedules") {
    values.category = formData.get("invoiceCategory");
    values.customCategory = formData.get("customCategory")?.trim() || undefined;
    if (values.category === "Other" && !values.customCategory) {
      error.textContent = "Enter a custom category.";
      return;
    }
  }
  if (editing.invoice) {
    values.type = "Charge";
    values.issueDate = formData.get("issueDate");
    if (!values.issueDate || values.issueDate > values.date) {
      error.textContent = "The invoice date must be on or before the due date.";
      return;
    }
    if (!values.note?.trim()) {
      error.textContent = "Enter an invoice description.";
      return;
    }
  }
  if (editing.paymentInvoice) {
    values.type = editing.refund ? "Refund" : "Payment";
    values.lease = editing.paymentInvoice.lease;
    values.invoiceId = editing.paymentInvoice.id;
    values.billedTenant = editing.paymentInvoice.billedTenant;
  }
  if (editing.deposit) values.type = editing.deposit;
  if (editing.terminationDate) values.date = editing.terminationDate;
  let newTenant;
  if (key === "leases" && formData.has("createTenant")) {
    newTenant = Object.fromEntries(tenantBasics.map(field => [field.key, formData.get("newTenant_" + field.key).trim()]));
    error.textContent = validate("tenants", newTenant);
    if (error.textContent) return;
    newTenant.id = crypto.randomUUID();
    values.tenant = newTenant.id;
  }
  if (key === "leases" && values.term === annual) {
    values.convertToMonthly = form.elements.namedItem("convertToMonthly").checked;
  }
  if (key === "leases") values.additionalTenants = formData.getAll("additionalTenants").filter(tenant => tenant !== values.tenant);
  if (key === "leases" && values.tenancyEnd && id) values.endReason = find("leases", id)?.endReason;
  if (editing.invoice || editing.deposit || key === "schedules") values.billedTenant = formData.get("billedTenant") || undefined;
  if (editing.deposit === depositApplied) values.invoiceId = formData.get("invoiceId");
  if (formData.get("depositInvoiceId")) values.depositInvoiceId = formData.get("depositInvoiceId");
  if (key === "ledger" && values.type === "Payment" && formData.get("invoiceId")) {
    values.invoiceId = formData.get("invoiceId");
    values.billedTenant = find("ledger", values.invoiceId)?.billedTenant;
  }
  if (key === "schedules") {
    const previous = find(key, id);
    if (previous?.start === values.start) values.billingDay = previous.billingDay;
  }
  const leaseUnit = key === "leases" && find("spaces", formData.get("leaseUnit"));
  const pendingRoom = leaseUnit?.type === unitByRoom && !find("spaces", values.space) && values.space ?
    leaseRoomOptions(leaseUnit).find(room => room.id === values.space) : undefined;
  error.textContent = validate(key, values, id, pendingRoom);
  if (error.textContent) return;
  if (key === "spaces") storeSpaceType(values);
  let newSpaces = [];
  const editedSpaces = new Map();
  if (key === "properties") {
    values.propertyType = formData.get("propertyType");
    const previous = find("properties", id);
    values.buildingType = previous?.buildingType ||
      (previous && ![singleUnit, multiUnit].includes(previous.propertyType) ? previous.propertyType : undefined);
    const existing = data.spaces.filter(space => space.property === id);
    if (values.propertyType === singleUnit) {
      const units = existing.filter(space => !space.unit);
      if (units.length > 1 || units.some(space => space.type === "Room")) {
        error.textContent = "Keep Multi-unit for a property with separate units or rooms.";
        return;
      }
      const type = formData.get("singleRentalSetup") === rentalSetups[1] ? unitByRoom : "Unit";
      if (type === "Unit" && units[0]?.type === unitByRoom && existing.some(space => space.unit)) {
        error.textContent = "Keep Rent By Room while this unit has room records.";
        return;
      }
      const parent = { ...(units[0] || { id: crypto.randomUUID(), name: "Whole property" }),
        type, bedrooms: formData.get("singleBedrooms") };
      if (units.length) editedSpaces.set(parent.id, parent);
      else newSpaces.push(parent);
    } else {
      const names = new Set();
      for (const row of form.querySelectorAll("[data-unit-prefix]")) {
        const previousUnit = existing.find(space => space.id === row.dataset.unitId);
        const space = Object.fromEntries(setupUnitFields.map(field => [
          field.key, formData.get(row.dataset.unitPrefix + field.key).trim()
        ]));
        space.type = "Unit";
        storeSpaceType(space);
        const name = space.name.toLowerCase();
        if (!name || (names.has(name) && previousUnit?.name.trim().toLowerCase() !== name)) {
          error.textContent = name ? "Use a different name for each unit or room." : "Enter a name for each unit or room.";
          return;
        }
        names.add(name);
        if (previousUnit?.type === unitByRoom && space.type !== unitByRoom && existing.some(room => room.unit === previousUnit.id)) {
          error.textContent = "Keep Rent By Room for units that have room records.";
          return;
        }
        const unit = { ...previousUnit, ...space, id: previousUnit?.id || crypto.randomUUID() };
        if (previousUnit) editedSpaces.set(unit.id, unit);
        else newSpaces.push(unit);
      }
    }
    const file = formData.get("photo");
    if (file.size) {
      if (file.size > 400 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        error.textContent = "Choose a JPEG, PNG, or WebP photo up to 400 KB.";
        return;
      }
      submit.disabled = true;
      try {
        values.photo = await readPhoto(file);
      } catch {
        if (editing === currentEditor && editor.open) error.textContent = "This browser could not read the photo.";
        return;
      } finally {
        submit.disabled = false;
      }
      if (editing !== currentEditor || !editor.open) return;
    } else if (!formData.has("removePhoto")) {
      values.photo = find(key, id)?.photo;
    }
  }
  const previousInvoice = editing.invoice && id ? find(key, id) : null;
  const record = editing.invoice && !id ? invoiceEntry(values.lease, values.date, values.amount, values.note, values.billedTenant,
    undefined, values.issueDate, values.category, values.customCategory) :
    { ...(key === "spaces" ? find(key, id) : previousInvoice), ...values, id: id ?? crypto.randomUUID() };
  if (id && ["leases", "schedules"].includes(key)) record.rentChanges = find(key, id)?.rentChanges;
  if (editing.invoice && id && !previousInvoice.invoice) {
    record.invoice = true;
    record.reference ||= "INV-" + crypto.randomUUID().slice(0, 12).toUpperCase();
  }
  const updated = id ? data[key].map(item => item.id === id ? record : item) : [...data[key], record];
  const next = { ...data, [key]: updated };
  if (key === "ledger") {
    const affectedInvoices = new Set([record.invoiceId, find("ledger", id)?.invoiceId].filter(Boolean));
    for (const invoiceId of affectedInvoices) {
      const invoice = find("ledger", invoiceId);
      const linked = updated.filter(entry => entry.invoiceId === invoiceId);
      const refunds = linked.filter(entry => entry.type === "Refund");
      const payments = linked.filter(entry => entry.type === "Payment" || entry.type === depositApplied);
      let refunded = 0;
      for (const refund of refunds.sort((a, b) => a.date.localeCompare(b.date))) {
        refunded += ledgerCents(refund);
        const paid = paymentTotal(payments.filter(payment => payment.date <= refund.date));
        if (paid < Math.max(refunded, ledgerCents(invoice))) {
          error.textContent = "Refunds cannot exceed the paid amount. Keep the invoice fully paid as of each refund date.";
          return;
        }
      }
    }
    const accounts = [...depositActivity(data.ledger), ...depositActivity(updated)]
      .filter(entry => entry.id === record.id || entry.invoiceId === record.id || entry.depositInvoiceId === record.id);
    if (accounts.some(account => worsensDepositBalance(updated, account))) {
      error.textContent = "This change would leave a return or application greater than the deposit held for this lease and tenant.";
      return;
    }
    if (accounts.some(account => {
      const source = account.depositInvoiceId || (account.type === "Deposit received" && account.invoiceId);
      return source && worsensDepositBalance(updated, account, source);
    })) {
      error.textContent = "This change would exceed the deposit held on the selected deposit invoice.";
      return;
    }
  }
  if (key === "spaces") {
    const previousSpace = find("spaces", id);
    if (previousSpace?.unit) {
      record.unit = previousSpace.unit;
      record.roomNumber = previousSpace.roomNumber;
    }
  }
  if (editedSpaces.size) next.spaces = data.spaces.map(space => editedSpaces.get(space.id) || space);
  if (newSpaces.length) next.spaces = [...(next.spaces || data.spaces), ...newSpaces.map(space => ({
    ...space, property: key === "properties" ? record.id : record.property
  }))];
  if (pendingRoom) next.spaces = [...data.spaces, pendingRoom];
  const posted = key === "schedules" ? readyInvoices(record) : [];
  if (posted.length) next.ledger = [...data.ledger, ...posted];
  if (newTenant) next.tenants = [...data.tenants, newTenant];
  const billing = formData.get("leaseBilling");
  if (key === "leases" && !id && billing) {
    const date = formData.get("firstInvoiceDate");
    const issue = formData.get("leaseIssueDate");
    const ends = occupancyEnd(record);
    if (!date || date < record.start || (ends && date > ends)) {
      error.textContent = "Choose a first invoice date within the tenancy.";
      return;
    }
    if (billing === "One-time invoice" && (!issue || issue > date)) {
      error.textContent = "The invoice date must be on or before the due date.";
      return;
    }
    const tenants = leaseTenantIds(record);
    const frequency = billing === "Recurring invoice schedule" ? formData.get("leaseFrequency") : billingFrequencies[0];
    if (!billingFrequencies.includes(frequency)) {
      error.textContent = "Choose a billing frequency.";
      return;
    }
    const customAmount = frequency !== billingFrequencies[0];
    const cents = Math.round(Number(customAmount ? formData.get("leaseInvoiceAmount") : record.rent) * 100);
    if (customAmount && (!Number.isSafeInteger(cents) || cents <= 0)) {
      error.textContent = "Enter a positive amount per invoice.";
      return;
    }
    const shares = tenants.length === 1 ? [{ tenant: tenants[0], cents }] : tenants.map(tenant => ({
      tenant,
      cents: Math.round(Number(formData.get("share_" + (tenant === newTenant?.id ? "new" : tenant))) * 100)
    })).filter(share => share.cents > 0);
    if (shares.reduce((total, share) => total + share.cents, 0) !== cents) {
      error.textContent = customAmount ? "The tenant shares must add up to the amount per invoice." :
        "The tenant shares must add up to the full monthly rent.";
      return;
    }
    if (billing === "One-time invoice") next.ledger = [...data.ledger,
      ...shares.map(share => invoiceEntry(record.id, date, (share.cents / 100).toFixed(2), "Rent", share.tenant,
        undefined, issue, "Rent"))];
    else next.schedules = [...data.schedules, ...shares.map(share => ({
      id: crypto.randomUUID(), lease: record.id, billedTenant: share.tenant, note: "Rent", category: "Rent",
      amount: (share.cents / 100).toFixed(2), frequency, start: date, leadDays: formData.get("leaseLeadDays") || "0", state: "Active"
    }))];
  }
  if (key === "leases" && !id && formData.has("createDepositInvoice")) {
    const cents = Math.round(Number(formData.get("leaseDepositAmount")) * 100);
    const date = formData.get("leaseDepositDue");
    const tenants = leaseTenantIds(record);
    const selected = formData.get("leaseDepositTenant");
    const payer = tenants.length === 1 ? tenants[0] : selected === "new" ? newTenant?.id : selected;
    if (!Number.isSafeInteger(cents) || cents <= 0 || !date || !tenants.includes(payer)) {
      error.textContent = "Enter a positive deposit amount, a due date, and the tenant to bill.";
      return;
    }
    next.ledger = [...next.ledger, invoiceEntry(record.id, date, (cents / 100).toFixed(2), "Deposit", payer,
      undefined, date < today ? date : today, "Deposit")];
  }
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    error.textContent = "This browser could not save the record.";
    return;
  }
  data = next;
  editor.close();
  if (editing.invoice && id && !previousInvoice.invoice && !editing.profile) {
    location.hash = recordLink("ledger", id);
    notify("Charge converted to an invoice.");
    return;
  }
  if (route() === key || editing.profile || editing.depositLease || (key === "properties" && propertyScope()?.id === id)) render();
  if (editing.expense && route() === "overview") renderPaymentTrend();
  else location.hash = key;
  notify(posted.length ? "Schedule saved. " + posted.length + (posted.length === 1 ? " invoice posted." : " invoices posted.") : "Record saved.");
});
window.addEventListener("hashchange", render);
render();
