import { BaseGame } from "./base.js";

class Scopa extends BaseGame {
  get playerIdentifiers() {
    return ["opponent", "self"];
  }

  get handSize() {
    return 6;
  }

  get cardFieldGenerators() {
    return [
      ["hand", ["player"], this.handSize],
      ["playing-area", [], 13],
      ["points-scopa", ["player"], 18],
    ];
  }

  get deckGenerators() {
    return [
      ["deck", []],
      ["points", ["player"]],
    ];
  }

  getPlayerIdentifier(playerId) {
    return Number.parseInt(playerId) === this.playerSide ? "self" : "opponent";
  }

  onGameAreaClick(event) {
    if (!("playing" in this.gameArea.dataset && event.target.matches(".card"))) {
      return;
    }

    const cmd = this.gameArea.dataset.playingStatus;
    const camelCmd = this.snakeToCamel(cmd, true);
    const func = this[`onGameAreaClickStatus${camelCmd}`];

    if (!func) {
      console.warn(`Unhandled click status onGameAreaClickStatus${camelCmd}`);
      return;
    }

    func.bind(this)(event);
  }

  onGameAreaClickStatusHand(event) {
    if (!event.target.matches(".card[data-position='hand'][data-player='self']")) {
      return;
    }

    delete this.gameArea.dataset.playing;
    this.send("play", `${event.target.dataset.suit}:${event.target.dataset.number}`);
  }

  onGameAreaClickStatusCapture(event) {
    if (!event.target.matches(".card[data-position='playing-area']")) {
      return;
    }

    const cardObj = event.target;
    if (["takeable", "selected"].every((e) => !(e in cardObj.dataset))) {
      return;
    }

    delete this.gameArea.dataset.playing;
    this.send("take_choice", `${cardObj.dataset.suit}:${cardObj.dataset.number}`);
  }

  async cmdBegin() {
    await super.cmdBegin();

    this.decks.get("deck").instantiate(
      new Map([
        ["deck", "br"],
        ["deckCount", 40],
      ]),
    );
    for (const player of ["self", "opponent"]) {
      this.decks
        .get("points")
        .select("player", player)
        .instantiate(
          new Map([
            ["deck", "tr"],
            ["deckCount", 0],
          ]),
        );
    }

    await this.awaitCardTransitions();
  }

  async cmdAddToTable(card) {
    const [suit, number] = card.split(":");

    const deck = this.decks.get("deck");
    const func = deck.moveTo(
      this.cardFields.get("playing-area"),
      new Map([
        ["suit", suit],
        ["number", number],
      ]),
    );
    await this.awaitCardTransitions(func);
  }

  cmdTurnStatus(status) {
    this.gameArea.dataset.playingStatus = status;
  }

  cmdActivateCard(playerId, activeCard) {
    const [suit, number] = activeCard.split(":");
    const player = this.getPlayerIdentifier(playerId);

    const params = new Map();
    if (this.isPlayerSelf(playerId)) {
      params.set("suit", suit);
      params.set("number", number);
    }

    const cardField = this.cardFields.get("hand").select("player", player);
    const [cardObj] = cardField.getCards(params, 1);

    this.addCardParams(
      cardObj,
      new Map([
        ["suit", suit],
        ["number", number],
        ["active", ""],
      ]),
    );

    // no animation: to increase the fluidity, the card to be taken may be
    // clicked just after activating this one
  }

  cmdCaptureTakeableCards(...cards) {
    const cardField = this.cardFields.get("playing-area");
    for (const card of cards) {
      const [suit, number] = card.split(":");
      const [cardObj] = cardField.getCards(
        new Map([
          ["suit", suit],
          ["number", number],
        ]),
        1,
      );

      this.toggleCardParam(cardObj, "takeable");
    }

    // no animation: same reason as cmdActivateCard(...)
  }

  cmdCaptureSelectedCards(...cards) {
    const cardField = this.cardFields.get("playing-area");
    for (const card of cards) {
      const [suit, number] = card.split(":");
      const [cardObj] = cardField.getCards(
        new Map([
          ["suit", suit],
          ["number", number],
        ]),
        1,
      );

      this.toggleCardParam(cardObj, "selected");
    }

    // no animation: same reason as cmdActivateCard(...)
  }

  cmdPoints(playerId, amount) {
    const player = this.getPlayerIdentifier(playerId);

    this.decks.get("points").select("player", player).setCount(amount);
  }

  async cmdTake(playerId, isScopa) {
    await this.sleep(2 * this.transitionDuration);

    const player = this.getPlayerIdentifier(playerId);

    // take all the selected cards from the table and place them in the points deck
    const tableCardField = this.cardFields.get("playing-area");
    const tableFunc = tableCardField.moveTo(
      new Map([["selected", ""]]),
      this.decks.get("points").select("player", player),
      new Map(),
    );

    // move the card in hand to either the scopa count or the points deck
    const handCardField = this.cardFields.get("hand").select("player", player);
    const dest = (
      Number(isScopa) > 0
        ? this.cardFields.get("points-scopa")
        : this.decks.get("points")
    ).select("player", player);

    const handFunc = handCardField.moveTo(
      new Map([["active", ""]]),
      dest,
      new Map(),
      1,
    );

    await this.awaitCardTransitions(() => {
      tableFunc();
      handFunc();
    });
  }

  async cmdPointsScopa(playerId, ...cards) {
    const player = this.getPlayerIdentifier(playerId);
    const deck = this.decks.get("deck");
    const cardField = this.cardFields.get("points-scopa").select("player", player);

    const funcs = [];
    for (const card of cards) {
      const [suit, number] = card.split(":");
      const func = deck.moveTo(
        cardField,
        new Map([
          ["suit", suit],
          ["number", number],
        ]),
      );
      funcs.push(func);
    }
    await this.awaitCardTransitions(() => {
      for (const func of funcs) {
        if (func !== undefined) {
          func();
        }
      }
    });
  }

  async cmdTakeAll(playerId) {
    await this.sleep(2 * this.transitionDuration);

    const player = this.getPlayerIdentifier(playerId);

    const tableCardField = this.cardFields.get("playing-area");
    const tableFunc = tableCardField.moveTo(
      new Map(),
      this.decks.get("points").select("player", player),
      new Map(),
    );

    await this.awaitCardTransitions(tableFunc);
  }

  cmdResultsPrepare() {
    const table = document.getElementById("results-table");
    table.classList.add("contracted");
    const tHead = table.createTHead().insertRow();
    for (let i = 0; i < 7; i++) {
      tHead.insertCell();
    }

    const tBody = table.createTBody();
    for (const [playerId, playerName] of this.players.entries()) {
      const row = tBody.insertRow();
      if (this.isPlayerSelf(playerId)) {
        row.classList.add("self");
      }
      const playerCell = row.insertCell();
      playerCell.textContent = playerName;

      // points, cards, denari, primera, settebello, scopae
      for (let i = 0; i < 6; i++) {
        row.insertCell();
      }
    }

    const footerCell = table.createTFoot().insertRow().insertCell();
    footerCell.colSpan = 7;
    const btn = document.createElement("input");
    btn.type = "button";
    btn.value = "Details";
    btn.onclick = () => table.classList.toggle("contracted");

    footerCell.appendChild(btn);
  }

  cmdResultsDetail(type, ...args) {
    const resultsCells = new Map([
      ["cards", 3],
      ["denari", 4],
      ["primiera", 5],
      ["settebello", 6],
      ["scopa", 7],
    ]);
    const resultsTitles = new Map([
      ["cards", "Carte"],
      ["denari", "Denari"],
      ["primiera", "Primiera"],
      ["settebello", "Settebello"],
      ["scopa", "Scope"],
    ]);
    const colId = resultsCells.get(type);

    const table = document.getElementById("results-table");
    const tHead = table.createTHead();
    const titleCell = tHead.querySelector(`tr > td:nth-child(${colId})`);
    titleCell.textContent = resultsTitles.get(type);
    titleCell.dataset.detailType = type;

    const tBody = table.tBodies[0];
    for (const playerId of this.players.keys()) {
      const cell = tBody.querySelector(
        `tr:nth-child(${playerId + 1}) > td:nth-child(${colId})`,
      );
      cell.dataset.detailType = type;

      const value = Number.parseInt(args[playerId]);
      if (type === "primiera") {
        const values = args
          .slice(2)
          .filter((_v, i) => (i - playerId - 1) % 3 === 0)
          .map((v) => {
            if (["fante", "cavallo", "re"].includes(v)) {
              return v[0].toUpperCase();
            }
            return Number.parseInt(v) === 0 ? " " : v;
          });
        const span = document.createElement("span");
        span.textContent = values.join("");
        cell.append(`${value} `, span);
      } else if (type === "settebello") {
        cell.textContent = value > 0 ? "✕" : "";
      } else if (type === "scopa") {
        cell.textContent = value > 0 ? value : "";
      } else {
        cell.textContent = value;
      }

      if (type !== "scopa") {
        if (value > Number.parseInt(args[1 - playerId])) {
          cell.dataset.winner = "";
        }
      } else if (value > 0) {
        cell.dataset.winner = "";
      }
    }
  }

  cmdResults(...results) {
    const tBody = document.getElementById("results-table").tBodies[0];
    const sortedResults = Array.from(
      results.map((n) => Number.parseInt(n)).entries(),
    ).sort(([, a], [, b]) => b - a);

    const rows = Array.from(tBody.querySelectorAll("tr"));

    for (const [playerId, points] of sortedResults) {
      // the row gets appended to the end to guarantee the correct order, so the
      // first row should be updated every time
      const row = rows[playerId];
      const cell = row.querySelector("td:nth-child(2)");
      cell.textContent = points;

      tBody.appendChild(row);
    }
    document.getElementById("results").showPopover();
  }
}

window.scopa = new Scopa();
