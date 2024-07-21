import { BaseGame } from "./base.js";

class Briscola extends BaseGame {
  get playerIdentifiers() {
    return ["opponent", "self"];
  }

  get handSize() {
    return 3;
  }

  onGameAreaClick(event) {
    if (
      "playing" in this.gameArea.dataset &&
      event.target.matches(".card[data-position='hand'][data-player='self']")
    ) {
      delete this.gameArea.dataset.playing;
      this.send("play", event.target.dataset.suit, event.target.dataset.number);
    }
  }

  getPlayerIdentifier(playerId) {
    return Number.parseInt(playerId) === this.playerSide ? "self" : "opponent";
  }

  async cmdBegin() {
    await super.cmdBegin();
    const deck = this.createCard(
      new Map([
        ["position", "deck"],
        ["deck", "br"],
        ["back", ""],
        ["deckCount", 40],
      ]),
    );
    const pointsOpponent = this.createCard(
      new Map([
        ["position", "points"],
        ["player", "opponent"],
        ["deck", "tr"],
        ["rotated", ""],
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
    this.decks.set("pointsOpponent", await pointsOpponent);
    this.decks.set("pointsSelf", await pointsSelf);
  }

  async cmdShowBriscola(suit, number) {
    await this.moveCardFromDeck(
      new Map([
        ["position", "briscola"],
        ["rotated", ""],
        ["suit", suit],
        ["number", number],
      ]),
    );
  }

  async cmdDrawBriscola(playerId) {
    const card = this.gameArea.querySelector(".card[data-position='briscola']");
    await this.awaitTransition(card, () => {
      card.dataset.position = "hand";
      card.dataset.player = this.getPlayerIdentifier(playerId);
      delete card.dataset.rotated;
      if (Number.parseInt(playerId) !== this.playerId) {
        card.dataset.back = "";
        delete card.dataset.suit;
        delete card.dataset.number;
      }
    });
  }

  cmdPoints(playerId, amount) {
    const player = this.getPlayerIdentifier(playerId);
    const deckId = `points${player[0].toUpperCase()}${player.slice(1)}`;
    this.cmdDeckCount(deckId, amount);
  }

  async cmdTake(playerId) {
    await this.sleep(1000);
    const player = this.getPlayerIdentifier(playerId);
    const deckId = `points${player[0].toUpperCase()}${player.slice(1)}`;
    const cards = this.gameArea.querySelectorAll(".card[data-position='playing-area']");
    await Promise.all(Array.from(cards, (card) => this.moveCardToDeck(card, deckId)));
  }
}

new Briscola();
