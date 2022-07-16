export class Snapshot {
  private id: string;
  private version: number;
  private stateBins: string[]; //set of state bins
  private initialTime?: string;
  private finalTime?: string;
  private transactions: string[];

  constructor(
    id: string,
    stateBins: string[],
    // initialTime: string,
    // finalTime: string,
    transactions: string[],
  ) {
    this.id = id;
    this.version = stateBins.length;
    this.stateBins = stateBins;
    // this.initialTime = initialTime;
    // this.finalTime = finalTime;
    this.transactions = transactions;
  }

  public printSnapshot(): string {
    return (
      "SNAPSHOT: \n " +
      this.id +
      " \n " +
      this.getVersion() +
      " \n " +
      this.stateBins +
      " \n " +
      this.transactions.toString()
    );
  }

  private getVersion(): string {
    return this.stateBins.length.toString();
  }
}
