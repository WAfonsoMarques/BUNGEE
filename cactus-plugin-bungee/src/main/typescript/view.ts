import { Snapshot } from "./snapshot";

export class View {
  private snapshot;
  private tI;
  private tF;

  constructor(tI: string, tF: string, snapshot: Snapshot) {
    this.tI = tI;
    this.tF = tF;
    this.snapshot = snapshot;
    this.pruneSnapshot();
  }

  private pruneSnapshot(): void {
    this.snapshot.pruneStates(this.tI, this.tF);
  }

  public getViewStr(): string {
    return this.snapshot.getSnapShotJson();
  }
}
