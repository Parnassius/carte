function setCookie(name, value) {
  cookieStore.set({
    name: name,
    value: encodeURIComponent(value),
    expires: Date.now() + 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}

function refreshCookies() {
  setCookie("theme", document.documentElement.dataset.theme);
  setCookie("username", document.getElementById("username").value);
}

function setRandomUsername() {
  const field = document.getElementById("username");
  if (field.value.trim() === "") {
    const guestId = Math.floor(Math.random() * 1000000);
    field.value = `Guest ${guestId}`;
  }
}

document.getElementById("theme-selector").addEventListener("click", (event) => {
  if (event.target.localName === "button") {
    document.documentElement.dataset.theme = event.target.id;
    refreshCookies();
  }
});

document.getElementById("username").addEventListener("change", () => {
  setRandomUsername();
  refreshCookies();
});

setRandomUsername();
refreshCookies();
