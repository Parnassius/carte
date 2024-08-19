class BaseGame {
  constructor() {
    this.pendingHandler = Promise.resolve();
    this.gameArea = document.getElementById("game-area");
    this.toasts = document.getElementById("toasts");
    this.positionAttributes = ["position", "player", "rotated"];
    this.cardAttributes = ["suit", "number", "back"];
    this.gameStarted = false;
    this.playerId = -1;
    this.players = [];
    this.decks = new Map();

    const sheet = new CSSStyleSheet();
    const baseSelector = `#game-area[data-game='${this.gameArea.dataset.game}'] .card`;
    sheet.replaceSync(`${baseSelector} {
      ${this.styleRules.join("\n")}
    }`);
    document.adoptedStyleSheets.push(sheet);

    if (document.location.hash.startsWith("#")) {
      this.setup();
    } else {
      document.getElementById("new-game-start").addEventListener(
        "click",
        () => {
          let gameId = document.getElementById("new-game-id").value.trim();
          if (!gameId) {
            const arr = new Uint32Array(4);
            window.crypto.getRandomValues(arr);
            gameId = Array.from(arr, (x) => x.toString(16).padStart(8, "0")).join("");
          }
          document.location.hash = gameId;
          this.setup();
        },
        { once: true },
      );
    }
  }

  get playerIdentifiers() {
    throw new Error();
  }

  get handSize() {
    throw new Error();
  }

  get styleRules() {
    const rules = [];

    rules.push(
      ...["bastoni", "coppe", "denari", "spade"].map(
        (suit, i) => `&[data-suit='${suit}'] {--card-bg-y: ${i}}`,
      ),
    );
    rules.push(
      ...["1", "2", "3", "4", "5", "6", "7", "fante", "cavallo", "re"].map(
        (number, i) => `&[data-number='${number}'] {--card-bg-x: ${i}}`,
      ),
    );

    for (let i = 1; i <= this.handSize; i++) {
      for (let j = 1; j <= this.handSize; j++) {
        const nthChildSelectors = this.playerIdentifiers.map(
          (player) =>
            `:nth-child(${i} of [data-position='hand'][data-player='${player}'])` +
            `:nth-last-child(${j} of [data-position='hand'][data-player='${player}'])`,
        );
        rules.push(`&[data-position='hand']:is(${nthChildSelectors.join(", ")}) {
          --card-hand-position: ${(i - j) / 2};
        }`);
      }
    }

    const deckShadows = (amount) => {
      const shadows = [];
      const colors = ["var(--card-border-color)", "var(--deck-shadow-color)"];
      for (let i = 1; i <= amount; i++) {
        shadows.push(`calc(var(--card-border-width) * ${i} * var(--deck-shadow-x))
                      calc(var(--card-border-width) * ${i} * var(--deck-shadow-y))
                      ${colors[i % 2]}`);
      }
      return shadows.join(",\n");
    };
    const deckShadowRules = [];
    for (let i = 5; i >= 1; i--) {
      deckShadowRules.push(`&[data-deck-count='${i + 1}'] {
        --deck-shadow-amount: ${i};
        box-shadow: ${deckShadows(i)};
      }`);
    }
    deckShadowRules.push(`&[data-deck-count='1'] {
      --deck-shadow-amount: 0;
      box-shadow: none;
    }`);
    rules.push(`&[data-deck] {
      box-shadow: ${deckShadows(6)};
      ${deckShadowRules.join("\n")}
    }`);

    return rules;
  }

  get playerSide() {
    return Math.max(0, this.playerId);
  }

  setup() {
    this.gameId = document.location.hash.substring(1);

    document.getElementById("new-game-id").value = this.gameId;
    document.getElementById("new-game-start").classList.add("loading");

    this.gameArea.addEventListener("click", this.onGameAreaClick.bind(this));
    document.getElementById("results-rematch").addEventListener("click", (event) => {
      if (this.playerId !== -1) {
        event.target.classList.add("loading");
        this.send("rematch");
      }
    });
    document.getElementById("username").addEventListener("change", (event) => {
      if (this.playerId !== -1) {
        this.send("name", event.target.value);
      }
    });

    this.connect();
  }

  connect() {
    const url = new URL(document.location.href);
    url.protocol = url.protocol.replace("http", "ws");
    url.pathname = `/ws${url.pathname}/${this.gameId}`;
    url.hash = "";
    this.ws = new WebSocket(url);
    this.ws.addEventListener("open", this.onWsOpen.bind(this));
    this.ws.addEventListener("message", this.onWsMessage.bind(this));
    this.ws.addEventListener("close", this.onWsClose.bind(this));
    this.ws.addEventListener("error", this.onWsError.bind(this));
  }

  onWsOpen() {
    const connectionLostToast = this.toasts.querySelector(
      "[data-permanent='connection-lost']",
    );
    if (connectionLostToast) {
      this.hideToast(connectionLostToast);
    }
    const name = document.getElementById("username").value;
    this.send("join", name);
  }

  onWsMessage(event) {
    console.info(`<< ${event.data}`);
    this.pendingHandler = this.handleCmd(...event.data.split("|"));
  }

  async onWsClose() {
    this.ws = null;
    delete this.gameArea.dataset.playing;
    this.createToast(
      "Connection lost... reconnecting",
      new Map([["permanent", "connection-lost"]]),
    );
    await this.sleep(5000);
    this.connect();
  }

  onWsError(event) {
    console.error(event);
    this.ws.close();
  }

  onGameAreaClick() {
    throw new Error();
  }

  send(...args) {
    const msg = args.map((x) => x.replaceAll("|", "")).join("|");
    console.info(`>> ${msg}`);
    this.ws.send(msg);
  }

  async sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async awaitTransition(element, func) {
    if ("noAnimations" in this.gameArea.dataset) {
      func();
      return;
    }

    const promises = [this.sleep(250)];
    if (!window.matchMedia("(prefers-reduced-motion)").matches) {
      const transitionsPromise = new Promise((resolve) => {
        const transitions = new Set();

        function runListener(event) {
          transitions.add(event.propertyName);
        }
        function endListener(event) {
          transitions.delete(event.propertyName);
          if (transitions.size === 0) {
            clearListenersAndResolve();
          }
        }
        function clearListenersAndResolve() {
          element.removeEventListener("transitionrun", runListener);
          element.removeEventListener("transitionend", endListener);
          resolve();
        }

        element.addEventListener("transitionrun", runListener);
        element.addEventListener("transitionend", endListener);
        window.setTimeout(clearListenersAndResolve, 1000);
      });
      promises.push(transitionsPromise);
    }
    func();
    await Promise.all(promises);
  }

  createToast(message, params) {
    if (
      params.has("permanent") &&
      this.toasts.querySelector(`[data-permanent='${params.get("permanent")}']`)
    ) {
      return;
    }
    const toast = document.createElement("div");
    toast.textContent = message;
    if (params.has("command")) {
      toast.dataset.command = params.get("command");
    }
    if (params.has("permanent")) {
      toast.dataset.permanent = params.get("permanent");
    }
    this.toasts.appendChild(toast);
    if (!params.has("permanent")) {
      window.setTimeout(async () => this.hideToast(toast), 5000);
    }
  }

  async hideToast(toast) {
    await this.awaitTransition(toast, () => {
      toast.classList.add("hidden");
    });
    toast.remove();
  }

  createNameTags() {
    for (const [playerId, playerName] of this.players.entries()) {
      const player = this.getPlayerIdentifier(playerId);
      let tag = this.gameArea.querySelector(`.name-tag[data-player='${player}']`);
      if (!tag) {
        tag = document.createElement("div");
        tag.classList.add("name-tag");
        tag.dataset.player = player;
        this.gameArea.appendChild(tag);
      }
      tag.textContent = playerName;
    }
  }

  addCardParams(card, params) {
    for (const [key, value] of params.entries()) {
      card.dataset[key] = value;
    }
  }

  async createCard(params) {
    const card = document.createElement("div");
    card.classList.add("card");
    this.addCardParams(card, params);
    await this.awaitTransition(card, () => {
      this.gameArea.appendChild(card);
    });
    return card;
  }

  async moveCardFromDeck(params, deckId = "deck") {
    const deck = this.decks.get(deckId);
    deck.dataset.deckCount--;
    await this.createCard(params);
  }

  async moveCardToDeck(card, deckId = "deck") {
    await this.awaitTransition(card, () => {
      for (const key of Object.keys(card.dataset)) {
        if (!this.cardAttributes.includes(key)) {
          delete card.dataset[key];
        }
      }
      const deck = this.decks.get(deckId);
      for (const key of this.positionAttributes) {
        if (key in deck.dataset) {
          card.dataset[key] = deck.dataset[key];
        }
      }
      deck.dataset.deckCount++;
    });
    card.remove();
  }

  async moveCardFromHand(params) {
    const partialSelector = `.card[data-position='hand'][data-player='${params.get("player")}']`;
    const frontSelector = `${partialSelector}[data-suit='${params.get("suit")}'][data-number='${params.get("number")}']`;
    const backSelector = `${partialSelector}[data-back]`;
    const card =
      this.gameArea.querySelector(frontSelector) ??
      this.gameArea.querySelector(backSelector);
    await this.awaitTransition(card, () => {
      const otherCards = document.querySelectorAll(
        `.card[data-position='${params.get("position")}']`,
      );
      const zIndex = Math.max(
        0,
        ...Array.from(otherCards, (card) => Number(card.style.zIndex)),
      );
      card.style.zIndex = zIndex + 1;
      delete card.dataset.back;
      this.addCardParams(card, params);
    });
  }

  async handleCmd(cmd, ...args) {
    await this.pendingHandler;
    const camelCmd = cmd.replaceAll(/((?:^|_)[a-z])/g, (m) => m.at(-1).toUpperCase());
    const func = this[`cmd${camelCmd}`];
    if (func) {
      await func.bind(this)(...args);
    } else {
      console.warn(`Unhandled command cmd${camelCmd}`);
    }
  }

  cmdError(message, command = null) {
    this.createToast(message, new Map([["command", command]]));
  }

  async cmdBegin() {
    this.gameStarted = true;
    this.gameArea.replaceChildren();
    this.createNameTags();
    const results = document.getElementById("results");
    await this.awaitTransition(results, () => {
      results.hidePopover();
    });
    document.getElementById("results-rematch").classList.remove("loading");
    document.getElementById("results-table").replaceChildren();
  }

  cmdPlayerId(playerId) {
    this.playerId = Number.parseInt(playerId);
    this.gameArea.dataset.playerId = playerId;
  }

  cmdPlayers(...players) {
    this.players = players;
    if (this.gameStarted) {
      this.createNameTags();
    }
  }

  async cmdAnimations(status) {
    if (status === "off") {
      this.gameArea.dataset.noAnimations = "";
    } else {
      await this.sleep(100);
      delete this.gameArea.dataset.noAnimations;
    }
  }

  cmdDeckCount(deckId, amount) {
    this.decks.get(deckId).dataset.deckCount = amount;
  }

  cmdTurn() {
    this.gameArea.dataset.playing = "";
  }

  async cmdDrawCard(playerId, card = null) {
    const params = new Map([
      ["position", "hand"],
      ["player", this.getPlayerIdentifier(playerId)],
    ]);
    if (card !== null) {
      const [suit, number] = card.split(":");
      params.set("suit", suit);
      params.set("number", number);
    } else {
      params.set("back", "");
    }
    await this.moveCardFromDeck(params);
  }

  async cmdPlayCard(playerId, card) {
    const [suit, number] = card.split(":");
    await this.moveCardFromHand(
      new Map([
        ["position", "playing-area"],
        ["player", this.getPlayerIdentifier(playerId)],
        ["suit", suit],
        ["number", number],
      ]),
    );
  }

  cmdResults(...results) {
    const table = document.getElementById("results-table");
    const sortedResults = Array.from(results.entries()).sort(([, a], [, b]) => b - a);
    for (const [playerId, points] of sortedResults) {
      const row = table.insertRow();
      if (playerId === this.playerId) {
        row.classList.add("me");
      }
      const playerCell = row.insertCell();
      playerCell.textContent = this.players[playerId];
      const pointsCell = row.insertCell();
      pointsCell.textContent = points;
    }
    document.getElementById("results").showPopover();
  }
}

export { BaseGame };
