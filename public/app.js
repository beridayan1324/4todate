const contentEl = document.getElementById("content");
const dateDisplayEl = document.getElementById("dateDisplay");
const errorEl = document.getElementById("error");

const skeletonCategories = [
  "קולנוע וטלוויזיה",
  "מוזיקה וסאונד",
  "אנשים מפורסמים",
  "ספורט ושיאים",
  "ספרות וכתיבה",
  "היסטוריה וטכנולוגיה",
];

function createElement(tag, className) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

function renderSkeleton() {
  contentEl.innerHTML = "";

  skeletonCategories.forEach((title) => {
    const section = createElement("section", "section");
    section.classList.add("skeleton");

    const header = createElement("div", "section-header");
    const titleEl = createElement("div", "section-title");
    titleEl.textContent = title;
    const badge = createElement("div", "section-badge");
    badge.textContent = "טוען";
    header.appendChild(titleEl);
    header.appendChild(badge);

    const cards = createElement("div", "cards");
    for (let i = 0; i < 3; i += 1) {
      const card = createElement("div", "card skeleton");
      const line1 = createElement("div", "skeleton-line short");
      const line2 = createElement("div", "skeleton-line medium");
      const line3 = createElement("div", "skeleton-line");
      const line4 = createElement("div", "skeleton-line");
      card.appendChild(line1);
      card.appendChild(line2);
      card.appendChild(line3);
      card.appendChild(line4);
      cards.appendChild(card);
    }

    section.appendChild(header);
    section.appendChild(cards);
    contentEl.appendChild(section);
  });
}

function renderContent(data) {
  contentEl.innerHTML = "";
  dateDisplayEl.textContent = data.dateDisplay || "";

  data.categories.forEach((category) => {
    const section = createElement("section", "section");
    section.dataset.accent = category.id;

    const header = createElement("div", "section-header");
    const titleEl = createElement("div", "section-title");
    titleEl.textContent = category.title;
    const badge = createElement("div", "section-badge");
    badge.textContent = "היום בהיסטוריה";
    header.appendChild(titleEl);
    header.appendChild(badge);

    const cards = createElement("div", "cards");

    category.items.forEach((item) => {
      const card = createElement("div", "card");

      const label = createElement("div", "card-label");
      label.textContent = item.label;

      const title = createElement("div", "card-title");
      title.textContent = item.title;

      const year = createElement("div", "card-year");
      year.textContent = `שנה: ${item.year}`;

      const desc = createElement("div", "card-desc");
      desc.textContent = item.description;

      card.appendChild(label);
      card.appendChild(title);
      card.appendChild(year);
      card.appendChild(desc);
      cards.appendChild(card);
    });

    section.appendChild(header);
    section.appendChild(cards);
    contentEl.appendChild(section);
  });
}

async function loadData() {
  renderSkeleton();
  errorEl.hidden = true;

  try {
    const response = await fetch("/api/today");
    if (!response.ok) {
      throw new Error("Network response was not ok");
    }
    const data = await response.json();
    renderContent(data);
  } catch (err) {
    errorEl.hidden = false;
  }
}

loadData();
