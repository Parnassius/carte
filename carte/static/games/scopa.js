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

  cmdResults(...results) {
    super.cmdResults(...results);
  }
}

window.scopa = new Scopa();
