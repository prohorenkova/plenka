import { cinemas, seatNumbers, STORAGE_KEY } from "./data.js";

const $ = (s) => document.querySelector(s);
const money = (n) => new Intl.NumberFormat("ru-RU").format(n) + " ₽";

function getTodayLocal() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidShowDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  const isRealDate =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  return isRealDate && value >= getTodayLocal();
}

const plural = (n, one, few, many) => {
  const x = Math.abs(n) % 100;
  const y = x % 10;
  return x > 10 && x < 20 ? many : y > 1 && y < 5 ? few : y === 1 ? one : many;
};

let bookings = [];
let selectedCinemaId = null;
let selectedSeats = new Set();
let storageAvailable = true;
let toastTimer;

function toast(message, error = false) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("error", error);
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

function readBookings() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(value)) throw new Error("Некорректные данные");

    return value.filter(
      (b) =>
        b &&
        Number.isInteger(b.id) &&
        Number.isInteger(b.cinemaId) &&
        Array.isArray(b.seats) &&
        typeof b.cinemaName === "string"
    );
  } catch {
    storageAvailable = false;
    toast("Не удалось прочитать сохранённые брони. Демо работает без истории.", true);
    return [];
  }
}

function saveBookings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
    storageAvailable = true;
    return true;
  } catch {
    storageAvailable = false;
    toast("Браузер не разрешил сохранить изменения.", true);
    return false;
  }
}

const cinemaById = (id) => cinemas.find((c) => c.id === Number(id));
const currentCinema = () => cinemaById(selectedCinemaId);

function isSeatBusy(cinema, seat) {
  const time = $("#time-select").value;
  const movie = $("#movie-select").value;
  const date = $("#show-date").value;

  // Начальная занятость мест зависит от выбранного сеанса.
  const initialBusy = cinema.busyByTime?.[time] || [];

  // Пользовательские брони учитываются для конкретного кинотеатра,
  // фильма, даты и времени.
  const alreadyBooked = bookings.some(
    (b) =>
      b.cinemaId === cinema.id &&
      b.movie === movie &&
      b.seats.includes(seat) &&
      b.date === date &&
      b.time === time
  );

  return initialBusy.includes(seat) || alreadyBooked;
}

function filteredCinemas() {
  const district = $("#district-filter").value;
  const max = Number($("#price-filter").value);

  return cinemas.filter(
    (c) => (district === "all" || c.district === district) && c.price <= max
  );
}

function renderPins(items) {
  const host = $("#map-pins");
  host.innerHTML = "";

  items.forEach((c) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "map-pin" + (selectedCinemaId === c.id ? " selected" : "");
    btn.style.left = c.x + "%";
    btn.style.top = c.y + "%";
    btn.textContent = String(c.id).padStart(2, "0");
    btn.setAttribute("aria-label", `Выбрать кинотеатр ${c.name}`);
    btn.title = c.name;
    btn.addEventListener("click", () => selectCinema(c.id));
    host.append(btn);
  });
}

function renderCinemaList(items) {
  const host = $("#cinema-list");
  host.innerHTML = "";

  items.forEach((c) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cinema-item" + (selectedCinemaId === c.id ? " active" : "");
    btn.innerHTML = `<span class="cinema-index">${String(c.id).padStart(2, "0")}</span><span class="cinema-info"><b>${c.name}</b><small>${c.metro} · ${c.district} район</small><small class="cinema-tag">${c.tag}</small></span><span class="cinema-cost">${money(c.price)}<small>от / билет</small></span>`;
    btn.addEventListener("click", () => selectCinema(c.id));
    host.append(btn);
  });

  $("#result-count").textContent = `${items.length} ${plural(items.length, "кинотеатр", "кинотеатра", "кинотеатров")}`;
  $("#list-count").textContent = String(items.length).padStart(2, "0");
  $("#empty-state").hidden = items.length > 0;
}

function renderExplorer() {
  const items = filteredCinemas();
  renderPins(items);
  renderCinemaList(items);

  if (selectedCinemaId && !items.some((c) => c.id === selectedCinemaId)) {
    selectedCinemaId = null;
    selectedSeats.clear();
    $("#booking-content").hidden = true;
    $("#booking-empty").hidden = false;
    toast("Выбранный кинотеатр скрыт фильтрами.");
  }
}

function selectCinema(id) {
  selectedCinemaId = id;
  selectedSeats.clear();
  renderExplorer();
  renderBooking();
  $("#booking").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderBooking() {
  const c = currentCinema();
  if (!c) return;

  $("#booking-empty").hidden = true;
  $("#booking-content").hidden = false;
  $("#selected-cinema-name").textContent = c.name;
  $("#selected-cinema-address").textContent = c.address + " · " + c.metro;

  $("#movie-select").innerHTML = c.movies
    .map((m) => `<option>${m}</option>`)
    .join("");

  $("#time-select").innerHTML = c.times
    .map((t) => `<option>${t}</option>`)
    .join("");

  const date = $("#show-date");
  date.min = getTodayLocal();

  if (!isValidShowDate(date.value)) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const day = String(tomorrow.getDate()).padStart(2, "0");

    date.value = `${year}-${month}-${day}`;
  }

  renderSeats();
  updateOrder();
}

function renderSeats() {
  const c = currentCinema();
  if (!c) return;

  const host = $("#seat-grid");
  host.innerHTML = "";

  seatNumbers.forEach((n) => {
    const btn = document.createElement("button");
    const busy = isSeatBusy(c, n);
    const picked = selectedSeats.has(n);

    btn.type = "button";
    btn.className = "seat" + (busy ? " busy" : picked ? " picked" : "");
    btn.textContent = n;
    btn.disabled = busy;
    btn.setAttribute(
      "aria-label",
      `Место ${n}: ${busy ? "занято" : picked ? "выбрано" : "свободно"}`
    );

    if (!busy) {
      btn.addEventListener("click", () => {
        if (selectedSeats.has(n)) {
          selectedSeats.delete(n);
        } else {
          selectedSeats.add(n);
        }

        renderSeats();
        updateOrder();
      });
    }

    host.append(btn);
  });
}

function updateOrder() {
  const c = currentCinema();
  if (!c) return;

  const seats = [...selectedSeats].sort((a, b) => a - b);
  const movie = $("#movie-select").value;
  const time = $("#time-select").value;
  const dateValue = $("#show-date").value;

  $("#order-movie").textContent = movie;

  $("#order-datetime").textContent = dateValue
    ? new Date(dateValue + "T00:00:00").toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
      }) + " · " + time
    : time;

  $("#order-seats").textContent = seats.length ? seats.join(", ") : "Не выбраны";
  $("#order-count").textContent = seats.length;
  $("#order-total").textContent = money(seats.length * c.price);
}

function renderBookings() {
  const host = $("#bookings-list");
  host.innerHTML = "";

  $("#bookings-empty").hidden = bookings.length > 0;
  $("#booking-counter").textContent = `${bookings.length} ${plural(bookings.length, "бронь", "брони", "броней")}`;

  bookings.forEach((b) => {
    const article = document.createElement("article");
    article.className = "booking-card";

    article.innerHTML = `<div class="ticket-stub"><span>ПЛЕНКАКИНО</span><b>${String(b.id).slice(-5)}</b></div><div class="ticket-info"><b>${b.cinemaName}</b><span>${b.movie}</span><small>${b.dateLabel} · ${b.time} · места ${b.seats.join(", ")}</small><small>${b.customer}</small></div><div class="ticket-total"><b>${money(b.total)}</b><small>${b.seats.length} ${plural(b.seats.length, "билет", "билета", "билетов")}</small></div><button type="button" class="cancel-booking" data-id="${b.id}">Отменить</button>`;

    article.querySelector("button").addEventListener("click", () => cancelBooking(b.id));
    host.append(article);
  });
}

function cancelBooking(id) {
  const item = bookings.find((b) => b.id === id);
  if (!item) return;

  bookings = bookings.filter((b) => b.id !== id);
  saveBookings();

  if (selectedCinemaId === item.cinemaId) {
    renderSeats();
    updateOrder();
  }

  renderBookings();
  toast("Бронь отменена — места снова свободны.");
}

function submitBooking(event) {
  event.preventDefault();

  const c = currentCinema();
  if (!c) return;

  const name = $("#customer-name").value.trim();
  const email = $("#customer-email").value.trim();
  const date = $("#show-date").value;
  const time = $("#time-select").value;
  const error = $("#form-error");

  error.textContent = "";

  if (!isValidShowDate(date)) {
    error.textContent = "Выбери сегодняшнюю или будущую дату сеанса.";
    $("#show-date").focus();
    return;
  }

  if (!selectedSeats.size) {
    error.textContent = "Сначала выбери хотя бы одно свободное место.";
    return;
  }

  if (name.length < 2) {
    error.textContent = "Введи имя (не менее 2 символов).";
    $("#customer-name").focus();
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    error.textContent = "Проверь адрес электронной почты.";
    $("#customer-email").focus();
    return;
  }

  const seats = [...selectedSeats].sort((a, b) => a - b);

  if (seats.some((n) => isSeatBusy(c, n))) {
    error.textContent = "Одно из мест уже занято. Выбери места заново.";
    selectedSeats.clear();
    renderSeats();
    updateOrder();
    return;
  }

  const booking = {
    id: Date.now(),
    cinemaId: c.id,
    cinemaName: c.name,
    movie: $("#movie-select").value,
    time,
    date,
    dateLabel: new Date(date + "T00:00:00").toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    seats,
    customer: name,
    email,
    total: seats.length * c.price,
    createdAt: new Date().toISOString(),
  };

  bookings.push(booking);
  const saved = saveBookings();

  selectedSeats.clear();
  renderSeats();
  updateOrder();
  renderBookings();

  toast(
    saved
      ? "Готово! Бронь добавлена в раздел «Мои билеты»."
      : "Бронь создана в этом сеансе, но не сохранена браузером.",
    !saved
  );

  $("#my-bookings").scrollIntoView({ behavior: "smooth", block: "start" });
}

function init() {
  bookings = readBookings();

  const districts = [...new Set(cinemas.map((c) => c.district))].sort((a, b) =>
    a.localeCompare(b, "ru")
  );

  districts.forEach((d) =>
    $("#district-filter").add(new Option(d + " район", d))
  );

  $("#district-filter").addEventListener("change", renderExplorer);

  $("#price-filter").addEventListener("input", (e) => {
    $("#price-output").textContent = money(Number(e.target.value));
    renderExplorer();
  });

  $("#reset-filters").addEventListener("click", () => {
    $("#district-filter").value = "all";
    $("#price-filter").value = "1000";
    $("#price-output").textContent = money(1000);
    renderExplorer();
  });

  $("#change-cinema").addEventListener("click", () =>
    $("#cinemas").scrollIntoView({ behavior: "smooth" })
  );

  $("#movie-select").addEventListener("change", () => {
    selectedSeats.clear();
    renderSeats();
    updateOrder();
  });

  $("#time-select").addEventListener("change", () => {
    selectedSeats.clear();
    renderSeats();
    updateOrder();
  });

  $("#show-date").min = getTodayLocal();

  $("#show-date").addEventListener("change", () => {
    selectedSeats.clear();

    const date = $("#show-date").value;
    const error = $("#form-error");

    if (!isValidShowDate(date)) {
      error.textContent = "Выбери сегодняшнюю или будущую дату сеанса.";
    } else {
      error.textContent = "";
    }

    renderSeats();
    updateOrder();
  });

  $("#booking-form").addEventListener("submit", submitBooking);

  $("#reset-demo").addEventListener("click", () => {
    if (!confirm("Удалить все учебные бронирования из этого браузера?")) return;

    bookings = [];

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      storageAvailable = false;
    }

    selectedSeats.clear();
    renderBookings();

    if (currentCinema()) {
      renderSeats();
      updateOrder();
    }

    toast("Демо-данные сброшены.");
  });

  renderExplorer();
  renderBookings();
}

init();