import { Briscola } from "./briscola.js";

export class Briscolone extends Briscola {
  constructor() {
    super();
    this.biddingPhase = true;
  }

  get playerIdentifiers() {
    return ["opponent1", "opponent2", "opponent3", "opponent4", "self"];
  }

  get handSize() {
    return 8;
  }

  getPlayerIdentifier(playerId) {
    return Number.parseInt(playerId) === this.playerSide
      ? "self"
      : `opponent${(5 + playerId - this.playerSide) % 5}`;
  }

  async createDecks() {
    const deck = this.createCard(
      new Map([
        ["position", "deck"],
        ["deck", "br"],
        ["back", ""],
        ["deckCount", 40],
      ]),
    );
    const pointsOpponent1 = this.createCard(
      new Map([
        ["position", "points"],
        ["player", "opponent1"],
        ["deck", "br"],
        ["back", ""],
        ["deckCount", 0],
      ]),
    );
    const pointsOpponent2 = this.createCard(
      new Map([
        ["position", "points"],
        ["player", "opponent2"],
        ["deck", "tr"],
        ["rotated", ""],
        ["back", ""],
        ["deckCount", 0],
      ]),
    );
    const pointsOpponent3 = this.createCard(
      new Map([
        ["position", "points"],
        ["player", "opponent3"],
        ["deck", "tr"],
        ["rotated", ""],
        ["back", ""],
        ["deckCount", 0],
      ]),
    );
    const pointsOpponent4 = this.createCard(
      new Map([
        ["position", "points"],
        ["player", "opponent4"],
        ["deck", "br"],
        ["back", ""],
        ["deckCount", 0],
      ]),
    );
    const pointsSelf = this.createCard(
      new Map([
        ["position", "points"],
        ["player", "self"],
        ["deck", "tr"],
        ["rotated", ""],
        ["back", ""],
        ["deckCount", 0],
      ]),
    );
    this.decks.set("deck", await deck);
    this.decks.set("pointsOpponent1", await pointsOpponent1);
    this.decks.set("pointsOpponent2", await pointsOpponent2);
    this.decks.set("pointsOpponent3", await pointsOpponent3);
    this.decks.set("pointsOpponent4", await pointsOpponent4);
    this.decks.set("pointsSelf", await pointsSelf);
  }

  getDrawnCardParams(playerId) {
    const params = super.getDrawnCardParams(playerId);
    if (params.get("player") === "opponent1") {
      params.set("rotated", "back");
    } else if (params.get("player") === "opponent4") {
      params.set("rotated", "");
    }
    return params;
  }

  async cmdBegin() {
    this.bidding = true;
    await super.cmdBegin();
  }

  async cmdTurn() {
    if (this.bidding) {
      this.gameArea.dataset.bidding = "";
    } else {
      await super.cmdTurn();
    }
  }

  /*cmdPoints(playerId, amount) {
    const player = this.getPlayerIdentifier(playerId);
    const deckId = `points${player[0].toUpperCase()}${player.slice(1)}`;
    this.cmdDeckCount(deckId, amount);
  }*/

  /*async cmdTake(playerId) {
    await this.sleep(1000);
    const player = this.getPlayerIdentifier(playerId);
    const deckId = `points${player[0].toUpperCase()}${player.slice(1)}`;
    const cards = this.gameArea.querySelectorAll(".card[data-position='playing-area']");
    await Promise.all(Array.from(cards, (card) => this.moveCardToDeck(card, deckId)));
  }*/
}

if (document.getElementById("game-area").dataset.game === "briscolone") {
  new Briscolone().setup();
}
