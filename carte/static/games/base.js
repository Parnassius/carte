class CardGroup {
  constructor(game, name, subFields) {
    this.game = game;
    this.name = name;
    this.subFields = subFields;

    this.params = new Map();
  }

  clone() {
    throw new Error();
  }

  // receive a card from another CardCroup (called by moveTo(...))
  receiveCard(/* card, params */) {
    throw new Error();
  }

  // sets a single key-value pair for this.params
  select(key, value) {
    return this.setParams(new Map([[key, value]]));
  }

  // sets multiple key-value pairs for this.params
  setParams(subFieldMap) {
    const copy = this.clone();
    for (const field of copy.subFields) {
      copy.params.set(field, subFieldMap.get(field));
    }
    return copy;
  }

  getSelector() {
    const sel = this.subFields
      .map(
        (field) =>
          `[data-${this.game.camelToKebab(field)}='${this.params.get(field)}']`,
      )
      .join("");
    return `.card[data-position='${this.name}']${sel}`;
  }

  clearPrefixTags(card, prefix) {
    for (const field of Object.keys(card.dataset)) {
      const chr = field.charAt(prefix.length);
      if (field.startsWith(prefix) && chr >= "A" && chr <= "Z") {
        delete card.dataset[field];
      }
    }
  }
}

class Deck extends CardGroup {
  clone() {
    return new Deck(this.game, this.name, this.subFields);
  }

  moveTo(dest, newParams) {
    const deckParams = new Map(
      this.subFields.map((field) => [
        `starting${this.game.capitalizeFirst(field)}`,
        this.params.get(field),
      ]),
    );
    deckParams.set("startingPosition", this.name);

    const card = this.game.createCard(deckParams);

    this.addCount(-1);

    const recFunc = dest.receiveCard(card, newParams);

    return () => {
      if (recFunc !== undefined) {
        recFunc();
      }

      this.clearPrefixTags(card, "starting");
    };
  }

  receiveCard(card, params) {
    const cardParams = new Map(params);
    cardParams.set("position", this.name);
    for (const field of this.subFields) {
      cardParams.set(field, this.params.get(field));
    }
    this.game.addCardParams(card, cardParams);

    return () => {
      card.remove();
      this.addCount(1);
    };
  }

  // creates the div.card for the deck and appends it to the game area
  instantiate(params) {
    const deckParams = new Map(params);
    deckParams.set("position", this.name);
    for (const field of this.subFields) {
      deckParams.set(field, this.params.get(field));
    }

    this.game.createCard(deckParams);
  }

  addCount(delta) {
    const deck = this.game.gameArea.querySelector(this.getSelector());
    const count = Number.parseInt(deck.dataset.deckCount);

    deck.dataset.deckCount = count + delta;
  }

  setCount(value) {
    const deck = this.game.gameArea.querySelector(this.getSelector());
    deck.dataset.deckCount = value;
  }
}

class CardField extends CardGroup {
  constructor(game, name, subFields, maxSize) {
    super(game, name, subFields);
    this.maxSize = maxSize;
  }

  clone() {
    return new CardField(this.game, this.name, this.subFields, this.maxSize);
  }

  // NOTE: if count is undefined, getCards(...) returns the entire array.
  moveTo(cardParams, dest, newParams, count = undefined) {
    const cards = this.getCards(cardParams, count);

    for (const card of cards) {
      for (const field of this.subFields) {
        delete card.dataset[field];
      }
      delete card.dataset.position;
      this.clearPrefixTags(card, "field");
    }

    this.refreshField();

    const funcs = cards.map((card) => dest.receiveCard(card, newParams));

    return () => {
      for (const func of funcs) {
        if (func !== undefined) {
          func();
        }
      }
    };
  }

  receiveCard(card, cardParams) {
    card.dataset.position = this.name;
    this.game.addCardParams(card, new Map([...cardParams, ...this.params]));

    this.refreshField();
  }

  // NOTE: if count is undefined, Array.prototype.slice(0) returns the entire array.
  getCards(params, count = undefined) {
    const cardSel = Array.from(params)
      .map(([k, v]) => `[data-${k}='${v}']`)
      .join("");
    return Array.from(
      this.game.gameArea.querySelectorAll(this.getSelector() + cardSel),
    ).slice(0, count);
  }

  refreshField() {
    const cards = Array.from(this.game.gameArea.querySelectorAll(this.getSelector()));
    // sort: keep the data-field-position order, with the undefined ones at the end (in appearance order)
    cards.sort((c1, c2) => {
      if (!("fieldPosition" in c1.dataset)) {
        if (!("fieldPosition" in c2.dataset)) {
          return 0; // both undefined: keep the previous order
        }
        return 1; // c2 before c1
      }
      if (!("fieldPosition" in c2.dataset)) {
        return -1; // c1 before c2
      }

      return (
        Number.parseInt(c1.dataset.fieldPosition) -
        Number.parseInt(c2.dataset.fieldPosition)
      );
    });

    for (const [i, card] of cards.entries()) {
      card.dataset.fieldPosition = i;
      card.dataset.fieldSize = cards.length;
    }
  }
}

class BaseGame {
  constructor() {
    this.pendingHandler = Promise.resolve();
    this.gameArea = document.getElementById("game-area");
    this.toasts = document.getElementById("toasts");
    this.gameStarted = false;
    this.playerId = -1;
    this.players = [];
    this.decks = new Map(
      this.deckGenerators.map(([name, ...args]) => [
        name,
        new Deck(this, name, ...args),
      ]),
    );
    this.cardFields = new Map(
      this.cardFieldGenerators.map(([name, ...args]) => [
        name,
        new CardField(this, name, ...args),
      ]),
    );

    this.transitionDuration = 500; // [ms]
    this.transitionPromiseResolve = undefined;
    this.transitionEvents = new Map();

    const sheet = new CSSStyleSheet();
    const baseSelector = `#game-area[data-game='${this.gameArea.dataset.game}'] .card`;
    sheet.replaceSync(`${baseSelector} {
      ${this.styleRules.join("\n")}
    }`);
    document.adoptedStyleSheets.push(sheet);

    const gameId = document.location.hash.substring(1);
    if (gameId) {
      document.getElementById("new-game-id").value = gameId;
      this.setup();
      this.connect();
    } else {
      document.getElementById("new-game-start").addEventListener(
        "click",
        () => {
          this.setup();
          this.connect();
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

  get cardFieldGenerators() {
    throw new Error();
  }

  get deckGenerators() {
    throw new Error();
  }

  getPlayerIdentifier(/* playerId */) {
    throw new Error();
  }

  isPlayerSelf(playerId) {
    return Number.parseInt(playerId) === this.playerId;
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

    const cardFieldSize = Math.max(
      ...Array.from(this.cardFields.values()).map((cf) => cf.maxSize),
    );
    for (let i = 1; i <= cardFieldSize; i++) {
      rules.push(`&[data-field-position='${i - 1}'] {
        --card-field-position: ${i - 1};
      }`);
      rules.push(`&[data-field-size='${i}'] {
        --card-field-size: ${i};
      }`);
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
    this.gameId = document.getElementById("new-game-id").value.trim();
    document.location.hash = this.gameId;

    document.getElementById("new-game-start").classList.add("loading");

    this.gameArea.addEventListener("click", this.onGameAreaClick.bind(this));

    this.gameArea.addEventListener("transitionrun", this.onTransitionRun.bind(this));
    this.gameArea.addEventListener("transitionend", this.onTransitionEnd.bind(this));

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
  }

  connect() {
    const url = new URL(document.location.href);
    url.protocol = url.protocol.replace("http", "ws");
    if (this.gameId) {
      url.pathname = `/ws${url.pathname}/${this.gameId}`;
    } else {
      url.pathname = `/ws${url.pathname}`;
    }
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

  onTransitionRun(event) {
    if (!event.target.matches(".card")) {
      return;
    }

    if (!this.transitionEvents.has(event.target)) {
      this.transitionEvents.set(event.target, new Set());
    }
    this.transitionEvents.get(event.target).add(event.propertyName);
  }
  onTransitionEnd(event) {
    if (!event.target.matches(".card")) {
      return;
    }

    this.transitionEvents.get(event.target).delete(event.propertyName);
    if (this.transitionEvents.get(event.target).size === 0) {
      this.transitionEvents.delete(event.target);
    }
    if (
      this.transitionEvents.size === 0 &&
      this.transitionPromiseResolve !== undefined
    ) {
      this.transitionPromiseResolve();
    }
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

  async awaitCardTransitions(afterFunc = undefined) {
    if ("noAnimations" in this.gameArea.dataset) {
      if (afterFunc !== undefined) {
        afterFunc();
      }
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion)").matches) {
      await this.sleep(this.transitionDuration / 2);
      if (afterFunc !== undefined) {
        afterFunc();
      }
      return;
    }

    const obj = Promise.withResolvers();
    this.transitionPromiseResolve = obj.resolve;

    // fallback: twice the duration of the transition
    window.setTimeout(obj.resolve, 2 * this.transitionDuration);

    await obj.promise;
    this.transitionPromiseResolve = undefined;

    if (afterFunc !== undefined) {
      afterFunc();
    }
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
      if (value === null) {
        delete card.dataset[key];
      } else {
        card.dataset[key] = value;
      }
    }
  }

  toggleCardParam(card, param) {
    if (param in card.dataset) {
      delete card.dataset[param];
    } else {
      card.dataset[param] = "";
    }
  }

  createCard(params) {
    const card = document.createElement("div");
    card.classList.add("card");
    this.addCardParams(card, params);
    this.gameArea.appendChild(card);
    return card;
  }

  async handleCmd(cmd, ...args) {
    await this.pendingHandler;
    const camelCmd = this.snakeToCamel(cmd, true);
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

  cmdGameId(gameId) {
    this.gameId = gameId;
    document.location.hash = this.gameId;
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
    this.decks.get(deckId).setCount(amount);
  }

  cmdTurn() {
    this.gameArea.dataset.playing = "";
  }

  async cmdDrawCard(playerId, card = null) {
    const player = this.getPlayerIdentifier(playerId);
    const params = new Map();
    if (card !== null) {
      const [suit, number] = card.split(":");
      params.set("suit", suit);
      params.set("number", number);
    }

    const deck = this.decks.get("deck");
    const func = deck.moveTo(
      this.cardFields.get("hand").select("player", player),
      params,
    );

    await this.awaitCardTransitions(func);
  }

  async cmdPlayCard(playerId, card) {
    const [suit, number] = card.split(":");
    const player = this.getPlayerIdentifier(playerId);

    const selectParams = new Map();
    const newParams = new Map();
    if (this.isPlayerSelf(playerId)) {
      selectParams.set("suit", suit);
      selectParams.set("number", number);
    } else {
      newParams.set("suit", suit);
      newParams.set("number", number);
    }
    newParams.set("fieldPlayer", player);

    const cardField = this.cardFields.get("hand").select("player", player);
    const func = cardField.moveTo(
      selectParams,
      this.cardFields.get("playing-area"),
      newParams,
      1,
    );
    await this.awaitCardTransitions(func);
  }

  cmdResults(...results) {
    const table = document.getElementById("results-table");
    const sortedResults = Array.from(
      results.map((n) => Number.parseInt(n)).entries(),
    ).sort(([, a], [, b]) => b - a);
    for (const [playerId, points] of sortedResults) {
      const row = table.insertRow();
      if (this.isPlayerSelf(playerId)) {
        row.classList.add("self");
      }
      const playerCell = row.insertCell();
      playerCell.textContent = this.players[playerId];
      const pointsCell = row.insertCell();
      pointsCell.textContent = points;
    }
    document.getElementById("results").showPopover();
  }

  camelToKebab(str) {
    return str.replaceAll(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
  }

  snakeToCamel(str, capitalized = false) {
    const out = str.replaceAll(/_[a-z]/g, (m) => m.at(-1).toUpperCase());
    if (capitalized) {
      return this.capitalizeFirst(out);
    }
    return out;
  }

  capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

export { BaseGame };
